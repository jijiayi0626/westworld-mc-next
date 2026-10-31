import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../lib/auth";
import { readToken, getSecret, sessionCookie } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isEmail, isValidUsername, str, timingSafeEqual } from "../lib/validate";
import { hashPassword } from "../lib/password";
import { signToken, verifyToken } from "../lib/jwt";
import { genCsrfToken, getClientIp, getUa, uaFingerprint } from "../lib/net";
import { rateLimit } from "../lib/ratelimit";
import { logUserAction } from "../lib/log";
import { encryptSecret, decryptSecret } from "../lib/cipher";
import {
  type InuConfig,
  inuStateCookie,
  loadInuConfig,
  pkceChallenge,
  randomToken,
  revokeInuTokenForUser,
  sha256Hex,
} from "../lib/inu";

const app = new Hono<AppEnv>();

interface InuState {
  state: string;
  verifier: string;
  mode: "login" | "bind";
  userId?: number;
  exp: number;
}

interface InuToken {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

interface InuProfile {
  sub: string;
  name: string;
  preferred_username: string;
  inu_id: string;
  orbit: string;
  avatar_text: string;
  tier: string;
  tier_label: string;
  email: string;
  email_verified: boolean;
}

interface LocalUser {
  id: number;
  username: string;
  role: string;
  status: string;
}

function siteBase(c: Context<AppEnv>): string {
  return String(c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function readCookie(c: Context<AppEnv>, name: string): string {
  const raw = c.req.header("cookie") || "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function errorRedirect(c: Context<AppEnv>, mode: "login" | "bind", code: string): Response {
  const path = mode === "bind" ? "/user/security" : "/login";
  return redirect(`${siteBase(c)}${path}?inu_error=${encodeURIComponent(code)}`, [
    inuStateCookie("", 0),
  ]);
}

function normalizeProfile(raw: Record<string, unknown>): InuProfile {
  const email = str(raw.email, 100).trim().toLowerCase();
  return {
    sub: str(raw.sub, 191).trim(),
    name: str(raw.name, 100).trim(),
    preferred_username: str(raw.preferred_username, 100).trim(),
    inu_id: str(raw.inu_id, 100).trim(),
    orbit: str(raw.orbit, 50).trim(),
    avatar_text: str(raw.avatar_text, 8).trim(),
    tier: str(raw.tier, 50).trim(),
    tier_label: str(raw.tier_label, 50).trim(),
    email,
    // 只有 INU 明确标记已验证且格式合法时才信任邮箱
    email_verified: raw.email_verified === true && isEmail(email),
  };
}

function sanitizeUsernameBase(raw: string): string {
  const base = raw
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : "";
}

async function uniqueUsername(
  db: AppEnv["Bindings"]["DB"],
  profile: InuProfile,
): Promise<string> {
  const hash = (await sha256Hex(profile.sub)).slice(0, 8);
  const seed =
    sanitizeUsernameBase(profile.preferred_username) ||
    sanitizeUsernameBase(profile.name) ||
    sanitizeUsernameBase(profile.inu_id) ||
    `inu_${hash}`;

  const candidates = [seed, `inu_${hash}`];
  for (const name of candidates) {
    if (!isValidUsername(name)) continue;
    const exists = await db.prepare("SELECT id FROM users WHERE username = ?").bind(name).first();
    if (!exists) return name;
  }

  const root = seed.slice(0, 16);
  for (let i = 2; i < 50; i++) {
    const name = `${root}_${i}`;
    if (!isValidUsername(name)) continue;
    const exists = await db.prepare("SELECT id FROM users WHERE username = ?").bind(name).first();
    if (!exists) return name;
  }
  return `inu_${hash}_${randomToken(3).replace(/[^a-zA-Z0-9]/g, "").slice(0, 4)}`;
}

async function findInuAccount(
  db: AppEnv["Bindings"]["DB"],
  sub: string,
): Promise<(LocalUser & { user_id: number }) | null> {
  return db
    .prepare(
      `SELECT a.user_id, u.id, u.username, u.role, u.status
       FROM inu_accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.inu_sub = ?`,
    )
    .bind(sub)
    .first<LocalUser & { user_id: number }>();
}

async function sessionUser(c: Context<AppEnv>): Promise<LocalUser | null> {
  try {
    const token = readToken(c);
    if (!token) return null;
    const payload = await verifyToken(token, getSecret(c));
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await c.env.DB.prepare(
      "SELECT id, username, role, status FROM users WHERE id = ?",
    )
      .bind(id)
      .first<LocalUser>();
    return row && row.status === "active" ? row : null;
  } catch {
    return null;
  }
}

async function saveInuAccount(
  c: Context<AppEnv>,
  userId: number,
  profile: InuProfile,
  token: InuToken,
  appSecret: string,
): Promise<void> {
  const tokenEnc = token.access_token
    ? await encryptSecret(token.access_token, appSecret)
    : "";
  const expiresIn = Number(token.expires_in);
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    (Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(expiresIn) : 3600);

  await c.env.DB.prepare(
    `INSERT INTO inu_accounts
       (user_id, inu_sub, inu_id, name, preferred_username, orbit, avatar_text,
        tier, tier_label, email, email_verified, access_token_enc, token_expires_at,
        bound_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       inu_sub = excluded.inu_sub,
       inu_id = excluded.inu_id,
       name = excluded.name,
       preferred_username = excluded.preferred_username,
       orbit = excluded.orbit,
       avatar_text = excluded.avatar_text,
       tier = excluded.tier,
       tier_label = excluded.tier_label,
       email = excluded.email,
       email_verified = excluded.email_verified,
       access_token_enc = excluded.access_token_enc,
       token_expires_at = excluded.token_expires_at,
       updated_at = datetime('now')`,
  )
    .bind(
      userId,
      profile.sub,
      profile.inu_id || profile.sub,
      profile.name,
      profile.preferred_username,
      profile.orbit,
      profile.avatar_text,
      profile.tier,
      profile.tier_label,
      profile.email,
      profile.email_verified ? 1 : 0,
      tokenEnc,
      expiresAt,
    )
    .run();
}

async function createLocalUser(
  c: Context<AppEnv>,
  profile: InuProfile,
): Promise<{ ok: true; user: LocalUser } | { ok: false; code: string }> {
  const hash = (await sha256Hex(profile.sub)).slice(0, 16);
  const email = profile.email_verified ? profile.email : `inu_${hash}@inu.invalid`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await uniqueUsername(c.env.DB, profile);
    try {
      const passwordHash = await hashPassword(randomToken(32));
      const csrf = genCsrfToken();
      const result = await c.env.DB.prepare(
        `INSERT INTO users
           (username, email, password_hash, ua_fingerprint, csrf_token,
            register_ip, last_login_ip, last_login_ua, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
        .bind(
          username,
          email,
          passwordHash,
          await uaFingerprint(c),
          csrf,
          getClientIp(c),
          getClientIp(c),
          getUa(c),
        )
        .run();
      return {
        ok: true,
        user: {
          id: Number(result.meta.last_row_id),
          username,
          role: "user",
          status: "active",
        },
      };
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e))) {
        const emailRow = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
          .bind(email)
          .first();
        if (emailRow) return { ok: false, code: "email_exists" };
        continue;
      }
      console.log("[inu] create user failed:", e instanceof Error ? e.message : e);
      return { ok: false, code: "unavailable" };
    }
  }
  return { ok: false, code: "unavailable" };
}

async function finishLogin(
  c: Context<AppEnv>,
  user: LocalUser,
  profile: InuProfile,
  token: InuToken,
  appSecret: string,
  saveAccount: boolean,
): Promise<Response> {
  if (user.status !== "active") return errorRedirect(c, "login", "banned");

  if (saveAccount) {
    try {
      await saveInuAccount(c, user.id, profile, token, appSecret);
    } catch (e) {
      console.log("[inu] update account failed:", e instanceof Error ? e.message : e);
    }
  }

  await c.env.DB.prepare(
    "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now'), last_login_ua = ?, ua_fingerprint = ? WHERE id = ?",
  )
    .bind(getClientIp(c), getUa(c), await uaFingerprint(c), user.id)
    .run();

  const jwt = await signToken(
    { sub: String(user.id), username: user.username, role: user.role },
    appSecret,
  );
  await logUserAction(
    c.env.DB,
    user.id,
    "login_inu",
    `INU 登录 ${profile.inu_id || profile.sub}`,
    getClientIp(c),
    getUa(c),
  );

  return redirect(`${siteBase(c)}/user`, [inuStateCookie("", 0), sessionCookie(jwt)]);
}

async function exchangeToken(
  cfg: InuConfig,
  code: string,
  verifier: string,
): Promise<InuToken | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(`${cfg.origin}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Westworld-INU/1.0",
      },
      body,
      signal: controller.signal,
    });
    if (!resp.ok) {
      let errCode = "";
      try {
        const j = (await resp.json()) as { error?: unknown };
        errCode = typeof j.error === "string" ? j.error.slice(0, 60) : "";
      } catch {
        /* 非 JSON 错误体 */
      }
      console.log(`[inu] token exchange failed: HTTP ${resp.status}${errCode ? ` (${errCode})` : ""}`);
      return null;
    }
    const data = (await resp.json()) as Partial<InuToken>;
    if (typeof data.access_token !== "string" || !data.access_token) return null;
    return {
      access_token: data.access_token.slice(0, 4096),
      token_type: typeof data.token_type === "string" ? data.token_type : "Bearer",
      expires_in: Number(data.expires_in) || 3600,
      scope: typeof data.scope === "string" ? data.scope : "",
    };
  } catch {
    console.log("[inu] token exchange request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProfile(cfg: InuConfig, token: InuToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(`${cfg.origin}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "Westworld-INU/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.log(`[inu] userinfo failed: HTTP ${resp.status}`);
      return null;
    }
    return (await resp.json()) as Record<string, unknown>;
  } catch {
    console.log("[inu] userinfo request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function startFlow(
  c: Context<AppEnv>,
  mode: "login" | "bind",
  userId?: number,
): Promise<Response> {
  const cfg = await loadInuConfig(c.env, new URL(c.req.url).origin, c.env.DB);
  if (!cfg.enabled) return errorRedirect(c, mode, "config");

  const ip = getClientIp(c);
  if (!(await rateLimit(c.env.DB, `inu-start:${mode}:${ip}`, 30, 600))) {
    return errorRedirect(c, mode, "rate");
  }

  let appSecret: string;
  try {
    appSecret = getSecret(c);
  } catch {
    return errorRedirect(c, mode, "config");
  }

  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = await pkceChallenge(verifier);
  const payload: InuState = {
    state,
    verifier,
    mode,
    ...(mode === "bind" && userId ? { userId } : {}),
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const sealed = await encryptSecret(JSON.stringify(payload), appSecret);

  const url = new URL(`${cfg.origin}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (mode === "bind") url.searchParams.set("prompt", "consent");

  return redirect(url.toString(), [inuStateCookie(sealed)]);
}

// 登录入口：浏览器直接跳转（未配置时回到登录页提示）
app.get("/start", async (c) => startFlow(c, "login"));

// 已登录用户绑定 INU 账号（未登录/会话过期时回登录页，而不是返回 JSON）
app.get("/bind", async (c) => {
  const user = await sessionUser(c);
  if (!user) return redirect(`${siteBase(c)}/login?inu_error=state`, []);
  return startFlow(c, "bind", user.id);
});

// 公开状态：登录页据此决定是否显示「使用 INU 账号登录」
app.get("/status", async (c) => {
  const cfg = await loadInuConfig(c.env, new URL(c.req.url).origin, c.env.DB);
  return ok({
    enabled: cfg.enabled,
    redirect_uri: cfg.redirectUri,
    scopes: cfg.scopes,
    client_id_set: !!cfg.clientId,
  });
});

// 当前用户的 INU 绑定信息（不含 access_token）
app.get("/binding", async (c) => {
  const user = await sessionUser(c);
  if (!user) return ok(null);
  const row = await c.env.DB.prepare(
    `SELECT id, inu_sub, inu_id, name, preferred_username, orbit, avatar_text,
            tier, tier_label, email, email_verified, bound_at, updated_at
     FROM inu_accounts WHERE user_id = ?`,
  )
    .bind(user.id)
    .first();
  return ok(row ?? null);
});

// OAuth 回调
app.get("/callback", async (c) => {
  const cfg = await loadInuConfig(c.env, new URL(c.req.url).origin, c.env.DB);

  let appSecret: string;
  try {
    appSecret = getSecret(c);
  } catch {
    return errorRedirect(c, "login", "config");
  }

  const sealed = readCookie(c, "inu_oauth");
  let payload: InuState | null = null;
  try {
    const plain = await decryptSecret(sealed, appSecret);
    payload = JSON.parse(plain) as InuState;
  } catch {
    payload = null;
  }

  const mode: "login" | "bind" = payload?.mode === "bind" ? "bind" : "login";
  const state = str(c.req.query("state"), 200);
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.verifier !== "string" ||
    !timingSafeEqual(payload.state, state) ||
    !payload.exp ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return errorRedirect(c, mode, "state");
  }

  if (!(await rateLimit(c.env.DB, `inu-cb:${getClientIp(c)}`, 60, 600))) {
    return errorRedirect(c, mode, "rate");
  }

  const oauthError = str(c.req.query("error"), 100);
  if (oauthError) {
    return errorRedirect(c, mode, oauthError === "access_denied" ? "cancelled" : "unavailable");
  }

  const code = str(c.req.query("code"), 2048);
  if (!code) return errorRedirect(c, mode, "state");
  if (!cfg.enabled) return errorRedirect(c, mode, "config");

  const token = await exchangeToken(cfg, code, payload.verifier);
  if (!token) return errorRedirect(c, mode, "unavailable");

  const rawProfile = await fetchProfile(cfg, token);
  if (!rawProfile) return errorRedirect(c, mode, "unavailable");
  const profile = normalizeProfile(rawProfile);
  if (!profile.sub) return errorRedirect(c, mode, "unavailable");

  if (mode === "bind") {
    const userId = Number(payload.userId);
    if (!Number.isInteger(userId) || userId <= 0) return errorRedirect(c, "bind", "state");

    const user = await c.env.DB.prepare(
      "SELECT id, username, role, status FROM users WHERE id = ?",
    )
      .bind(userId)
      .first<LocalUser>();
    if (!user) return errorRedirect(c, "bind", "state");
    if (user.status !== "active") return errorRedirect(c, "bind", "banned");

    const other = await c.env.DB.prepare(
      "SELECT user_id FROM inu_accounts WHERE inu_sub = ?",
    )
      .bind(profile.sub)
      .first<{ user_id: number }>();
    if (other && other.user_id !== userId) return errorRedirect(c, "bind", "conflict");

    // 换绑到另一个 INU 账号时，先撤销旧 token
    const previous = await c.env.DB.prepare(
      "SELECT inu_sub FROM inu_accounts WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ inu_sub: string }>();
    if (previous && previous.inu_sub !== profile.sub) {
      await revokeInuTokenForUser(c.env, userId);
    }

    try {
      await saveInuAccount(c, userId, profile, token, appSecret);
    } catch (e) {
      console.log("[inu] bind failed:", e instanceof Error ? e.message : e);
      return errorRedirect(c, "bind", "unavailable");
    }

    await logUserAction(
      c.env.DB,
      userId,
      "bind_inu",
      `绑定 ${profile.inu_id || profile.sub}`,
      getClientIp(c),
      getUa(c),
    );
    return redirect(`${siteBase(c)}/user/security?inu_bound=1`, [inuStateCookie("", 0)]);
  }

  const existing = await findInuAccount(c.env.DB, profile.sub);
  if (existing) {
    return finishLogin(c, existing, profile, token, appSecret, true);
  }

  // 已验证邮箱若已属于本地账号，不自动合并，要求先用原账号登录后手动绑定
  if (profile.email_verified) {
    const emailRow = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(profile.email)
      .first();
    if (emailRow) return errorRedirect(c, "login", "email_exists");
  }

  const created = await createLocalUser(c, profile);
  if (!created.ok) {
    // 并发回调可能已经创建了同一 sub 的账号
    const raced = await findInuAccount(c.env.DB, profile.sub);
    if (raced) return finishLogin(c, raced, profile, token, appSecret, true);
    return errorRedirect(c, "login", created.code);
  }

  try {
    await saveInuAccount(c, created.user.id, profile, token, appSecret);
  } catch (e) {
    console.log("[inu] create binding failed:", e instanceof Error ? e.message : e);
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(created.user.id).run().catch(() => {});
    const raced = await findInuAccount(c.env.DB, profile.sub);
    if (raced) return finishLogin(c, raced, profile, token, appSecret, true);
    return errorRedirect(c, "login", "unavailable");
  }

  return finishLogin(c, created.user, profile, token, appSecret, false);
});

// 解绑
app.post("/unbind", async (c) => {
  const user = await sessionUser(c);
  if (!user) return fail("未登录", 401);
  await revokeInuTokenForUser(c.env, user.id);
  await c.env.DB.prepare("DELETE FROM inu_accounts WHERE user_id = ?").bind(user.id).run();
  await logUserAction(c.env.DB, user.id, "unbind_inu", "解绑 INU 账号", getClientIp(c), getUa(c));
  return ok({ unbound: true });
});

/** 管理后台「三方集成」展示用状态（不含任何密钥明文） */
export async function inuAdminStatus(c: Context<AppEnv>) {
  const cfg = await loadInuConfig(c.env, new URL(c.req.url).origin, c.env.DB);
  const mask = (s: string) => (s ? `${s.slice(0, 8)}****` : "");
  let bound = 0;
  try {
    const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM inu_accounts").first<{ n: number }>();
    bound = Number(row?.n) || 0;
  } catch {
    /* 表尚未建立时不阻塞状态展示 */
  }
  return {
    enabled: cfg.enabled,
    client_id: mask(cfg.clientId),
    client_secret_set: !!cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    scopes: cfg.scopes,
    origin: cfg.origin,
    bound_users: bound,
  };
}

export default app;
