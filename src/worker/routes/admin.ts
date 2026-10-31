import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str, isEmail, isValidPassword, isValidUsername } from "../lib/validate";
import { loadMailConfig, mailEnabled, sendMail, renderEmail, MAIL_SENSITIVE_KEYS, loadMailNotifySettings } from "../lib/mail";
import { EPAY_TYPES, epayEnabled, loadEpayConfig, publicEpay } from "../lib/epay";
import { logOp } from "../lib/log";
import { upopAdminStatus } from "./upop";
import { msAdminStatus } from "./microsoft";
import { inuAdminStatus } from "./inu";
import { sanitizeScopes } from "../lib/inu";
import { loadAiConfig } from "./ai";

const app = new Hono<AppEnv>();

const MASKED = "••••••";
const SECRET_SETTING_KEYS = new Set<string>([...MAIL_SENSITIVE_KEYS, "upop_client_secret"]);
// 这些配置有独立的校验与保存接口，禁止通过通用键值接口整体覆盖
const DEDICATED_SETTING_KEYS = new Set<string>([
  "ai_config",
  "ai_providers",
  "ms_oauth_config",
  "inu_oauth_config",
  "rainyun_config",
  "pay_epay",
  "rcon_whitelist",
]);

/** 后台设置列表脱敏：密钥类只返回占位符，避免任何管理员会话直接拿到明文 */
function maskSetting(key: string, value: string): string {
  if (!value) return value;
  if (SECRET_SETTING_KEYS.has(key)) return MASKED;
  if (key === "pay_epay") return `${MASKED}（请到「支付配置」中编辑）`;
  if (key === "ai_config") {
    try {
      const j = JSON.parse(value) as Record<string, unknown>;
      if (typeof j.api_key === "string" && j.api_key) j.api_key = MASKED;
      return JSON.stringify(j);
    } catch {
      return MASKED;
    }
  }
  if (key === "ai_providers") {
    try {
      const list = JSON.parse(value) as Record<string, unknown>[];
      if (!Array.isArray(list)) return MASKED;
      return JSON.stringify(
        list.map((p) => ({
          ...p,
          api_key: typeof p.api_key === "string" && p.api_key ? MASKED : "",
        })),
      );
    } catch {
      return MASKED;
    }
  }
  if (key === "ms_oauth_config" || key === "inu_oauth_config") {
    try {
      const j = JSON.parse(value) as Record<string, unknown>;
      if (typeof j.client_secret === "string" && j.client_secret) j.client_secret = MASKED;
      return JSON.stringify(j);
    } catch {
      return MASKED;
    }
  }
  if (key === "rainyun_config") {
    try {
      const j = JSON.parse(value) as Record<string, unknown>;
      if (typeof j.api_key === "string" && j.api_key) j.api_key = MASKED;
      return JSON.stringify(j);
    } catch {
      return MASKED;
    }
  }
  return value;
}

app.use("*", requireAuth, requireAdmin);

