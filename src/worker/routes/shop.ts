import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { runRconCommand, resolveRconTarget } from "./rcon";

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
    "SELECT id, name, price, currency, active FROM shop_products WHERE id = ? AND active = 1",
  ).bind(productId).first<{ id: number; name: string; price: number; currency: string }>();
  if (!product) return fail("商品不存在或已下架", 404);

  const rand = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const orderNo = `SO${Date.now()}${rand}`;
  const total = Math.round(product.price * qty * 100) / 100;

  // 经济支付：严格绑定 MC 身份 → 查余额 → 落单 → 扣款 → 回查确认
  let currency = product.currency;
  if (payEconomy) {
    const cfg = await loadEconomyConfig(c.env.DB);
    if (!cfg.enabled) return fail("经济支付未启用", 400);
    const server = await resolveRconTarget(c);
    if (!server || !server.password) return fail("未配置 RCON 服务器，暂无法使用游戏币支付", 502);
    const mcName = await resolveMcName(c.env.DB, user.id);
    if (!mcName) return fail("请先通过入服申请或绑定微软账号，再使用游戏币支付", 400);
    const amount = String(total);
    currency = cfg.currency_name;

    const balRes = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.balance_cmd, mcName, amount), 8);
    if (!balRes.ok) return fail(balRes.message || "余额查询失败", 502);
    const balance = parseBalance(balRes.output || "");
    if (balance === null) return fail("无法解析服务器余额输出，请联系管理员", 502);
    if (balance < total) return fail(`余额不足：当前 ${balance} ${cfg.currency_name}，本次需支付 ${total} ${cfg.currency_name}`, 400);

    // 先落单再扣款：即使 Worker 中途异常，也有订单可追溯
    const ins = await c.env.DB.prepare(
      `INSERT INTO shop_orders (order_no, user_id, product_id, product_name, price, qty, total, currency, status, provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'economy')`,
    )
      .bind(orderNo, user.id, product.id, product.name, product.price, qty, total, currency)
      .run();
    const orderId = Number(ins.meta.last_row_id);

    const deductRes = await runRconCommand(c, server.host, server.port, server.password, fillTemplate(cfg.deduct_cmd, mcName, amount), 8);
    if (!deductRes.ok) {
      await logOp(c.env.DB, c, user.id, "shop_order_economy_deduct_failed", `${orderNo} ${mcName} ${total}${currency}: ${deductRes.message || ""}`);
      return fail(`${deductRes.message || "扣款失败"}，订单 ${orderNo} 已保留，请联系管理员核对`, 502);
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

    return ok({
      order_id: orderId,
      order_no: orderNo,
      total,
      currency,
      status: "paid",
      economy_paid: true,
    });
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO shop_orders (order_no, user_id, product_id, product_name, price, qty, total, currency, status, provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'manual')`,
  )
    .bind(orderNo, user.id, product.id, product.name, product.price, qty, total, currency)
    .run();

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
    `SELECT o.id, o.order_no, o.product_name, o.qty, o.total, o.currency, o.status, o.paid_at, o.created_at
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
            o.provider, o.delivery, o.paid_at, o.created_at, u.username
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