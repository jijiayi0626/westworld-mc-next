import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, getSecret } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isValidPlayerName, isValidUuid, str } from "../lib/validate";
import { signToken, verifyToken } from "../lib/jwt";
import { logUserAction } from "../lib/log";
import { getClientIp, getUa } from "../lib/net";

const app = new Hono<AppEnv>();

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

// 构造授权链接（未配置 MS_* 时返回占位说明）
app.get("/authorize-url", requireAuth, async (c) => {
  const user = c.get("user")!;

  if (c.env.MICROSOFT_OAUTH_ENABLED !== "true") {
    return ok({
      enabled: false,
      message: "微软账号绑定未启用。请先在管理后台配置 MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET 与回调地址。",
    });
  }

  const redirectUri = `${c.env.SITE_URL || ""}/api/microsoft/callback`;
  const state = await signToken({ sub: String(user.id), username: user.username, role: "oauth" }, getSecret(c));
  const url =
    `${MS_AUTHORIZE}?client_id=${encodeURIComponent(c.env.MICROSOFT_CLIENT_ID as string)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=XboxLive.signin%20offline_access&state=${encodeURIComponent(state)}`;

  return ok({ enabled: true, url });
});

// OAuth 回调（登录完成，浏览器跳转回来）
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return fail("OAuth 回调参数缺失", 400);

  const payload = await verifyToken(state, getSecret(c));
  if (!payload || payload.role !== "oauth") return fail("state 校验失败", 400);
  const userId = Number(payload.sub);

  // 仅一个绑定入口：未登录时若携带 user context？本实现要求先登录再绑定
  // （简化：回调携带 user id；生产建议换成一次性的短时 state 绑定临时会话）
  const user = await c.env.DB.prepare(
    "SELECT id, username FROM users WHERE id = ?",
  ).bind(userId).first<{ id: number; username: string }>();
  if (!user) return fail("用户不存在", 404);

  if (!c.env.MICROSOFT_CLIENT_ID || !c.env.MICROSOFT_CLIENT_SECRET) {
    return fail("微软 OAuth 未配置", 503);
  }

  const redirectUri = `${c.env.SITE_URL || ""}/api/microsoft/callback`;

  // 1. 换 access_token
  const tokenResp = await fetch(MS_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.MICROSOFT_CLIENT_ID as string,
      client_secret: c.env.MICROSOFT_CLIENT_SECRET as string,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: "XboxLive.signin offline_access",
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

export default app;