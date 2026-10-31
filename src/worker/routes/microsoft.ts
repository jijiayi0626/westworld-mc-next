import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, getSecret } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isValidPlayerName, isValidUuid, str } from "../lib/validate";
import { signToken, verifyToken } from "../lib/jwt";
import { logUserAction } from "../lib/log";
import { getClientIp, getUa } from "../lib/net";
import { encryptSecret, decryptSecret } from "../lib/cipher";

const app = new Hono<AppEnv>();

// 一次性 OAuth state + PKCE：state 里的 jti 存 D1，回调时原子删除，
// 避免 state 被截获后重复使用；code_verifier 加密存储，只用于本次换票。
let oauthStateReady = false;
async function ensureOAuthStateSchema(db: D1Database): Promise<void> {
  if (oauthStateReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS oauth_states (
        jti TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        verifier_enc TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    )
    .run();
  oauthStateReady = true;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// 微软 OAuth 端点
const MS_AUTHORIZE = "https://login.live.com/oauth20_authorize.srf";
const MS_TOKEN = "https://login.live.com/oauth20_token.srf";
const XBL_AUTH = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_PROFILE = "https://api.minecraftservices.com/minecraft/profile";

interface MsTokenResp {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface MsConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

/**
 * 读取微软 OAuth 配置：优先 site_settings.ms_oauth_config（后台可视化配置），
 * 回退环境变量 MICROSOFT_OAUTH_ENABLED / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET。
 */
async function loadMsConfig(c: { env: AppEnv["Bindings"] }): Promise<MsConfig> {
  const row = await c.env.DB.prepare(
    "SELECT value FROM site_settings WHERE key = 'ms_oauth_config'",
  ).first<{ value: string }>();
  if (row?.value) {
    try {
      const j = JSON.parse(row.value) as Record<string, unknown>;
      const clientId = typeof j.client_id === "string" ? j.client_id.trim() : "";
      const clientSecret = typeof j.client_secret === "string" ? j.client_secret.trim() : "";
      if (clientId || clientSecret) {
        return { enabled: j.enabled === true, clientId, clientSecret };
      }
    } catch {
      /* 配置损坏时走环境变量 */
    }
  }
  return {
    enabled: c.env.MICROSOFT_OAUTH_ENABLED === "true",
    clientId: (c.env.MICROSOFT_CLIENT_ID as string) || "",
    clientSecret: (c.env.MICROSOFT_CLIENT_SECRET as string) || "",
  };
}

// 构造授权链接（未配置时返回占位说明）
app.get("/authorize-url", requireAuth, async (c) => {
  const user = c.get("user")!;
  const ms = await loadMsConfig(c);

  if (!ms.enabled || !ms.clientId || !ms.clientSecret) {
    return ok({
      enabled: false,
      message: "微软账号绑定未启用。请先在管理后台「网站设置 → 三方接口预留」中填写 Client ID / Secret 并启用。",
    });
  }

  const redirectUri = `${c.env.SITE_URL || ""}/api/microsoft/callback`;
  const secret = getSecret(c);
  const jti = randomToken(18);
  const verifier = randomToken(32);
  const challenge = await pkceChallenge(verifier);

  try {
    await ensureOAuthStateSchema(c.env.DB);
    await c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < unixepoch()").run();
    await c.env.DB.prepare(
      "INSERT INTO oauth_states (jti, user_id, verifier_enc, expires_at) VALUES (?, ?, ?, ?)",
    )
      .bind(jti, user.id, await encryptSecret(verifier, secret), Math.floor(Date.now() / 1000) + 15 * 60)
      .run();
  } catch (e) {
    console.log("[microsoft] oauth state init failed:", e instanceof Error ? e.message : e);
    return fail("OAuth 状态初始化失败，请稍后再试", 500);
  }

  // state 仅 15 分钟有效，且 jti 会在回调时一次性消费
  const state = await signToken(
    { sub: String(user.id), username: user.username, role: "oauth", jti },
    secret,
    15 / 60,
  );
  const url =
    `${MS_AUTHORIZE}?client_id=${encodeURIComponent(ms.clientId)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=XboxLive.signin%20offline_access&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;

  return ok({ enabled: true, url });
});

// OAuth 回调（登录完成，浏览器跳转回来）
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return fail("OAuth 回调参数缺失", 400);

  const payload = await verifyToken(state, getSecret(c));
  if (!payload || payload.role !== "oauth" || !payload.jti) return fail("state 校验失败", 400);
  const userId = Number(payload.sub);
  if (!userId) return fail("state 校验失败", 400);

  // state 一次性消费：原子删除并取回本次 PKCE verifier
  let stateRow: { verifier_enc: string } | null = null;
  try {
    stateRow = await c.env.DB.prepare(
      "DELETE FROM oauth_states WHERE jti = ? AND user_id = ? AND expires_at > unixepoch() RETURNING verifier_enc",
    )
      .bind(payload.jti, userId)
      .first<{ verifier_enc: string }>();
  } catch {
    stateRow = null;
  }
  if (!stateRow) return fail("state 已失效，请重新发起绑定", 400);
  const verifier = await decryptSecret(stateRow.verifier_enc, getSecret(c));

  // 仅一个绑定入口：未登录时若携带 user context？本实现要求先登录再绑定
  // （简化：回调携带 user id；生产建议换成一次性的短时 state 绑定临时会话）
  const user = await c.env.DB.prepare(
    "SELECT id, username FROM users WHERE id = ?",
  ).bind(userId).first<{ id: number; username: string }>();
  if (!user) return fail("用户不存在", 404);

  const ms = await loadMsConfig(c);
  if (!ms.clientId || !ms.clientSecret) {
    return fail("微软 OAuth 未配置", 503);
  }

  const redirectUri = `${c.env.SITE_URL || ""}/api/microsoft/callback`;

  // 1. 换 access_token
  const tokenResp = await fetch(MS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ms.clientId,
      client_secret: ms.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: "XboxLive.signin offline_access",
      ...(verifier ? { code_verifier: verifier } : {}),
    }),
  });
  if (!tokenResp.ok) return fail("获取 access_token 失败", 502);
  const token = (await tokenResp.json()) as MsTokenResp;

  // 2. XBL 认证
  const xblResp = await fetch(XBL_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${token.access_token}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });
  if (!xblResp.ok) return fail("XBL 认证失败", 502);
  const xbl = (await xblResp.json()) as { Token: string; DisplayClaims?: { xui?: { uhs?: string }[] } };

  // 3. XSTS 认证
  const xstsResp = await fetch(XSTS_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    }),
  });
  const xstsData = (await xstsResp.json()) as {
    Token?: string;
    DisplayClaims?: { xui?: { uhs?: string }[] };
    XErr?: number;
  };
  if (!xstsResp.ok || !xstsData.Token) {
    const err = xstsData.XErr;
    const msg = err === 2148916233
      ? "该账号未满 18 岁，无法使用三方登录"
      : err === 2148916235
        ? "该账号没有 Xbox 档案，请先创建"
        : err === 2148916238
          ? "该账号所属区域暂不支持"
          : "XSTS 认证失败";
    return fail(msg, 502);
  }
  const uhs = xstsData.DisplayClaims?.xui?.[0]?.uhs;
  if (!uhs) return fail("XSTS 返回缺少 uhs", 502);

  // 4. 获取 Minecraft Profile（用户名 + UUID）
  const mcResp = await fetch(MC_PROFILE, {
    headers: { Authorization: `XBL3.0 x=${uhs};${xstsData.Token}` },
  });
  if (mcResp.status === 404) {
    return fail("该微软账号未购买 Minecraft Java 版", 502);
  }
  if (!mcResp.ok) return fail("获取 Minecraft 档案失败", 502);
  const profile = (await mcResp.json()) as { id?: string; name?: string };

  if (!profile.id || !profile.name) return fail("Minecraft 档案缺失", 502);

  // 5. 存储绑定
  const existing = await c.env.DB.prepare(
    "SELECT id, user_id FROM microsoft_bindings WHERE ms_account_id = ?",
  ).bind(profile.id).first<{ id: number; user_id: number }>();
  if (existing && existing.user_id !== userId) {
    return fail("该 Minecraft 账号已绑定其他用户", 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO microsoft_bindings (user_id, ms_account_id, ms_username, mc_uuid, mc_username, refresh_token, bound_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       ms_account_id = excluded.ms_account_id,
       ms_username = excluded.ms_username,
       mc_uuid = excluded.mc_uuid,
       mc_username = excluded.mc_username,
       refresh_token = excluded.refresh_token,
       bound_at = datetime('now')`,
  )
    .bind(userId, profile.id, profile.name, profile.id, profile.name, token.refresh_token || "")
    .run();

  await logUserAction(c.env.DB, userId, "bind_microsoft", `绑定 ${profile.name}`, getClientIp(c), getUa(c));

  // 跳回用户中心
  return c.redirect(`${c.env.SITE_URL || ""}/user/security?bound=1`);
});

// 解绑
app.post("/unbind", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare("DELETE FROM microsoft_bindings WHERE user_id = ?").bind(user.id).run();
  await logUserAction(c.env.DB, user.id, "unbind_microsoft", "解绑微软账号", getClientIp(c), getUa(c));
  return ok({ unbound: true });
});

// 管理端状态（/admin/integrations、/admin/health 使用，密钥不外泄）
export async function msAdminStatus(c: { env: AppEnv["Bindings"] }) {
  const ms = await loadMsConfig(c);
  const mask = (s: string) => (s ? `${s.slice(0, 4)}****` : "");
  return {
    enabled: ms.enabled && !!ms.clientId && !!ms.clientSecret,
    client_id: ms.clientId ? mask(ms.clientId) : "",
    client_secret_set: !!ms.clientSecret,
    callback_url: `${c.env.SITE_URL || ""}/api/microsoft/callback`,
  };
}

export default app;