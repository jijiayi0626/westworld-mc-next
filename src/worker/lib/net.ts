// 客户端 IP / UA / UA 指纹 / CSRF token
import type { Context } from "hono";
import type { AppEnv } from "./auth";

export function getClientIp(c: Context<AppEnv>): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
}

export function getUa(c: Context<AppEnv>): string {
  return c.req.header("user-agent") || "";
}

// 基于 UA + Accept + 语言生成的轻量指纹（不唯一，用于风控参考）
export async function uaFingerprint(c: Context<AppEnv>): Promise<string> {
  const ua = getUa(c);
  const accept = c.req.header("accept") || "";
  const lang = c.req.header("accept-language") || "";
  const raw = `${ua}|${accept}|${lang}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function genCsrfToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(24));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 生成随机数字验证码（找回密码）
export function genCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
  return s;
}