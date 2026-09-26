// 日志与操作记录
import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { getClientIp, getUa } from "./net";

/**
 * 记录用户操作日志（表 user_logs）
 * action: login / register / change_password / bind_microsoft / ...
 */
export async function logUserAction(
  db: D1Database,
  userId: number,
  action: string,
  detail = "",
  ip = "",
  ua = "",
): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO user_logs (user_id, action, ip, ua, detail) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(userId, action, ip, ua, detail.slice(0, 500))
      .run();
  } catch {
    // 日志失败不阻断主流程
  }
}

/**
 * 记录管理员操作日志（表 op_logs）
 */
export async function logOp(
  db: D1Database,
  ctx: Context<AppEnv>,
  operatorId: number | null,
  action: string,
  target = "",
  detail = "",
): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO op_logs (operator_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(operatorId, action, target, detail.slice(0, 500), getClientIp(ctx))
      .run();
  } catch {
    // 忽略
  }
}

export function clientMeta(c: Context<AppEnv>): { ip: string; ua: string } {
  return { ip: getClientIp(c), ua: getUa(c) };
}