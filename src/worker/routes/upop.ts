import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, getSecret } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { signToken, verifyToken } from "../lib/jwt";
import { logUserAction } from "../lib/log";
import { getClientIp, getUa } from "../lib/net";

/**
 * UPOP 统一认证（预留接口）
 *
 * 配置存放于 site_settings（后台「网站设置 → 三方接口预留」可视化编辑）：
 *   upop_enabled          "true" 开启
 *   upop_client_id        客户端 ID
 *   upop_client_secret    客户端密钥
 *   upop_authorize_url    授权端点
 *   upop_token_url        令牌端点
 *   upop_userinfo_url     用户信息端点
 *   upop_scope            授权范围（默认 "openid profile"）
 *   upop_user_id_field    userinfo 中唯一 ID 字段（默认 "id"）
 *   upop_username_field   userinfo 中昵称字段（默认 "username"）
 *
 * 回调地址固定为 {SITE_URL}/api/upop/callback。
 */

interface UpopConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  userIdField: string;
  usernameField: string;
}

const DEFAULT_KEYS = [
  "upop_enabled",
  "upop_client_id",
  "upop_client_secret",
  "upop_authorize_url",
  "upop_token_url",
  "upop_userinfo_url",
  "upop_scope",
  "upop_user_id_field",
  "upop_username_field",
] as const;

async function loadConfig(c: Context<AppEnv>): Promise<UpopConfig> {
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM site_settings WHERE key IN (${DEFAULT_KEYS.map(() => "?").join(",")})`,
  )
    .bind(...DEFAULT_KEYS)
    .all<{ key: string; value: string }>();
  const map = new Map(results.map((r) => [r.key, r.value]));
  return {
    enabled: map.get("upop_enabled") === "true",
    clientId: map.get("upop_client_id") || "",
    clientSecret: map.get("upop_client_secret") || "",
    authorizeUrl: map.get("upop_authorize_url") || "",
    tokenUrl: map.get("upop_token_url") || "",
    userinfoUrl: map.get("upop_userinfo_url") || "",
    scope: map.get("upop_scope") || "openid profile",
    userIdField: map.get("upop_user_id_field") || "id",
    usernameField: map.get("upop_username_field") || "username",
  };
}

function callbackUrl(c: Context<AppEnv>): string {
  return `${c.env.SITE_URL || ""}/api/upop/callback`;
}

function pick(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v === "string" || typeof v === "number") return String(v);
  // 支持嵌套，如 user.id
  const [head, ...rest] = field.split(".");
  let cur: unknown = obj[head];
  for (const k of rest) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === "string" || typeof cur === "number" ? String(cur) : "";
}

const app = new Hono<AppEnv>();

// 状态（用户端/管理端共用）：未配置时返回 enabled:false 与缺失项，前端展示"预留"
app.get("/status", async (c) => {
  const cfg = await loadConfig(c);
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("upop_client_id");
  if (!cfg.clientSecret) missing.push("upop_client_secret");
  if (!cfg.authorizeUrl) missing.push("upop_authorize_url");
  if (!cfg.tokenUrl) missing.push("upop_token_url");
  if (!cfg.userinfoUrl) missing.push("upop_userinfo_url");
  return ok({
    enabled: cfg.enabled && missing.length === 0,
    reserved: true,
    missing,
    callback_url: callbackUrl(c),
  });
});

// 构造授权链接
app.get("/authorize-url", requireAuth, async (c) => {
  const user = c.get("user")!;
  const cfg = await loadConfig(c);
  if (!cfg.enabled || !cfg.clientId || !cfg.authorizeUrl) {
    return fail("UPOP 绑定未启用。请管理员在后台「网站设置 → 三方接口预留」中填写 upop_* 配置。", 503);
  }
  const state = await signToken({ sub: String(user.id), username: user.username, role: "oauth" }, getSecret(c));
  const url =
    `${cfg.authorizeUrl}${cfg.authorizeUrl.includes("?") ? "&" : "?"}` +
    `client_id=${encodeURIComponent(cfg.clientId)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl(c))}` +
    `&scope=${encodeURIComponent(cfg.scope)}&state=${encodeURIComponent(state)}`;
  return ok({ url });
});

// OAuth 回调
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const site = `${c.env.SITE_URL || ""}`;
  if (!code || !state) return fail("OAuth 回调参数缺失", 400);

  const payload = await verifyToken(state, getSecret(c));
  if (!payload || payload.role !== "oauth") return fail("state 校验失败", 400);
  const userId = Number(payload.sub);

  const cfg = await loadConfig(c);
  if (!cfg.enabled || !cfg.clientId || !cfg.clientSecret || !cfg.tokenUrl || !cfg.userinfoUrl) {
    return fail("UPOP OAuth 未配置完整", 503);
  }

  // 1. 换 access_token
  const tokenResp = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(c),
    }),
  });
  if (!tokenResp.ok) return fail("获取 access_token 失败", 502);
  const token = (await tokenResp.json()) as { access_token?: string };
  if (!token.access_token) return fail("token 响应缺少 access_token", 502);

  // 2. 拉取用户信息
  const uiResp = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!uiResp.ok) return fail("获取用户信息失败", 502);
  const userinfo = (await uiResp.json()) as Record<string, unknown>;
  const externalId = pick(userinfo, cfg.userIdField);
  const username = pick(userinfo, cfg.usernameField) || externalId;
  if (!externalId) return fail(`userinfo 中未找到字段 ${cfg.userIdField}`, 502);

  // 3. 存储绑定（同一外部账号只能绑定一个用户）
  const existing = await c.env.DB.prepare(
    "SELECT id, user_id FROM upop_bindings WHERE external_id = ?",
  ).bind(externalId).first<{ id: number; user_id: number }>();
  if (existing && existing.user_id !== userId) {
    return fail("该 UPOP 账号已绑定其他用户", 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO upop_bindings (user_id, external_id, upop_username, userinfo, bound_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       external_id = excluded.external_id,
       upop_username = excluded.upop_username,
       userinfo = excluded.userinfo,
       bound_at = datetime('now')`,
  )
    .bind(userId, externalId, username, JSON.stringify(userinfo).slice(0, 4000))
    .run();

  await logUserAction(c.env.DB, userId, "bind_upop", `绑定 UPOP ${username}`, getClientIp(c), getUa(c));

  return c.redirect(`${site}/user/security?upop_bound=1`);
});

// 当前绑定
app.get("/bindings", requireAuth, async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(
    "SELECT id, upop_username, external_id, bound_at FROM upop_bindings WHERE user_id = ?",
  ).bind(user.id).first();
  return ok(row || null);
});

// 解绑
app.post("/unbind", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare("DELETE FROM upop_bindings WHERE user_id = ?").bind(user.id).run();
  await logUserAction(c.env.DB, user.id, "unbind_upop", "解绑 UPOP 账号", getClientIp(c), getUa(c));
  return ok({ unbound: true });
});

// 密钥脱敏导出（管理端 /admin/integrations 使用）
export async function upopAdminStatus(c: Context<AppEnv>) {
  const cfg = await loadConfig(c);
  const mask = (s: string) => (s ? `${s.slice(0, 4)}****` : "");
  return {
    enabled: cfg.enabled,
    client_id: cfg.clientId ? mask(cfg.clientId) : "",
    client_secret_set: !!cfg.clientSecret,
    authorize_url: cfg.authorizeUrl,
    token_url: cfg.tokenUrl,
    userinfo_url: cfg.userinfoUrl,
    scope: cfg.scope,
    callback_url: callbackUrl(c),
  };
}

export default app;
