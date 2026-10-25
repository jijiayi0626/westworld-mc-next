import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { runRconCommand, resolveRconTarget } from "./rcon";
import { queueAdminMail } from "../lib/notify";
import { escapeHtml } from "../lib/mail";

const app = new Hono<AppEnv>();

// —— 经济插件对接（RCON 指令模板） ——

export interface EconomyConfig {
  enabled: boolean;
  currency_name: string;      // 游戏币名称，如「金币」
  balance_cmd: string;        // 查询余额，如 eco get {player} / balance {player}
  deduct_cmd: string;         // 扣款，如 eco take {player} {amount}
}

const DEFAULT_ECONOMY: EconomyConfig = {
  enabled: false,
  currency_name: "金币",
  balance_cmd: "eco get {player}",
  deduct_cmd: "eco take {player} {amount}",
};

export async function loadEconomyConfig(db: D1Database): Promise<EconomyConfig> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'shop_economy'").first<{ value: string }>();
  if (!row) return { ...DEFAULT_ECONOMY };
  try {
    return { ...DEFAULT_ECONOMY, ...(JSON.parse(row.value) as Partial<EconomyConfig>) };
  } catch {
    return { ...DEFAULT_ECONOMY };
  }
}

function fillTemplate(tpl: string, player: string, amount: string): string {
  return tpl.replace(/\{player\}/g, player).replace(/\{amount\}/g, amount).replace(/\{mc_name\}/g, player);
}

/** 用户绑定的 MC 玩家名：优先已通过的入服申请，其次微软绑定；都没有则返回 null（禁止回退到站点用户名） */
async function resolveMcName(db: D1Database, userId: number): Promise<string | null> {
  const app1 = await db.prepare(
    "SELECT mc_name FROM whitelist_applications WHERE user_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1",
  ).bind(userId).first<{ mc_name: string }>();
  if (app1?.mc_name) return app1.mc_name;
  const ms = await db.prepare("SELECT mc_username FROM microsoft_bindings WHERE user_id = ? LIMIT 1").bind(userId).first<{ mc_username: string }>();
  if (ms?.mc_username) return ms.mc_username;
  return null;
}

