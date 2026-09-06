import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

app.use("*", requireAuth, requireAdmin);

// 管理面板概览统计
app.get("/stats", async (c) => {
  const users = await c.env.DB.prepare("SELECT COUNT(*) AS cnt FROM users").first<{ cnt: number }>();
  const todayUsers = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM users WHERE date(created_at) = date('now')",
  ).first<{ cnt: number }>();
  const todayApps = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM whitelist_applications WHERE date(created_at) = date('now')",
  ).first<{ cnt: number }>();
  const pendingApps = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM whitelist_applications WHERE status = 'pending'",
  ).first<{ cnt: number }>();
  const approvedUnsynced = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM whitelist_applications
     WHERE status = 'approved' AND (sync_status = '' OR sync_status = 'failed' OR sync_status IS NULL)`,
  ).first<{ cnt: number }>();
  const needInfoApps = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM whitelist_applications WHERE status = 'pending' AND review_note != ''",
  ).first<{ cnt: number }>();
  const openTickets = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM support_tickets WHERE status != 'closed'",
  ).first<{ cnt: number }>();
  const pendingOrders = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM shop_orders WHERE status = 'pending'",
  ).first<{ cnt: number }>();
  const newMessages = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM contact_messages WHERE status = 'new'",
  ).first<{ cnt: number }>();

  return ok({
    users: Number(users?.cnt ?? 0),
    today_users: Number(todayUsers?.cnt ?? 0),
    today_applications: Number(todayApps?.cnt ?? 0),
    pending_applications: Number(pendingApps?.cnt ?? 0),
    approved_unsynced: Number(approvedUnsynced?.cnt ?? 0),
    need_info_applications: Number(needInfoApps?.cnt ?? 0),
    open_tickets: Number(openTickets?.cnt ?? 0),
    pending_orders: Number(pendingOrders?.cnt ?? 0),
    new_messages: Number(newMessages?.cnt ?? 0),
  });
});

// —— 用户管理 ——

app.get("/users", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.avatar, u.bio,
            u.created_at, u.last_login_at,
            (SELECT w.mc_name FROM whitelist_applications w
              WHERE w.user_id = u.id AND w.status = 'approved' ORDER BY w.id DESC LIMIT 1) AS mc_name,
            (SELECT w.status FROM whitelist_applications w
              WHERE w.user_id = u.id ORDER BY w.id DESC LIMIT 1) AS app_status
     FROM users u ORDER BY u.id DESC LIMIT 200`,
  ).all();
  const rows = (results as Record<string, unknown>[]).map((r) => {
    const completeness = [
      r.email ? 1 : 0,
      r.mc_name ? 1 : 0,
      r.avatar ? 1 : 0,
      r.bio ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    return { ...r, profile_pct: Math.round((completeness / 4) * 100) };
  });
  return ok(rows);
});

// 用户统计（总/本周新增/封禁/待审申请）
app.get("/users/stats", async (c) => {
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS c FROM users").first<{ c: number }>();
  const week = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', '-7 days')",
  ).first<{ c: number }>();
  const banned = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE status = 'banned'",
  ).first<{ c: number }>();
  const pendingApps = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM whitelist_applications WHERE status = 'pending'",
  ).first<{ c: number }>();
  return ok({
    total: Number(total?.c ?? 0),
    week_new: Number(week?.c ?? 0),
    banned: Number(banned?.c ?? 0),
    pending_applications: Number(pendingApps?.c ?? 0),
  });
});

// 封禁 / 解封 / 改角色
app.post("/users/:id/status", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = ["active", "banned"].includes(body.status) ? body.status : null;
  const role = ["user", "admin"].includes(body.role) ? body.role : null;
  if (!status && !role) return fail("无效的操作");

  if (status) {
    await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, id).run();
  }
  if (role) {
    await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
  }
  await logOp(c.env.DB, c, admin.id, "user_update", String(id), `${status || ""} ${role || ""}`.trim());
  return ok({ updated: true });
});

// —— 站点设置 ——

app.get("/settings", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT key, value FROM site_settings WHERE key NOT LIKE 'reset_code:%' ORDER BY key ASC",
  ).all();
  return ok(results);
});

app.post("/settings", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const key = str(body.key, 100).trim();
  const value = str(body.value, 10000);
  if (!key || key.startsWith("reset_code:")) return fail("无效的 key");
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).bind(key, value).run();
  await logOp(c.env.DB, c, admin.id, "setting_update", key);
  return ok({ updated: true });
});

// —— 操作日志 ——

app.get("/oplogs", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.action, o.target, o.detail, o.ip, o.created_at, u.username AS operator
     FROM op_logs o LEFT JOIN users u ON u.id = o.operator_id ORDER BY o.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// —— IP 黑名单 ——

app.get("/blacklist", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, ip, reason, created_at FROM ip_blacklist ORDER BY id DESC LIMIT 100",
  ).all();
  return ok(results);
});

app.post("/blacklist", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const ip = str(body.ip, 45).trim();
  const reason = str(body.reason, 200).trim();
  if (!ip) return fail("IP 不能为空");
  await c.env.DB.prepare(
    `INSERT INTO ip_blacklist (ip, reason) VALUES (?, ?)
     ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason`,
  ).bind(ip, reason).run();
  await logOp(c.env.DB, c, admin.id, "blacklist_add", ip, reason);
  return ok({ added: true });
});

app.post("/blacklist/delete", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  await c.env.DB.prepare("DELETE FROM ip_blacklist WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, admin.id, "blacklist_delete", String(id));
  return ok({ deleted: true });
});

export default app;