// 三方接口预留状态（微软 OAuth / UPOP）
app.get("/integrations", async (c) => {
  const site = (c.env.SITE_URL as string) || "";
  const upop = await upopAdminStatus(c);
  return ok({
    microsoft: await msAdminStatus(c),
    upop: { ...upop, callback_url: `${site}/api/upop/callback` },
    inu: await inuAdminStatus(c),
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

// 保存 INU OAuth 配置（留空表示保留原值；回调地址会校验 https / localhost）
app.post("/integrations/inu", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const row = await c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'inu_oauth_config'").first<{ value: string }>();
  let cur: Record<string, unknown> = {};
  if (row?.value) {
    try {
      cur = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  const site = (c.env.SITE_URL as string) || "";
  const envRedirect = String(c.env.INU_REDIRECT_URI || "").trim() || `${site}/api/inu/callback`;
  const curStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const clientId = str(body.client_id, 200).trim() || curStr(cur.client_id) || String(c.env.INU_CLIENT_ID || "").trim();
  const clientSecret =
    str(body.client_secret, 300).trim() || curStr(cur.client_secret) || String(c.env.INU_CLIENT_SECRET || "").trim();
  const redirectUri = str(body.redirect_uri, 500).trim() || curStr(cur.redirect_uri) || envRedirect;
  const scopes = sanitizeScopes(
    str(body.scopes, 100).trim() || curStr(cur.scopes) || String(c.env.INU_SCOPES || "profile email"),
  );
  if (!clientId) return fail("请填写 Client ID");
  try {
    const url = new URL(redirectUri);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
      return fail("回调地址必须是 https 地址（本地调试可用 http://localhost）");
    }
  } catch {
    return fail("回调地址格式不正确");
  }
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('inu_oauth_config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(JSON.stringify({ enabled: body.enabled === true, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, scopes }))
    .run();
  await logOp(c.env.DB, c, admin.id, "setting_update", "inu_oauth_config");
  return ok({ saved: true, enabled: body.enabled === true, redirect_uri: redirectUri, scopes });
});

// 聊天室 / 论坛配置：开关 / 欢迎公告 / 限制 / 论坛 Tab 显隐
app.get("/chat-config", async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'chat_config'").first<{ value: string }>();
  const def = { enabled: true, welcome: "", max_text: 400, max_image_mb: 4, show_announcements: true, show_chat: true };
  let cfg = def;
  if (row) {
    try {
      cfg = { ...def, ...(JSON.parse(row.value) as Record<string, unknown>) };
    } catch {
      /* 用默认配置 */
    }
  }
  return ok(cfg);
});

app.post("/chat-config", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const cfg = {
    enabled: body.enabled !== false,
    welcome: String(body.welcome ?? "").slice(0, 200),
    max_text: Math.min(1000, Math.max(20, Number(body.max_text) || 400)),
    max_image_mb: Math.min(8, Math.max(1, Number(body.max_image_mb) || 4)),
    show_announcements: body.show_announcements !== false,
    show_chat: body.show_chat !== false,
  };
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('chat_config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(JSON.stringify(cfg))
    .run();
  await logOp(c.env.DB, c, admin.id, "setting_update", "chat_config");
  return ok(cfg);
});

// 行为日志（user_logs）：按类型 / 用户筛选，分页 50 条
app.get("/action-logs", async (c) => {
  const action = (c.req.query("action") || "").slice(0, 60);
  const userId = Number(c.req.query("user_id")) || 0;
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const size = 50;

  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (action) {
    conds.push("l.action = ?");
    binds.push(action);
  }
  if (userId) {
    conds.push("l.user_id = ?");
    binds.push(userId);
  }
  const whereSql = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM user_logs l ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.user_id, l.action, l.detail, l.ip, l.created_at, u.username
     FROM user_logs l LEFT JOIN users u ON u.id = l.user_id
     ${whereSql} ORDER BY l.id DESC LIMIT ${size} OFFSET ?`,
  )
    .bind(...binds, (page - 1) * size)
    .all();
  const types = await c.env.DB.prepare("SELECT DISTINCT action FROM user_logs ORDER BY action").all<{ action: string }>();

  return ok({
    logs: results ?? [],
    total: total?.n ?? 0,
    page,
    size,
    types: (types.results ?? []).map((r) => r.action),
  });
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
            u.created_at, u.last_login_at, u.register_ip, u.last_login_ip, u.last_login_ua,
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

// 管理员创建用户（可指定角色，初始密码需满足复杂度要求）
app.post("/users", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const username = str(body.username, 20).trim();
  const email = str(body.email, 100).trim().toLowerCase();
  const password = str(body.password, 64);
  const role = body.role === "admin" ? "admin" : "user";

  if (!isValidUsername(username)) return fail("用户名需 3-20 位（字母/数字/下划线/中文）");
  if (email && !isEmail(email)) return fail("邮箱格式不正确");
  if (!isValidPassword(password)) return fail("密码需 8-64 位，且包含字母和数字");

  const dup = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? OR (email != '' AND email = ?)")
    .bind(username, email || "\u0000")
    .first<{ id: number }>();
  if (dup) return fail("用户名或邮箱已被使用", 409);

  const { hashPassword } = await import("../lib/password");
  const passwordHash = await hashPassword(password);
  const csrf = crypto.randomUUID();
  const result = await c.env.DB.prepare(
    `INSERT INTO users (username, email, password_hash, role, csrf_token) VALUES (?, ?, ?, ?, ?)`,
  ).bind(username, email, passwordHash, role, csrf).run();
  const id = Number(result.meta.last_row_id);

  await logOp(c.env.DB, c, admin.id, "user_create", String(id), `${username} ${role}`);
  return ok({ id, username, email, role });
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

  // 目标原本是管理员且要封禁/降级：至少保留一个可用管理员，避免互相锁死
  if (target.role === "admin" && (status === "banned" || role === "user")) {
    const row = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
    ).bind(id).first<{ n: number }>();
    if ((row?.n ?? 0) < 1) {
      return fail("不能禁用或降级最后一个管理员", 403);
    }
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
  if (!isValidPassword(newPassword)) return fail("新密码需 8-64 位，且包含字母和数字");
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

// 修改用户邮箱（保护：不能修改其他管理员；不能修改自己，自己走「安全中心」）
app.post("/users/:id/update-email", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 100).trim().toLowerCase();
  if (!isEmail(email)) return fail("邮箱格式不正确");
  if (id === admin.id) return fail("不能修改当前登录账号的邮箱，请用「安全中心」修改", 403);

  const target = await c.env.DB.prepare("SELECT id, role FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: number; role: string }>();
  if (!target) return fail("用户不存在", 404);
  if (target.role === "admin") return fail("不能修改其他管理员的邮箱", 403);

  const dup = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ?")
    .bind(email, id)
    .first<{ id: number }>();
  if (dup) return fail("该邮箱已被其他账号使用", 409);

  await c.env.DB.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(email, id)
    .run();
  await logOp(c.env.DB, c, admin.id, "user_update_email", String(id), email);
  return ok({ updated: true });
});



// —— 站点设置 ——

app.get("/settings", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT key, value FROM site_settings WHERE key NOT LIKE 'reset_code:%' ORDER BY key ASC",
  ).all<{ key: string; value: string }>();
  // 邮件密钥类配置脱敏返回（改用专用 /mail-config 接口管理，留空保留原值）
  return ok(
    results.map((r) => ({ ...r, value: maskSetting(r.key, r.value) })),
  );
});

app.post("/settings", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const key = str(body.key, 100).trim();
  const value = str(body.value, 10000);
  if (!key || key.startsWith("reset_code:")) return fail("无效的 key");
  // 结构化/含密钥配置必须走专用接口，避免通用接口绕过字段校验写入明文密钥
  if (DEDICATED_SETTING_KEYS.has(key)) {
    return fail("该配置需在对应的专用配置页面修改", 400);
  }
  // 防止把列表里的脱敏占位符写回数据库，覆盖真实密钥
  if (value.includes("••••") && SECRET_SETTING_KEYS.has(key)) {
    return fail("该配置包含密钥，请到对应的专用配置页面修改", 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).bind(key, value).run();
  await logOp(c.env.DB, c, admin.id, "setting_update", key);
  return ok({ updated: true });
});

// —— 邮件服务（Resend / SMTP） ——

app.get("/mail-config", async (c) => {
  const cfg = await loadMailConfig(c.env.DB);
  const notify = await loadMailNotifySettings(c.env.DB);
  return ok({
    provider: cfg.provider,
    from: cfg.from,
    resend_key_set: cfg.resend_keys.length > 0,
    resend_key_count: cfg.resend_keys.length,
    smtp_host: cfg.smtp_host,
    smtp_port: cfg.smtp_port,
    smtp_user: cfg.smtp_user,
    smtp_pass_set: !!cfg.smtp_pass,
    smtp_ssl: cfg.smtp_ssl,
    events: notify.events,
    notify_emails: notify.recipients.join("\n"),
  });
});

app.post("/mail-config", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const provider = str(body.provider, 10);
  if (!["none", "resend", "smtp"].includes(provider)) return fail("无效的邮件服务商");
  const from = str(body.from, 200).trim();
  if (provider !== "none" && !isEmail(from)) return fail("发件人地址格式不正确");

  const entries: [string, string][] = [
    ["mail_provider", provider],
    ["mail_from", from],
    ["mail_smtp_host", str(body.smtp_host, 200).trim()],
    ["mail_smtp_port", String(Math.max(1, Math.min(65535, Number(body.smtp_port) || 587)))],
    ["mail_smtp_user", str(body.smtp_user, 200).trim()],
    ["mail_smtp_ssl", body.smtp_ssl ? "true" : "false"],
  ];
  // 密钥留空 = 保留原值；多 Key 支持换行 / 逗号分隔
  const keysRaw = body.resend_keys;
  const resendKeys: string[] = Array.isArray(keysRaw)
    ? keysRaw.map((k: unknown) => String(k).trim()).filter(Boolean)
    : String(keysRaw ?? "")
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const legacyKey = str(body.resend_key, 300).trim();
  if (legacyKey) resendKeys.unshift(legacyKey);
  if (resendKeys.length > 0) {
    entries.push(["mail_resend_keys", JSON.stringify(resendKeys.slice(0, 20))]);
    entries.push(["mail_resend_key", resendKeys[0]]);
  }
  const smtpPass = str(body.smtp_pass, 300).trim();
  if (smtpPass) entries.push(["mail_smtp_pass", smtpPass]);

  // 事件通知开关与收件人
  if (body.events && typeof body.events === "object") {
    const src = body.events as Record<string, unknown>;
    const events: Record<string, boolean> = {};
    for (const key of ["ticket", "application", "order", "contact"]) {
      events[key] = src[key] !== false;
    }
    entries.push(["mail_events", JSON.stringify(events)]);
  }
  if (typeof body.notify_emails === "string") {
    const list = body.notify_emails
      .split(/[\n,;]/)
      .map((s: string) => s.trim())
      .filter((s: string) => isEmail(s))
      .slice(0, 10);
    entries.push(["mail_notify_emails", list.join("\n")]);
  }

  for (const [key, value] of entries) {
    await c.env.DB.prepare(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).bind(key, value).run();
  }
  await logOp(c.env.DB, c, admin.id, "mail_config_update", provider);
  return ok({ updated: true });
});

// 发送测试邮件
app.post("/mail-test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const to = str(body.to, 200).trim();
  if (!isEmail(to)) return fail("收件邮箱格式不正确");
  const cfg = await loadMailConfig(c.env.DB);
  if (!mailEnabled(cfg)) return fail("请先选择服务商并保存配置", 400);
  try {
    await sendMail(cfg, {
      to,
      subject: "【Westworld西域之光】邮件服务测试",
      html: renderEmail("邮件服务配置成功", "<p>这是一封测试邮件，说明当前邮件投递配置可用。</p>"),
    });
    return ok({ sent: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "发送失败", 502);
  }
});

// —— 支付配置（易支付 / Epay 通用协议） ——

app.get("/pay-config", async (c) => {
  const cfg = await loadEpayConfig(c.env.DB);
  const site = String(c.env.SITE_URL || "").replace(/\/+$/, "");
  return ok({
    ...publicEpay(cfg),
    types_available: EPAY_TYPES,
    notify_url: `${site}/api/pay/notify`,
    return_url: `${site}/user/orders?paid=1`,
  });
});

app.post("/pay-config", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const cur = await loadEpayConfig(c.env.DB);

  const apiUrl = str(body.api_url, 300).trim().replace(/\/+$/, "");
  const pid = str(body.pid, 100).trim();
  const key = str(body.key, 300).trim() || cur.key; // 留空保留原密钥
  const sitename = str(body.sitename, 60).trim() || "Westworld西域之光";
  const enabled = body.enabled === true;
  const types = Array.isArray(body.types)
    ? (body.types as unknown[]).map((t) => String(t)).filter((t) => EPAY_TYPES.some((x) => x.key === t))
    : cur.types;

  if (apiUrl && !/^https?:\/\//i.test(apiUrl)) return fail("接口地址需以 http:// 或 https:// 开头");
  if (types.length === 0) return fail("至少启用一种支付方式");

  const cfg = { enabled, api_url: apiUrl, pid, key, types, sitename };
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('pay_epay', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).bind(JSON.stringify(cfg)).run();

  await logOp(c.env.DB, c, admin.id, "pay_epay_update", enabled ? "enabled" : "disabled");
  return ok(publicEpay(cfg));
});

// 易支付连通性测试：向接口地址发起一次请求（不产生真实支付）
app.post("/pay-config/test", async (c) => {
  const cfg = await loadEpayConfig(c.env.DB);
  if (!epayEnabled(cfg)) return fail("请先填写接口地址、PID 与密钥", 400);
  try {
    const resp = await fetch(`${cfg.api_url.replace(/\/+$/, "")}/submit.php`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    // 只要域名可解析、HTTP 可达即视为连通（submit.php 无参数通常返回错误页）
    return ok({ reachable: true, status: resp.status });
  } catch (e) {
    return fail(`无法连接支付接口：${e instanceof Error ? e.message : "未知错误"}`, 502);
  }
});

// 批量通知（邮件投递给注册用户）
app.post("/users/notify", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const subject = str(body.subject, 200).trim();
  const content = str(body.content, 5000).trim();
  const onlyActive = body.only_active !== false;
  if (!subject || !content) return fail("标题和内容不能为空");

  const cfg = await loadMailConfig(c.env.DB);
  if (!mailEnabled(cfg)) return fail("邮件服务未配置，请先到「网站设置 → 邮件服务」完成配置", 400);

  // 按用户 ID 游标分批：单次最多 30 封，避免触发 Workers 子请求上限
  const afterId = Math.max(0, Number(body.after_id) || 0);
  const batchSize = Math.min(30, Math.max(1, Number(body.limit) || 30));
  const { results } = await c.env.DB.prepare(
    `SELECT id, email FROM users
     WHERE email != '' AND email IS NOT NULL AND id > ?
       ${onlyActive ? "AND status = 'active'" : ""}
     ORDER BY id ASC LIMIT ?`,
  ).bind(afterId, batchSize).all<{ id: number; email: string }>();
  if (results.length === 0) {
    if (afterId === 0) return fail("没有符合条件且带邮箱的用户", 400);
    return ok({ total: 0, sent: 0, failed: 0, errors: [], has_more: false, next_after_id: afterId });
  }

  const html = renderEmail(subject, content.replace(/\n/g, "<br>"));
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    const settled = await Promise.allSettled(batch.map((u) => sendMail(cfg, { to: u.email, subject, html })));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === "fulfilled") sent++;
      else {
        failed++;
        if (errors.length < 3) errors.push(`${batch[j].email}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
      }
    }
  }
  const nextAfterId = results[results.length - 1].id;
  const hasMore = results.length === batchSize;
  await logOp(c.env.DB, c, admin.id, "users_notify", `${sent}/${results.length} after=${afterId}`, subject);
  return ok({ total: results.length, sent, failed, errors, has_more: hasMore, next_after_id: nextAfterId });
});

// —— 操作日志 ——

app.get("/oplogs", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.action, o.target, o.detail, o.ip, o.created_at, u.username AS operator
     FROM op_logs o LEFT JOIN users u ON u.id = o.operator_id ORDER BY o.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// —— 风控看板 ——

app.get("/risk", async (c) => {
  const db = c.env.DB;
  const [userStats, pendingApps, openTickets, blacklist, sharedReg, sharedLogin, sharedFp, recentRegs, recentLogs, rateLimits] =
    await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END), 0) AS banned,
                  COALESCE(SUM(CASE WHEN role = 'admin' AND status = 'active' THEN 1 ELSE 0 END), 0) AS admins,
                  COALESCE(SUM(CASE WHEN created_at >= datetime('now','-1 day') THEN 1 ELSE 0 END), 0) AS new_24h,
                  COALESCE(SUM(CASE WHEN created_at >= datetime('now','-7 day') THEN 1 ELSE 0 END), 0) AS new_7d,
                  COALESCE(SUM(CASE WHEN status = 'active' AND last_login_at >= datetime('now','-7 day') THEN 1 ELSE 0 END), 0) AS active_7d
           FROM users`,
        )
        .first<{ total: number; banned: number; admins: number; new_24h: number; new_7d: number; active_7d: number }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM whitelist_applications WHERE status = 'pending'")
        .first<{ n: number }>(),
      db
        .prepare("SELECT COUNT(*) AS n FROM support_tickets WHERE status != 'closed'")
        .first<{ n: number }>(),
      db
        .prepare("SELECT id, ip, reason, created_at FROM ip_blacklist ORDER BY id DESC LIMIT 100")
        .all<{ id: number; ip: string; reason: string; created_at: string }>(),
      db
        .prepare(
          `SELECT register_ip AS ip, COUNT(*) AS accounts,
                  GROUP_CONCAT(username, ', ') AS usernames,
                  COALESCE(SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END), 0) AS banned,
                  MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
           FROM users WHERE register_ip != '' AND register_ip IS NOT NULL
           GROUP BY register_ip HAVING COUNT(*) > 1
           ORDER BY accounts DESC, last_seen DESC LIMIT 20`,
        )
        .all<{ ip: string; accounts: number; usernames: string; banned: number; first_seen: string; last_seen: string }>(),
      db
        .prepare(
          `SELECT last_login_ip AS ip, COUNT(*) AS accounts,
                  GROUP_CONCAT(username, ', ') AS usernames,
                  COALESCE(SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END), 0) AS banned,
                  MAX(last_login_at) AS last_seen
           FROM users WHERE last_login_ip != '' AND last_login_ip IS NOT NULL
           GROUP BY last_login_ip HAVING COUNT(*) > 1
           ORDER BY accounts DESC, last_seen DESC LIMIT 20`,
        )
        .all<{ ip: string; accounts: number; usernames: string; banned: number; last_seen: string }>(),
      db
        .prepare(
          `SELECT ua_fingerprint AS fingerprint, COUNT(*) AS accounts,
                  GROUP_CONCAT(username, ', ') AS usernames,
                  COALESCE(SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END), 0) AS banned
           FROM users WHERE ua_fingerprint != '' AND ua_fingerprint IS NOT NULL
           GROUP BY ua_fingerprint HAVING COUNT(*) > 1
           ORDER BY accounts DESC LIMIT 20`,
        )
        .all<{ fingerprint: string; accounts: number; usernames: string; banned: number }>(),
      db
        .prepare(
          `SELECT id, username, email, status, register_ip, created_at
           FROM users ORDER BY id DESC LIMIT 12`,
        )
        .all<{ id: number; username: string; email: string; status: string; register_ip: string; created_at: string }>(),
      db
        .prepare(
          `SELECT l.id, l.action, l.ip, l.detail, l.created_at, u.username
           FROM user_logs l LEFT JOIN users u ON u.id = l.user_id
           WHERE l.action IN ('register','login','reset_password','forgot_password')
           ORDER BY l.id DESC LIMIT 20`,
        )
        .all<{ id: number; action: string; ip: string; detail: string; created_at: string; username: string | null }>(),
      db
        .prepare(
          `SELECT key, count, expires_at FROM rate_limits
           WHERE (key LIKE 'login:%' OR key LIKE 'reg:%') AND expires_at > ?
           ORDER BY count DESC LIMIT 10`,
        )
        .bind(Math.floor(Date.now() / 1000))
        .all<{ key: string; count: number; expires_at: number }>(),
    ]);

  const stats = userStats ?? { total: 0, banned: 0, admins: 0, new_24h: 0, new_7d: 0, active_7d: 0 };
  const factors: { label: string; points: number; detail: string }[] = [];
  let score = 0;
  const addFactor = (label: string, points: number, detail: string) => {
    if (points <= 0) return;
    score += points;
    factors.push({ label, points, detail });
  };
  addFactor("封禁账号", Math.min(25, stats.banned * 8), `${stats.banned} 个账号处于封禁状态`);
  addFactor(
    "共用注册 IP",
    Math.min(20, sharedReg.results.length * 5),
    `${sharedReg.results.length} 个 IP 注册了多个账号`,
  );
  addFactor(
    "共用设备指纹",
    Math.min(15, sharedFp.results.length * 4),
    `${sharedFp.results.length} 个浏览器指纹关联多个账号`,
  );
  addFactor("IP 黑名单", Math.min(10, blacklist.results.length * 2), `${blacklist.results.length} 个 IP 被拉黑`);
  addFactor("待审核申请", Math.min(15, (pendingApps?.n ?? 0) * 3), `${pendingApps?.n ?? 0} 份入服申请待处理`);
  addFactor("未关闭工单", Math.min(10, openTickets?.n ?? 0), `${openTickets?.n ?? 0} 个工单仍未关闭`);
  addFactor(
    "短期注册量",
    Math.min(10, Math.floor(stats.new_24h / 5) * 2),
    `24 小时内新增 ${stats.new_24h} 个账号`,
  );
  score = Math.min(100, score);

  const level =
    score >= 70
      ? { label: "高风险", tone: "red", desc: "存在多项明显异常，建议尽快核查关联账号与黑名单。" }
      : score >= 45
        ? { label: "中风险", tone: "amber", desc: "出现较多可疑信号，建议检查共用 IP / 设备与待处理事项。" }
        : score >= 20
          ? { label: "需关注", tone: "blue", desc: "有少量异常信号，保持日常巡检即可。" }
          : { label: "低风险", tone: "green", desc: "当前未发现明显批量注册或关联账号风险。" };

  return ok({
    score,
    level,
    factors,
    stats,
    pending_apps: pendingApps?.n ?? 0,
    open_tickets: openTickets?.n ?? 0,
    blacklist: blacklist.results,
    shared_register_ips: sharedReg.results,
    shared_login_ips: sharedLogin.results,
    shared_fingerprints: sharedFp.results,
    recent_registrations: recentRegs.results,
    recent_logs: recentLogs.results,
    rate_limits: rateLimits.results,
  });
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