/** 从 RCON 输出中提取余额数字 */
function parseBalance(output: string): number | null {
  const m = output.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

// —— 库存与自动发货 ——

const DELIVERY_MAX_ATTEMPTS = 30;
const DELIVERY_RETRY_SECONDS = 60;

/** 扣减库存；stock = -1 表示不限量。返回 false = 库存不足 */
async function takeStock(db: D1Database, productId: number, qty: number): Promise<boolean> {
  const res = await db.prepare(
    "UPDATE shop_products SET stock = stock - ? WHERE id = ? AND stock >= ?",
  ).bind(qty, productId, qty).run();
  if (Number(res.meta.changes) > 0) return true;
  const row = await db.prepare("SELECT stock FROM shop_products WHERE id = ?")
    .bind(productId).first<{ stock: number }>();
  return !!row && Number(row.stock) === -1;
}

async function restoreStock(db: D1Database, productId: number, qty: number): Promise<void> {
  await db.prepare("UPDATE shop_products SET stock = stock + ? WHERE id = ? AND stock >= 0")
    .bind(qty, productId).run();
}

interface DeliveryOrder {
  id: number;
  order_no: string;
  user_id: number;
  product_id: number;
  product_name: string;
  qty: number;
  total: number;
  currency: string;
  status: string;
  mc_name: string;
  delivery_cmd: string;
  delivery_attempts: number;
  delivery_status: string;
}

/** 渲染发货指令：{player} {qty} {order_no} {product} {amount} */
function renderDeliveryCmd(tpl: string, order: DeliveryOrder, player: string): string {
  return tpl
    .replace(/\{player\}/g, player)
    .replace(/\{qty\}/g, String(order.qty))
    .replace(/\{order_no\}/g, order.order_no)
    .replace(/\{product\}/g, order.product_name)
    .replace(/\{amount\}/g, String(order.total));
}

/**
 * 执行一次自动发货。失败会写入重试队列，由 cron（每 5 分钟）继续补发。
 * 返回 true 表示已成功送达（或无需发货）。
 */
export async function deliverOrder(env: AppEnv["Bindings"], orderId: number): Promise<boolean> {
  const order = await env.DB.prepare(
    `SELECT id, order_no, user_id, product_id, product_name, qty, total, currency, status, mc_name,
            delivery_cmd, delivery_attempts, delivery_status
     FROM shop_orders WHERE id = ?`,
  ).bind(orderId).first<DeliveryOrder>();
  if (!order) return false;
  if (order.status !== "paid") return false;
  if (order.delivery_status === "sent" || order.delivery_status === "skipped") return true;

  const cmdTpl = (order.delivery_cmd || "").trim();
  if (!cmdTpl) {
    await env.DB.prepare(
      "UPDATE shop_orders SET delivery_status = 'skipped', delivery_log = ? WHERE id = ?",
    ).bind("商品未配置自动发货指令，请手动发货", orderId).run();
    return false;
  }

  const mcName = order.mc_name || (await resolveMcName(env.DB, order.user_id)) || "";
  if (!mcName) {
    await env.DB.prepare(
      "UPDATE shop_orders SET delivery_status = 'skipped', delivery_log = ? WHERE id = ?",
    ).bind("用户未绑定游戏名，无法自动发货", orderId).run();
    return false;
  }

  const attempts = Number(order.delivery_attempts) + 1;
  const server = await resolveRconTarget({ env });
  if (!server || !server.password) {
    await env.DB.prepare(
      `UPDATE shop_orders SET delivery_status = 'failed', delivery_attempts = ?,
         delivery_log = ?, next_retry_at = datetime('now', ?) WHERE id = ?`,
    ).bind(attempts, "未配置 RCON 服务器密码", `+${DELIVERY_RETRY_SECONDS} seconds`, orderId).run();
    return false;
  }

  const cmd = renderDeliveryCmd(cmdTpl, order, mcName);
  const res = await runRconCommand({ env }, server.host, server.port, server.password, cmd, 10);
  if (res.ok) {
    await env.DB.prepare(
      `UPDATE shop_orders SET status = 'completed', delivery_status = 'sent', delivery_attempts = ?,
         delivery = ?, delivery_log = ?, completed_at = datetime('now'), next_retry_at = NULL
       WHERE id = ?`,
    ).bind(attempts, cmd, (res.output || "OK").slice(0, 1000), orderId).run();
    return true;
  }

  const exhausted = attempts >= DELIVERY_MAX_ATTEMPTS;
  await env.DB.prepare(
    `UPDATE shop_orders SET delivery_status = ?, delivery_attempts = ?, delivery_log = ?,
       next_retry_at = CASE WHEN ? THEN NULL ELSE datetime('now', ?) END
     WHERE id = ?`,
  )
    .bind(
      exhausted ? "exhausted" : "failed",
      attempts,
      (res.message || "RCON 执行失败").slice(0, 1000),
      exhausted ? 1 : 0,
      `+${DELIVERY_RETRY_SECONDS} seconds`,
      orderId,
    )
    .run();
  return false;
}

/** cron：补发所有到期待重试的订单 */
export async function processDeliveryQueue(env: AppEnv["Bindings"]): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM shop_orders
     WHERE status = 'paid' AND delivery_status IN ('pending','failed')
       AND delivery_attempts < ?
       AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
     ORDER BY id ASC LIMIT 20`,
  ).bind(DELIVERY_MAX_ATTEMPTS).all<{ id: number }>();
  for (const row of results) {
    try {
      await deliverOrder(env, row.id);
    } catch {
      // 单笔失败不影响其余订单
    }
  }
}

/** cron：30 分钟未支付的订单自动取消并归还库存（经济币订单需人工核对，不在此处理） */
export async function expireStaleOrders(env: AppEnv["Bindings"]): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, product_id, qty FROM shop_orders
     WHERE status = 'pending' AND provider != 'economy'
       AND created_at <= datetime('now','-30 minutes') LIMIT 50`,
  ).all<{ id: number; product_id: number; qty: number }>();
  for (const o of results) {
    const res = await env.DB.prepare(
      "UPDATE shop_orders SET status = 'cancelled', delivery_log = '超时未支付，已自动取消' WHERE id = ? AND status = 'pending'",
    ).bind(o.id).run();
    if (Number(res.meta.changes) > 0) {
      await restoreStock(env.DB, o.product_id, Number(o.qty) || 1);
    }
  }
}

// —— 商品（公开） ——

app.get("/products", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, sort, active, stock FROM shop_products WHERE active = 1 ORDER BY sort ASC, id ASC",
  ).all();
  return ok(results);
});

app.get("/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, active, stock FROM shop_products WHERE id = ? AND active = 1",
  ).bind(id).first();
  if (!row) return fail("商品不存在", 404);
  return ok(row);
});

// —— 用户端：经济信息与余额 ——

