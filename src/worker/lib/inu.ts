// INU OAuth 2.0（Authorization Code + PKCE）配置与安全工具
import type { AppEnv } from "./auth";
import { decryptSecret } from "./cipher";

const DEFAULT_ORIGIN = "https://inu-space-pass.mr-jijiayi.workers.dev";

export interface InuConfig {
  origin: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  enabled: boolean;
}

function safeOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
      return url.origin;
    }
  } catch {
    /* 配置无效时回退官方地址 */
  }
  return DEFAULT_ORIGIN;
}

function sanitizeScopes(raw: string): string {
  const allowed = new Set(["profile", "email"]);
  const list = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => allowed.has(s));
  if (!list.includes("profile")) list.unshift("profile");
  return [...new Set(list)].join(" ");
}

/**
 * 读取 INU OAuth 配置。
 * - INU_CLIENT_ID 存在即视为启用（公开客户端可以不配 secret）
 * - INU_REDIRECT_URI 未配置时回退到 `${SITE_URL}/api/inu/callback`
 */
export function loadInuConfig(env: AppEnv["Bindings"], requestOrigin: string): InuConfig {
  const origin = safeOrigin(String(env.INU_ORIGIN || DEFAULT_ORIGIN));
  const clientId = String(env.INU_CLIENT_ID || "").trim();
  const clientSecret = String(env.INU_CLIENT_SECRET || "").trim();
  const fallbackOrigin = String(env.SITE_URL || requestOrigin || "").replace(/\/+$/, "");
  const redirectUri = String(env.INU_REDIRECT_URI || "").trim() || `${fallbackOrigin}/api/inu/callback`;

  let redirectOk = false;
  try {
    const url = new URL(redirectUri);
    redirectOk =
      url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    redirectOk = false;
  }

  return {
    origin,
    clientId,
    clientSecret,
    redirectUri,
    scopes: sanitizeScopes(String(env.INU_SCOPES || "profile email")),
    enabled: !!clientId && redirectOk,
  };
}

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** OAuth state + PKCE verifier 的 HttpOnly 一次性 Cookie */
export function inuStateCookie(value: string, maxAge = 600): string {
  return `inu_oauth=${encodeURIComponent(value)}; Path=/api/inu; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * 撤销某个用户保存的 INU access_token（退出登录 / 解绑时调用）。
 * 无论撤销接口是否成功，都会先清除本地保存的令牌；失败不影响登出。
 */
export async function revokeInuTokenForUser(
  env: AppEnv["Bindings"],
  userId: number,
): Promise<void> {
  try {
    const row = await env.DB.prepare(
      "SELECT access_token_enc, token_expires_at FROM inu_accounts WHERE user_id = ?",
    )
      .bind(userId)
      .first<{ access_token_enc: string; token_expires_at: number | null }>();
    if (!row?.access_token_enc) return;

    const appSecret = String(env.APP_SECRET || "");
    if (!appSecret) return;
    const token = await decryptSecret(row.access_token_enc, appSecret);
    if (!token) return;

    const cfg = loadInuConfig(env, String(env.SITE_URL || "https://localhost"));
    if (cfg.clientId) {
      const body = new URLSearchParams({ token, client_id: cfg.clientId });
      if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        await fetch(`${cfg.origin}/oauth/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: controller.signal,
        });
      } catch {
        // 撤销接口不可用时忽略；令牌会在 1 小时后自然过期
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    // 读取/解密失败不阻断登出
  } finally {
    try {
      await env.DB.prepare(
        "UPDATE inu_accounts SET access_token_enc = '', token_expires_at = NULL WHERE user_id = ?",
      )
        .bind(userId)
        .run();
    } catch {
      /* 清理失败时保留密文，下次登出继续尝试 */
    }
  }
}
