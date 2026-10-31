import type { Context, Next } from "hono";
import { verifyToken, type JwtPayload } from "./jwt";

export interface UserSession {
  id: number;
  username: string;
  role: string;
}

export interface AppEnv {
  Bindings: {
    DB: D1Database;
    FORUM_DB?: D1Database;
    ASSETS?: R2Bucket;
    APP_SECRET?: string;
    TOKEN_TTL_HOURS?: string;
    RCON?: DurableObjectNamespace;
    [key: string]: unknown;
  };
  Variables: {
    user?: UserSession;
    session?: JwtPayload;
    clientIp: string;
    isAdmin?: boolean;
  };
}

function getSecret(c: Context<AppEnv>): string {
  const s = c.env.APP_SECRET;
  if (!s || s.length < 16) {
    throw new Error("APP_SECRET 未配置（至少 16 字符）");
  }
  return s as string;
}

/** 统一会话 Cookie：HttpOnly + Secure + SameSite=Lax（登录 / INU OAuth 共用） */
export function sessionCookie(token: string, maxAge = 7 * 86400): string {
  return `auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// 从 Authorization: Bearer 或 Cookie auth_token 读取令牌
function readToken(c: Context<AppEnv>): string | null {
  const auth = c.req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = c.req.header("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 必须登录
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  try {
    const token = readToken(c);
    if (!token) {
      return c.json({ code: 401, message: "未登录", data: null }, 401);
    }
    const payload = await verifyToken(token, getSecret(c));
    if (!payload) {
      return c.json({ code: 401, message: "登录已过期", data: null }, 401);
    }
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ code: 401, message: "登录已过期", data: null }, 401);
    }
    // 每次都从数据库读取最新状态：封禁/降权立即生效，不能等 JWT 过期
    const row = await c.env.DB.prepare(
      "SELECT id, username, role, status FROM users WHERE id = ?",
    )
      .bind(id)
      .first<{ id: number; username: string; role: string; status: string }>();
    if (!row) {
      return c.json({ code: 401, message: "账号不存在", data: null }, 401);
    }
    if (row.status !== "active") {
      return c.json({ code: 403, message: "账号已被封禁", data: null }, 403);
    }
    c.set("session", payload);
    c.set("user", { id: row.id, username: row.username, role: row.role });
    await next();
  } catch (e) {
    return c.json({ code: 500, message: (e as Error).message, data: null }, 500);
  }
}

// 管理员
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ code: 403, message: "无权限", data: null }, 403);
  }
  await next();
}

export { getSecret, readToken };