function publicEconomy(cfg: EconomyConfig) {
  return {
    enabled: cfg.enabled,
    currency_name: cfg.currency_name,
    balance_cmd: cfg.balance_cmd,
    deduct_cmd: cfg.deduct_cmd,
  };
}

/** 经济支付开通信息（登录用户）：是否启用 + 游戏币名称 + 绑定的 MC 玩家名 */
app.get("/economy-info", requireAuth, async (c) => {
  const cfg = await loadEconomyConfig(c.env.DB);
  if (!cfg.enabled) return ok({ enabled: false });
  const user = c.get("user")!;
  const mcName = await resolveMcName(c.env.DB, user.id);
  return ok({ enabled: true, currency_name: cfg.currency_name, mc_name: mcName, bound: !!mcName });
});

/** 查询我的游戏余额（通过 RCON） */
app.get("/balance", requireAuth, async (c) => {
  const cfg = await loadEconomyConfig(c.env.DB);
  if (!cfg.enabled) return fail("经济支付未启用", 400);
  const user = c.get("user")!;
  const mcName = await resolveMcName(c.env.DB, user.id);
  if (!mcName) return fail("请先通过入服申请或绑定微软账号，再查询游戏余额", 400);
  const server = await resolveRconTarget(c);
  if (!server || !server.password) return fail("未配置 RCON 服务器，无法查询余额", 502);

  const data = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.balance_cmd, mcName, "0"), 8);
  if (!data.ok) return fail(data.message || "余额查询失败", 502);
  const balance = parseBalance(data.output || "");
  if (balance === null) return fail("无法从服务器输出中解析余额，请联系管理员调整解析配置", 502);
  return ok({ balance, currency_name: cfg.currency_name, mc_name: mcName });
});

// —— 用户端：创建订单 ——

app.use("/order", requireAuth);

