import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { upopAdminStatus } from "./upop";
import { msAdminStatus } from "./microsoft";
import { loadAiConfig } from "./ai";

const app = new Hono<AppEnv>();

app.use("*", requireAuth, requireAdmin);

// 三方接口预留状态（微软 OAuth / UPOP）
app.get("/integrations", async (c) => {
  const site = (c.env.SITE_URL as string) || "";
  const upop = await upopAdminStatus(c);
  return ok({
    microsoft: await msAdminStatus(c),
    upop: { ...upop, callback_url: `${site}/api/upop/callback` },
  });
});

// 保存微软 OAuth 配置（client_id / client_secret 留空表示保留原值）
app.post("/integrations/microsoft", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const row = await c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'ms_oauth_config'").first<{ value: string }>();
  let cur: Record<string, unknown> = {};
  if (row?.value) {
    try {
      cur = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  const clientId = str(body.client_id, 200).trim() || (typeof cur.client_id === "string" ? cur.client_id : "");
  const clientSecret = str(body.client_secret, 300).trim() || (typeof cur.client_secret === "string" ? cur.client_secret : "");
  if (!clientId || !clientSecret) return fail("Client ID 与 Client Secret 均需完整保存过一次（留空表示保留原值）");
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('ms_oauth_config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(JSON.stringify({ enabled: body.enabled === true, client_id: clientId, client_secret: clientSecret }))
    .run();
  await logOp(c.env.DB, c, admin.id, "setting_update", "ms_oauth_config");
  return ok({ saved: true });
});

// 系统健康自检：自动发现不可用的组件并给出提示
app.get("/health", async (c) => {
  type Item = { id: string; label: string; ok: boolean; detail: string };
  const items: Item[] = [];

  // 1. 数据库
  let dbOk = false;
  try {
    await c.env.DB.prepare("SELECT 1").first();
    dbOk = true;
  } catch {
    /* ignore */
  }
  items.push({ id: "db", label: "数据库 (D1)", ok: dbOk, detail: dbOk ? "连接正常" : "无法连接数据库，请检查 D1 绑定" });

  // 2. 对象存储
  let r2Ok = false;
  try {
    await c.env.ASSETS?.list({ limit: 1 });
    r2Ok = !!c.env.ASSETS;
  } catch {
    /* ignore */
  }
  items.push({ id: "r2", label: "对象存储 (R2)", ok: r2Ok, detail: r2Ok ? "连接正常" : "R2 未绑定或不可访问，图片上传不可用" });

  // 3. AI 配置
  try {
    const ai = await loadAiConfig(c.env.DB, c.env);
    const probs: string[] = [];
    if (!ai.enabled) probs.push("总开关未开启（演示模式）");
    if (!ai.api_key) probs.push("未配置 API 密钥");
    if (!ai.model) probs.push("未配置模型");
    items.push({
      id: "ai",
      label: "AI 助手",
      ok: ai.enabled && !!ai.api_key && !!ai.model,
      detail: probs.length ? probs.join("；") : `已启用（${ai.model}）`,
    });
  } catch {
    items.push({ id: "ai", label: "AI 助手", ok: false, detail: "配置读取失败" });
  }

  // 4. 微软 OAuth
  const ms = await msAdminStatus(c);
  items.push({
    id: "microsoft",
    label: "微软 OAuth 绑定",
    ok: ms.enabled,
    detail: ms.enabled ? "已启用" : "未启用（后台「网站设置 → 三方接口预留」可配置，非必选）",
  });

  // 5. UPOP
  const upop = await upopAdminStatus(c);
  items.push({
    id: "upop",
    label: "UPOP 统一认证",
    ok: upop.enabled,
    detail: upop.enabled ? "已启用" : "预留中（后台可配置，非必选）",
  });

  // 6. 定时巡检（cron）
  try {
    const [cronRow, intervalRow] = await Promise.all([
      c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'last_cron_run'").first<{ value: string }>(),
      c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'monitor_interval_minutes'").first<{ value: string }>(),
    ]);
    const interval = Math.max(5, Math.min(1440, Number(intervalRow?.value) || 15));
    const last = cronRow?.value ? new Date(cronRow.value.replace(" ", "T") + "Z").getTime() : 0;
    const fresh = last && Date.now() - last < (interval + 10) * 60_000;
    items.push({
      id: "cron",
      label: "定时巡检",
      ok: !!fresh,
      detail: fresh
        ? `运行正常（间隔 ${interval} 分钟，上次 ${cronRow?.value} UTC）`
        : "超过 1 个周期未运行，请检查 Worker Cron 触发器",
    });
  } catch {
    items.push({ id: "cron", label: "定时巡检", ok: false, detail: "状态读取失败" });
  }

  // 7. RCON
  const rconEnabled = (c.env as unknown as Record<string, unknown>).RCON_ENABLED === "true";
  items.push({
    id: "rcon",
    label: "RCON 白名单同步",
    ok: !rconEnabled,
    detail: rconEnabled ? "已启用" : "未启用（手动复制命令同步，非故障）",
  });

  const allOk = items.every((i) => i.ok);
  return ok({ all_ok: allOk, checked_at: new Date().toISOString(), items });
});


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

// 封禁 / 解封 / 改角色（保护：不能对自己操作；不能改其他管理员）
app.post("/users/:id/status", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = ["active", "banned"].includes(body.status) ? body.status : null;
  const role = ["user", "admin"].includes(body.role) ? body.role : null;
  if (!status && !role) return fail("无效的操作");

  if (id === admin.id) return fail("不能修改当前登录的账号", 403);

  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: number; role: string }>();
  if (!target) return fail("用户不存在", 404);

  // 目标原本是管理员且要改状态/降级 -> 禁止（防止互相禁用）
  if (target.role === "admin" && (status === "banned" || role === "user")) {
    return fail("不能禁用或降级其他管理员", 403);
  }

  if (status) {
    await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, id).run();
  }
  if (role) {
    await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
  }
  await logOp(c.env.DB, c, admin.id, "user_update", String(id), `${status || ""} ${role || ""}`.trim());
  return ok({ updated: true });
});

// 重置密码（保护：不能重置其他管理员；不能重置自己）
app.post("/users/:id/reset-password", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const newPassword = str(body.new_password, 64);
  if (newPassword.length < 6) return fail("新密码至少 6 位");
  if (id === admin.id) return fail("不能重置当前登录账号的密码，请用「安全中心」修改", 403);

  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: number; role: string }>();
  if (!target) return fail("用户不存在", 404);
  if (target.role === "admin") return fail("不能重置其他管理员的密码", 403);

  const { hashPassword } = await import("../lib/password");
  const passwordHash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(passwordHash, id)
    .run();
  await logOp(c.env.DB, c, admin.id, "user_reset_password", String(id));
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