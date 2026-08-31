import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// —— 商品（公开） ——

app.get("/products", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, sort, active FROM shop_products WHERE active = 1 ORDER BY sort ASC, id ASC",
  ).all();
  return ok(results);
});

app.get("/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, active FROM shop_products WHERE id = ? AND active = 1",
  ).bind(id).first();
  if (!row) return fail("商品不存在", 404);
  return ok(row);
});

// —— 用户端：创建订单 ——

app.use("/order", requireAuth);

app.post("/order", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const productId = Number(body.product_id);
  const qty = Math.min(Math.max(Number(body.qty) || 1, 1), 99);

  const product = await c.env.DB.prepare(
    "SELECT id, name, price, currency, active FROM shop_products WHERE id = ? AND active = 1",
  ).bind(productId).first<{ id: number; name: string; price: number; currency: string }>();
  if (!product) return fail("商品不存在或已下架", 404);

  const orderNo = `SO${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const total = Math.round(product.price * qty * 100) / 100;

  const result = await c.env.DB.prepare(
    `INSERT INTO shop_orders (order_no, user_id, product_id, product_name, price, qty, total, currency, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  )
    .bind(orderNo, user.id, product.id, product.name, product.price, qty, total, product.currency)
    .run();

  return ok({ order_id: Number(result.meta.last_row_id), order_no: orderNo, total, currency: product.currency });
});

// 我的订单
app.get("/orders", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.product_name, o.qty, o.total, o.currency, o.status, o.paid_at, o.created_at
     FROM shop_orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 50`,
  ).bind(user.id).all();
  return ok(results);
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/products", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, sort, active, created_at FROM shop_products ORDER BY id DESC",
  ).all();
  return ok(results);
});

app.post("/admin/product", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 100).trim();
  const description = str(body.description, 2000).trim();
  const price = Number(body.price);
  const currency = str(body.currency, 10) || "CNY";
  const category = str(body.category, 50);
  const sort = Number(body.sort) || 0;
  const active = body.active === false ? 0 : 1;
  if (!name || !Number.isFinite(price) || price < 0) return fail("商品名与价格不合法");

  await c.env.DB.prepare(
    `INSERT INTO shop_products (name, description, price, currency, category, sort, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(name, description, price, currency, category, sort, active).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_product_create", name);
  return ok({ created: true });
});

app.post("/admin/product/:id/update", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 100).trim();
  const description = str(body.description, 2000).trim();
  const price = Number(body.price);
  const currency = str(body.currency, 10) || "CNY";
  const category = str(body.category, 50);
  const sort = Number(body.sort) || 0;
  const active = body.active === false ? 0 : 1;
  if (!name || !Number.isFinite(price) || price < 0) return fail("商品名与价格不合法");

  await c.env.DB.prepare(
    `UPDATE shop_products SET name = ?, description = ?, price = ?, currency = ?, category = ?, sort = ?, active = ? WHERE id = ?`,
  ).bind(name, description, price, currency, category, sort, active, id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_product_update", name);
  return ok({ updated: true });
});

app.post("/admin/product/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM shop_products WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_product_delete", String(id));
  return ok({ deleted: true });
});

app.get("/admin/orders", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.product_name, o.qty, o.total, o.currency, o.status,
            o.delivery, o.paid_at, o.created_at, u.username
     FROM shop_orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// 手动发货/标记已完成
app.post("/admin/order/:id/deliver", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const delivery = str(body.delivery, 2000);
  await c.env.DB.prepare(
    "UPDATE shop_orders SET delivery = ?, status = 'completed', completed_at = datetime('now') WHERE id = ?",
  ).bind(delivery, id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_order_deliver", String(id));
  return ok({ updated: true });
});

export default app;