app.post("/order", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const productId = Number(body.product_id);
  const qty = Math.min(Math.max(Number(body.qty) || 1, 1), 99);
  const payEconomy = body.payment_method === "economy";

  const product = await c.env.DB.prepare(
    "SELECT id, name, price, currency, active, stock, delivery_cmd FROM shop_products WHERE id = ? AND active = 1",
  ).bind(productId).first<{
    id: number;
    name: string;
    price: number;
    currency: string;
    stock: number;
    delivery_cmd: string;
  }>();
  if (!product) return fail("商品不存在或已下架", 404);

  const rand = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const orderNo = `SO${Date.now()}${rand}`;
  const total = Math.round(product.price * qty * 100) / 100;
  // 下单时锁定游戏名，后续发货不再依赖绑定关系是否变化
  const mcName = await resolveMcName(c.env.DB, user.id);

  // 经济支付：严格绑定 MC 身份 → 查余额 → 落单 → 扣款 → 回查确认
  let currency = product.currency;
  if (payEconomy) {
    const cfg = await loadEconomyConfig(c.env.DB);
    if (!cfg.enabled) return fail("经济支付未启用", 400);
    const server = await resolveRconTarget(c);
    if (!server || !server.password) return fail("未配置 RCON 服务器，暂无法使用游戏币支付", 502);
    if (!mcName) return fail("请先通过入服申请或绑定微软账号，再使用游戏币支付", 400);
    const amount = String(total);
    currency = cfg.currency_name;

    const balRes = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.balance_cmd, mcName, amount), 8);
    if (!balRes.ok) return fail(balRes.message || "余额查询失败", 502);
    const balance = parseBalance(balRes.output || "");
    if (balance === null) return fail("无法解析服务器余额输出，请联系管理员", 502);
    if (balance < total) return fail(`余额不足：当前 ${balance} ${cfg.currency_name}，本次需支付 ${total} ${cfg.currency_name}`, 400);

    // 先落单再扣款：即使 Worker 中途异常，也有订单可追溯
    if (!(await takeStock(c.env.DB, product.id, qty))) return fail("商品库存不足", 409);
    const ins = await c.env.DB.prepare(
      `INSERT INTO shop_orders
         (order_no, user_id, product_id, product_name, price, qty, total, currency, status, provider,
          mc_name, delivery_cmd, delivery_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'economy', ?, ?, 'pending')`,
    )
      .bind(orderNo, user.id, product.id, product.name, product.price, qty, total, currency, mcName || "", product.delivery_cmd || "")
      .run();
    const orderId = Number(ins.meta.last_row_id);

    const deductRes = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.deduct_cmd, mcName, amount), 8);
    if (!deductRes.ok) {
      // 扣款没成功：取消订单并归还库存，避免库存被永久占用
      await c.env.DB.prepare(
        "UPDATE shop_orders SET status = 'cancelled', delivery_log = ? WHERE id = ? AND status = 'pending'",
      ).bind(`扣款失败：${deductRes.message || ""}`.slice(0, 500), orderId).run();
      await restoreStock(c.env.DB, product.id, qty);
      await logOp(c.env.DB, c, user.id, "shop_order_economy_deduct_failed", `${orderNo} ${mcName} ${total}${currency}: ${deductRes.message || ""}`);
      return fail(`${deductRes.message || "扣款失败"}，订单已取消，请稍后再试`, 502);
    }

    // 扣款后重新查询余额，确认金额确实减少（只认 RCON 传输成功是不够的）
    const afterRes = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.balance_cmd, mcName, "0"), 8);
    const after = afterRes.ok ? parseBalance(afterRes.output || "") : null;
    if (after === null || after > balance - total + 0.011) {
      await logOp(c.env.DB, c, user.id, "shop_order_economy_unverified", `${orderNo} ${mcName} before=${balance} after=${after}`);
      return fail(`扣款结果未确认，订单 ${orderNo} 已保留，请联系管理员核对`, 502);
    }

    await c.env.DB.prepare(
      "UPDATE shop_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status = 'pending'",
    ).bind(orderId).run();
    await logOp(c.env.DB, c, user.id, "shop_order_economy_paid", `${orderNo} ${total}${currency}`);
    // 支付完成立即尝试自动发货；失败会留在重试队列里
    await deliverOrder(c.env, orderId);

    queueAdminMail(
      c,
      "order",
      `新订单 ${orderNo}：${product.name}`,
      `<p>用户：${escapeHtml(user.username)}（游戏名：${escapeHtml(mcName || "未绑定")}）</p>
       <p>商品：${escapeHtml(product.name)} × ${qty}</p>
       <p>金额：${total} ${escapeHtml(currency)}（游戏币支付，已到账）</p>`,
    );

    return ok({
      order_id: orderId,
      order_no: orderNo,
      total,
      currency,
      status: "paid",
      economy_paid: true,
    });
  }

  if (!(await takeStock(c.env.DB, product.id, qty))) return fail("商品库存不足", 409);
  const result = await c.env.DB.prepare(
    `INSERT INTO shop_orders
       (order_no, user_id, product_id, product_name, price, qty, total, currency, status, provider,
        mc_name, delivery_cmd, delivery_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, ?, 'pending')`,
  )
    .bind(orderNo, user.id, product.id, product.name, product.price, qty, total, currency, mcName || "", product.delivery_cmd || "")
    .run();

  queueAdminMail(
    c,
    "order",
    `新订单 ${orderNo}：${product.name}`,
    `<p>用户：${escapeHtml(user.username)}（游戏名：${escapeHtml(mcName || "未绑定")}）</p>
     <p>商品：${escapeHtml(product.name)} × ${qty}</p>
     <p>金额：${total} ${escapeHtml(currency)}（待支付）</p>`,
  );

  return ok({
    order_id: Number(result.meta.last_row_id),
    order_no: orderNo,
    total,
    currency,
    status: "pending",
    economy_paid: false,
  });
});

