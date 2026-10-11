// 轻量限流与 IP 黑名单（基于 D1，固定时间窗口计数）
import type { AppEnv } from "./auth";

type DB = AppEnv["Bindings"]["DB"];

/** 固定窗口限流：同一 key 在 windowSec 内最多 limit 次。返回 true = 放行 */
export async function rateLimit(db: DB, key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `${key}:${bucket}`;
  try {
    const row = await db.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
    )
      .bind(k, Math.floor(Date.now() / 1000) + windowSec)
      .first<{ count: number }>();
    return (row?.count ?? 1) <= limit;
  } catch {
    // 表不存在等异常时放行，不阻断业务
    return true;
  }
}

/** IP 是否在黑名单 */
export async function isBlacklisted(db: DB, ip: string): Promise<boolean> {
  if (!ip || ip === "0.0.0.0") return false;
  try {
    const row = await db.prepare("SELECT 1 FROM ip_blacklist WHERE ip = ? LIMIT 1").bind(ip).first();
    return !!row;
  } catch {
    return false;
  }
}
