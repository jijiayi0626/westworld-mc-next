import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";

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

// 支付回调（Creem/Stripe webhook 占位；本地演示时用 cancel/verify 模拟）
app.post("/webhook", async (c) => {
  // 生产环境需校验签名（x-api-key / stripe-signature）
  const body = await c.req.json().catch(() => ({}));

  // 占位：识别 order_no 并标记已支付
  const orderNo = str(body.request_id || body.order_no || body.metadata?.order_no, 60);
  if (orderNo) {
    await c.env.DB.prepare(
      "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now') WHERE order_no = ? AND status = 'pending'",
    ).bind(orderNo).run();
  }
  return ok({ received: true });
});

// 模拟支付成功（演示用，生产应移除或加管理员鉴权）
app.post("/verify", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const orderNo = str(body.order_no, 60).trim();
  if (!orderNo) return fail("缺少订单号");

  const result = await c.env.DB.prepare(
    "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now') WHERE order_no = ? AND user_id = ? AND status = 'pending'",
  ).bind(orderNo, user.id).run();
  if (result.meta.changes === 0) return fail("订单不存在或已处理", 400);
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