import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { buildEpayPayUrl, epayEnabled, loadEpayConfig, verifyEpayNotify } from "../lib/epay";
import { deliverOrder } from "./shop";

const app = new Hono<AppEnv>();

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
    "SELECT id, order_no, total, currency, status, product_name FROM shop_orders WHERE id = ? AND user_id = ?",
  )
    .bind(orderId, user.id)
    .first<{ id: number; order_no: string; total: number; currency: string; status: string; product_name: string }>();
  if (!order) return fail("订单不存在", 404);
  if (order.status !== "pending") return fail("订单状态不允许支付", 400);

  // —— 支付通道：易支付 / Creem / 手动转账 ——
  const provider = str(body.provider, 20) || "manual";
  let payUrl = "";

  if (provider === "epay") {
    const cfg = await loadEpayConfig(c.env.DB);
    if (!epayEnabled(cfg)) return fail("易支付未配置，请先在后台「网站设置 → 支付配置」完成配置", 503);
    const payType = str(body.pay_type, 20) || cfg.types[0] || "alipay";
    if (!cfg.types.includes(payType)) return fail("不支持的支付方式", 400);

    const site = (c.env.SITE_URL as string) || new URL(c.req.url).origin;
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
    if (c.env.CREEM_API_KEY && c.env.CREEM_PRODUCT_ID) {
      const resp = await fetch("https://creem.io/api/v1/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": c.env.CREEM_API_KEY as string,
        },
        body: JSON.stringify({
          product_id: c.env.CREEM_PRODUCT_ID,
          request_id: order.order_no,
          amount: order.total,
          currency: order.currency || "CNY",
          success_url: `${c.env.SITE_URL || "https://example.com"}/user/orders?paid=1`,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { checkout_url?: string };
        payUrl = data.checkout_url || "";
      } else {
        return fail(`支付通道错误: ${resp.status}`, 502);
      }
    } else {
      return fail("Creem 支付未配置", 503);
    }
  } else {
    // manual：提示用户联系管理员转账
    payUrl = `${c.env.SITE_URL || ""}/user/orders`; // 前端展示转账说明
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
// 安全：必须校验 x-api-key 与 CREEM_API_KEY 一致，否则任何人都能伪造回调白嫖订单。
// 未配置 CREEM_API_KEY 时直接拒绝（避免裸奔）。
app.post("/webhook", async (c) => {
  const apiKey = c.env.CREEM_API_KEY as string | undefined;
  if (!apiKey) return fail("支付回调未配置", 503);

  // Creem 回调以 x-api-key 鉴权；兼容读取 Authorization: Bearer
  const headerKey =
    c.req.header("x-api-key") ||
    (c.req.header("authorization")?.startsWith("Bearer ")
      ? c.req.header("authorization")!.slice(7)
      : "");
  if (!headerKey || headerKey !== apiKey) return fail("回调签名无效", 401);

  const body = await c.req.json().catch(() => ({}));
  const orderNo = str(body.request_id || body.order_no || body.metadata?.order_no, 60);
  if (!orderNo) return fail("缺少订单号", 400);

  const result = await c.env.DB.prepare(
    "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now'), provider = 'creem' WHERE order_no = ? AND status = 'pending'",
  ).bind(orderNo).run();
  await logOp(c.env.DB, c, null, "pay_webhook", orderNo, `changes=${result.meta.changes}`);
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