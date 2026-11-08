import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { notifyAdmins, type MailEvent } from "./mail";

/** 站内通知总开关（后台「消息通知设置」）：默认开启，任何异常都按开启处理 */
export async function siteNotifyEnabled(db: D1Database): Promise<boolean> {
  try {
    const row = await db
      .prepare("SELECT value FROM site_settings WHERE key = 'site_notify_enabled'")
      .first<{ value: string }>();
    return row?.value !== "false";
  } catch {
    return true;
  }
}

/** 后台异步发送管理员通知邮件；不阻塞响应，失败静默 */
export function queueAdminMail(c: Context<AppEnv>, event: MailEvent, title: string, bodyHtml: string): void {
  const task = notifyAdmins(c.env.DB, event, title, bodyHtml);
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }
}