// 我的订单
app.get("/orders", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.product_name, o.qty, o.total, o.currency, o.status, o.delivery, o.delivery_status,
            o.paid_at, o.completed_at, o.created_at
     FROM shop_orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 50`,
  ).bind(user.id).all();
  return ok(results);
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

// —— 经济插件配置 ——

app.get("/admin/economy", async (c) => {
  const cfg = await loadEconomyConfig(c.env.DB);
  return ok(publicEconomy(cfg));
});

app.post("/admin/economy", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cfg: EconomyConfig = {
    enabled: body.enabled === true,
    currency_name: str(body.currency_name, 20).trim() || "金币",
    balance_cmd: str(body.balance_cmd, 200).trim() || DEFAULT_ECONOMY.balance_cmd,
    deduct_cmd: str(body.deduct_cmd, 200).trim() || DEFAULT_ECONOMY.deduct_cmd,
  };
  if (!cfg.balance_cmd.includes("{player}")) return fail("余额查询指令必须包含 {player} 占位符");
  if (!cfg.deduct_cmd.includes("{player}") || !cfg.deduct_cmd.includes("{amount}")) {
    return fail("扣款指令必须包含 {player} 和 {amount} 占位符");
  }

  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('shop_economy', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).bind(JSON.stringify(cfg)).run();

  await logOp(c.env.DB, c, c.get("user")!.id, "shop_economy_update", cfg.enabled ? "enabled" : "disabled");
  return ok(publicEconomy(cfg));
});

/** 测试经济配置：用表单中的余额指令对指定玩家实际执行一次 RCON 查询 */
app.post("/admin/economy/test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const balanceCmd = str(body.balance_cmd, 200).trim();
  const player = str(body.player, 40).trim();
  if (!balanceCmd) return fail("请填写余额查询指令");
  if (!balanceCmd.includes("{player}")) return fail("余额查询指令必须包含 {player} 占位符");
  if (!player) return fail("请填写测试玩家名（需在线）");

  const server = await resolveRconTarget(c);
  if (!server || !server.password) return fail("没有配置了 RCON 密码的服务器，请先在「入服申请 → 白名单同步」中填写 RCON 密码", 400);

  const data = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(balanceCmd, player, "0"), 8);
  if (!data.ok) return fail(data.message || "RCON 执行失败", 502);
  const output = data.output || "";
  const balance = parseBalance(output);
  return ok({ output, balance, parsed: balance !== null });
});

app.get("/admin/products", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, description, price, currency, category, sort, active, stock, delivery_cmd, created_at FROM shop_products ORDER BY id DESC",
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
  const stock = Number.isFinite(Number(body.stock)) ? Math.max(-1, Math.trunc(Number(body.stock))) : -1;
  const deliveryCmd = str(body.delivery_cmd, 500).trim();
  if (!name || !Number.isFinite(price) || price < 0) return fail("商品名与价格不合法");
  if (deliveryCmd && !deliveryCmd.includes("{player}")) return fail("发货指令必须包含 {player} 占位符");

  await c.env.DB.prepare(
    `INSERT INTO shop_products (name, description, price, currency, category, sort, active, stock, delivery_cmd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(name, description, price, currency, category, sort, active, stock, deliveryCmd).run();
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
  const stock = Number.isFinite(Number(body.stock)) ? Math.max(-1, Math.trunc(Number(body.stock))) : -1;
  const deliveryCmd = str(body.delivery_cmd, 500).trim();
  if (!name || !Number.isFinite(price) || price < 0) return fail("商品名与价格不合法");
  if (deliveryCmd && !deliveryCmd.includes("{player}")) return fail("发货指令必须包含 {player} 占位符");

  await c.env.DB.prepare(
    `UPDATE shop_products SET name = ?, description = ?, price = ?, currency = ?, category = ?, sort = ?, active = ?, stock = ?, delivery_cmd = ? WHERE id = ?`,
  ).bind(name, description, price, currency, category, sort, active, stock, deliveryCmd, id).run();
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
            o.provider, o.delivery, o.delivery_status, o.delivery_attempts, o.delivery_log,
            o.next_retry_at, o.mc_name, o.paid_at, o.completed_at, o.created_at, u.username
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
    `UPDATE shop_orders SET delivery = ?, delivery_status = 'sent', delivery_log = ?,
       status = 'completed', completed_at = datetime('now'), next_retry_at = NULL WHERE id = ?`,
  ).bind(delivery, "管理员手动发货", id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_order_deliver", String(id));
  return ok({ updated: true });
});

// 重新尝试自动发货（失败/耗尽后可手动重试）
app.post("/admin/order/:id/retry-delivery", async (c) => {
  const id = Number(c.req.param("id"));
  const order = await c.env.DB.prepare(
    "SELECT id, status, delivery_cmd FROM shop_orders WHERE id = ?",
  ).bind(id).first<{ id: number; status: string; delivery_cmd: string }>();
  if (!order) return fail("订单不存在", 404);
  if (order.status !== "paid") return fail("订单不是已支付状态，无法发货", 400);
  if (!(order.delivery_cmd || "").trim()) return fail("该订单没有自动发货指令，请使用手动发货", 400);

  await c.env.DB.prepare(
    "UPDATE shop_orders SET delivery_status = 'pending', delivery_attempts = 0, next_retry_at = NULL WHERE id = ?",
  ).bind(id).run();
  const delivered = await deliverOrder(c.env, id);
  await logOp(c.env.DB, c, c.get("user")!.id, "shop_order_retry_delivery", `${id} -> ${delivered ? "ok" : "fail"}`);
  const fresh = await c.env.DB.prepare(
    "SELECT delivery_status, delivery_log FROM shop_orders WHERE id = ?",
  ).bind(id).first<{ delivery_status: string; delivery_log: string }>();
  return ok({ delivered, delivery_status: fresh?.delivery_status || "", delivery_log: fresh?.delivery_log || "" });
});

export default app;