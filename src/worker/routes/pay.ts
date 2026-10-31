import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str, timingSafeEqual } from "../lib/validate";
import { logOp } from "../lib/log";
import { buildEpayPayUrl, epayEnabled, loadEpayConfig, verifyEpayNotify } from "../lib/epay";
import { deliverOrder } from "./shop";

const app = new Hono<AppEnv>();

/** Creem 回调签名：HMAC-SHA256(raw body, webhook secret) 的十六进制 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 支付成功后异步触发自动发货，不阻塞回调响应（失败由 cron 继续重试） */
function scheduleDelivery(c: Context<AppEnv>, orderId: number) {
  const task = deliverOrder(c.env, orderId).catch(() => false);
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }
}

/** 站点公开支付通道信息：前端据此展示可用支付方式 */
app.get("/config", async (c) => {
  const epay = await loadEpayConfig(c.env.DB);
  return ok({
    epay: {
      enabled: epayEnabled(epay),
      types: epay.types,
      sitename: epay.sitename,
    },
    manual: true,
  });
});

// 创建支付会话（为订单生成支付链接）
app.post("/create", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const orderId = Number(body.order_id);

  const order = await c.env.DB.prepare(
    "SELECT id, order_no, total, currency, status, product_name, qty FROM shop_orders WHERE id = ? AND user_id = ?",
  )
    .bind(orderId, user.id)
    .first<{ id: number; order_no: string; total: number; currency: string; status: string; product_name: string; qty: number }>();
  if (!order) return fail("订单不存在", 404);
  if (order.status !== "pending") return fail("订单状态不允许支付", 400);

  // —— 支付通道：易支付 / Creem / 手动转账 ——
  const provider = str(body.provider, 20) || "manual";
  const site = (c.env.SITE_URL as string) || new URL(c.req.url).origin;
  let payUrl = "";

  if (provider === "epay") {
    const cfg = await loadEpayConfig(c.env.DB);
    if (!epayEnabled(cfg)) return fail("易支付未配置，请先在后台「网站设置 → 支付配置」完成配置", 503);
    const payType = str(body.pay_type, 20) || cfg.types[0] || "alipay";
    if (!cfg.types.includes(payType)) return fail("不支持的支付方式", 400);

    payUrl = buildEpayPayUrl(cfg, {
      type: payType,
      orderNo: order.order_no,
      name: order.product_name,
      money: order.total,
      notifyUrl: `${site.replace(/\/+$/, "")}/api/pay/notify`,
      returnUrl: `${site.replace(/\/+$/, "")}/user/orders?paid=1`,
    });
    await c.env.DB.prepare("UPDATE shop_orders SET provider = ? WHERE id = ?")
      .bind(`epay:${payType}`, order.id)
      .run();
  } else if (provider === "creem") {
    const apiKey = c.env.CREEM_API_KEY as string | undefined;
    const productId = c.env.CREEM_PRODUCT_ID as string | undefined;
    if (!apiKey || !productId) return fail("Creem 支付未配置", 503);

    const apiBase = ((c.env.CREEM_API_BASE as string) || "https://api.creem.io").replace(/\/+$/, "");
    const resp = await fetch(`${apiBase}/v1/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        product_id: productId,
        request_id: order.order_no,
        units: Math.max(1, Number(order.qty) || 1),
        success_url: `${site}/user/orders?paid=1`,
        metadata: { order_no: order.order_no },
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      await logOp(c.env.DB, c, user.id, "pay_creem_create_failed", order.order_no, `${resp.status} ${detail.slice(0, 200)}`);
      return fail(`支付通道错误: ${resp.status}`, 502);
    }
    const data = (await resp.json()) as { checkout_url?: string };
    payUrl = data.checkout_url || "";
    if (!payUrl) return fail("Creem 未返回支付链接", 502);
    await c.env.DB.prepare("UPDATE shop_orders SET provider = 'creem' WHERE id = ?").bind(order.id).run();
  } else {
    // manual：提示用户联系管理员转账
    payUrl = `${site}/user/orders`; // 前端展示转账说明
  }

  return ok({ order_no: order.order_no, provider, pay_url: payUrl });
});

// —— 易支付异步通知（GET / POST 均支持，返回 success 表示已处理） ——
async function handleEpayNotify(c: Context<AppEnv>) {
  const cfg = await loadEpayConfig(c.env.DB);
  if (!epayEnabled(cfg)) return c.text("fail", 503);

  const query = c.req.query();
  let body: Record<string, string> = {};
  try {
    const raw = await c.req.parseBody();
    body = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  } catch {
    body = {};
  }
  const params = { ...query, ...body };

  const orderNo = String(params.out_trade_no || "").trim();
  if (!orderNo) return c.text("fail", 400);

  const order = await c.env.DB.prepare(
    "SELECT id, total, status FROM shop_orders WHERE order_no = ?",
  ).bind(orderNo).first<{ id: number; total: number; status: string }>();
  if (!order) return c.text("fail", 404);

  // 先验签再判断是否已支付，避免伪造通知探测订单状态
  const checked = verifyEpayNotify(params, cfg, order.total);
  if (!checked.ok) {
    await logOp(c.env.DB, c, null, "pay_epay_notify_reject", orderNo, checked.reason);
    return c.text("fail", 400);
  }
  if (order.status !== "pending") return c.text("success"); // 幂等：已处理直接应答

  const result = await c.env.DB.prepare(
    `UPDATE shop_orders SET status = 'paid', paid_at = datetime('now'), provider = ?, payment_id = ?
     WHERE order_no = ? AND status = 'pending'`,
  ).bind(`epay:${params.type || "unknown"}`, String(params.trade_no || ""), orderNo).run();

  await logOp(c.env.DB, c, null, "pay_epay_notify", orderNo, `changes=${result.meta.changes} money=${params.money}`);
  if (Number(result.meta.changes) > 0) scheduleDelivery(c, order.id);
  return c.text("success");
}

app.get("/notify", handleEpayNotify);
app.post("/notify", handleEpayNotify);

// 支付回调（Creem webhook）
// 安全：优先用 CREEM_WEBHOOK_SECRET 对原始请求体做 HMAC-SHA256 验签；
// 未配置 webhook secret 时回退到 x-api-key（兼容旧部署）。
// 同时校验事件类型、订单币种与金额，防止伪造/错配回调把订单标记为已支付。
app.post("/webhook", async (c) => {
  const raw = await c.req.text();
  const webhookSecret = (c.env.CREEM_WEBHOOK_SECRET as string | undefined) || "";
  const apiKey = c.env.CREEM_API_KEY as string | undefined;
  if (!webhookSecret && !apiKey) return fail("支付回调未配置", 503);

  if (webhookSecret) {
    const sig = (c.req.header("creem-signature") || "").trim().toLowerCase();
    const expected = await hmacSha256Hex(webhookSecret, raw);
    if (!sig || !timingSafeEqual(sig, expected)) return fail("回调签名无效", 401);
  } else {
    const headerKey =
      c.req.header("x-api-key") ||
      (c.req.header("authorization")?.startsWith("Bearer ")
        ? c.req.header("authorization")!.slice(7)
        : "");
    if (!headerKey || !apiKey || !timingSafeEqual(headerKey, apiKey)) {
      return fail("回调签名无效", 401);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail("回调数据格式错误", 400);
  }

  const eventType = str(body.eventType ?? body.event_type ?? body.type, 60);
  if (eventType && eventType !== "checkout.completed") {
    await logOp(c.env.DB, c, null, "pay_webhook_ignored", eventType);
    return ok({ received: true, ignored: true });
  }

  const obj =
    body.object && typeof body.object === "object"
      ? (body.object as Record<string, unknown>)
      : body;
  const orderObj =
    obj.order && typeof obj.order === "object"
      ? (obj.order as Record<string, unknown>)
      : {};
  const metadata =
    obj.metadata && typeof obj.metadata === "object"
      ? (obj.metadata as Record<string, unknown>)
      : {};

  const orderNo = str(
    obj.request_id ??
      orderObj.request_id ??
      orderObj.order_no ??
      obj.order_no ??
      metadata.order_no ??
      body.request_id,
    60,
  ).trim();
  if (!orderNo) return fail("缺少订单号", 400);

  const order = await c.env.DB.prepare(
    "SELECT id, total, currency, status FROM shop_orders WHERE order_no = ?",
  )
    .bind(orderNo)
    .first<{ id: number; total: number; currency: string; status: string }>();
  if (!order) return fail("订单不存在", 404);

  // checkout 状态必须为 completed，避免 processing/expired 事件提前发货
  const checkoutStatus = str(obj.status, 30);
  if (checkoutStatus && checkoutStatus !== "completed") {
    await logOp(c.env.DB, c, null, "pay_webhook_ignored", `${orderNo} status=${checkoutStatus}`);
    return ok({ received: true, ignored: true });
  }

  // Creem 金额单位为分；只在币种一致时严格比对（含税额/优惠的两种口径都接受）
  const currency = String(orderObj.currency ?? obj.currency ?? "").toUpperCase();
  const orderCurrency = String(order.currency || "").toUpperCase();
  const expectedMinor = Math.round(Number(order.total) * 100);
  if (currency && orderCurrency && currency !== orderCurrency) {
    await logOp(
      c.env.DB,
      c,
      null,
      "pay_webhook_currency_mismatch",
      `${orderNo} paid=${currency} expected=${orderCurrency}`,
    );
    return fail("支付币种不一致，请联系管理员核对", 400);
  }
  const paidAmounts = [orderObj.amount_paid, orderObj.amount, obj.amount_paid, obj.amount]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (paidAmounts.length > 0 && expectedMinor > 0 && currency) {
    const matched = paidAmounts.some((v) => Math.abs(v - expectedMinor) <= 1);
    if (!matched) {
      await logOp(
        c.env.DB,
        c,
        null,
        "pay_webhook_amount_mismatch",
        `${orderNo} paid=${paidAmounts.join("/")} expected=${expectedMinor} ${currency}`,
      );
      return fail("支付金额不一致，请联系管理员核对", 400);
    }
  }

  const result = await c.env.DB.prepare(
    "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now'), provider = 'creem' WHERE order_no = ? AND status = 'pending'",
  ).bind(orderNo).run();
  await logOp(c.env.DB, c, null, "pay_webhook", orderNo, `changes=${result.meta.changes} event=${eventType || "unknown"}`);
  if (Number(result.meta.changes) > 0) {
    const row = await c.env.DB.prepare("SELECT id FROM shop_orders WHERE order_no = ?")
      .bind(orderNo).first<{ id: number }>();
    if (row) scheduleDelivery(c, row.id);
  }
  return ok({ received: true });
});

// 手动确认收款（仅管理员：用于手动转账等线下收款场景）
// 原实现允许任意登录用户把自己的订单标记为已支付（白嫖漏洞），已改为仅管理员可操作。
app.post("/verify", requireAuth, requireAdmin, async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const orderNo = str(body.order_no, 60).trim();
  if (!orderNo) return fail("缺少订单号");

  const result = await c.env.DB.prepare(
    "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now'), provider = CASE WHEN provider = '' THEN 'manual' ELSE provider END WHERE order_no = ? AND status = 'pending'",
  ).bind(orderNo).run();
  if (result.meta.changes === 0) return fail("订单不存在或已处理", 400);
  await logOp(c.env.DB, c, admin.id, "pay_manual_confirm", orderNo);
  const row = await c.env.DB.prepare("SELECT id FROM shop_orders WHERE order_no = ?")
    .bind(orderNo).first<{ id: number }>();
  if (row) scheduleDelivery(c, row.id);
  return ok({ paid: true });
});

// 订单支付状态
app.get("/status/:orderNo", requireAuth, async (c) => {
  const user = c.get("user")!;
  const orderNo = c.req.param("orderNo");
  const row = await c.env.DB.prepare(
    "SELECT order_no, status, total, currency, provider, created_at, paid_at FROM shop_orders WHERE order_no = ? AND user_id = ?",
  )
    .bind(orderNo, user.id)
    .first();
  if (!row) return fail("订单不存在", 404);
  return ok(row);
});

export default app;