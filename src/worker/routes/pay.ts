import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// 创建支付会话（为订单生成支付链接）
app.post("/create", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const orderId = Number(body.order_id);

  const order = await c.env.DB.prepare(
    "SELECT id, order_no, total, currency, status FROM shop_orders WHERE id = ? AND user_id = ?",
  )
    .bind(orderId, user.id)
    .first<{ id: number; order_no: string; total: number; currency: string; status: string }>();
  if (!order) return fail("订单不存在", 404);
  if (order.status !== "pending") return fail("订单状态不允许支付", 400);

  // —— 支付通道占位：Creem / Stripe / 手动转账 ——
  const provider = str(body.provider, 20) || "manual";
  let payUrl = "";

  if (provider === "creem") {
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