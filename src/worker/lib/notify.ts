import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { notifyAdmins, type MailEvent } from "./mail";

/** 后台异步发送管理员通知邮件；不阻塞响应，失败静默 */
export function queueAdminMail(c: Context<AppEnv>, event: MailEvent, title: string, bodyHtml: string): void {
  const task = notifyAdmins(c.env.DB, event, title, bodyHtml);
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }
}
