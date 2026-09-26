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
    c.set("session", payload);
    c.set("user", { id: Number(payload.sub), username: payload.username, role: payload.role });
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