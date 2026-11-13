import type { AppEnv } from "./auth";
import { checkAllServers } from "../routes/monitor";
import { processDeliveryQueue, expireStaleOrders } from "../routes/shop";

/**
 * 轻量维护任务：原本由 5 分钟 cron 触发，现在改为「有 API 请求时惰性触发」。
 * 用 site_settings.maintenance_lock 做原子抢占，保证同一时间只跑一次。
 */
const INTERVAL_SECONDS = 300;
const LOCK_KEY = "maintenance_lock";

export async function runMaintenance(env: AppEnv["Bindings"]) {
  // 心跳：后台「系统健康」据此判断维护任务是否存活
  await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('last_cron_run', datetime('now'), datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = datetime('now'), updated_at = datetime('now')`,
  ).run();

  // 清理过期限流记录，避免 rate_limits 无限增长
  try {
    await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
      .bind(Math.floor(Date.now() / 1000) - 3600)
      .run();
  } catch {
    /* 表不存在时忽略 */
  }

  // 商城：补发失败订单 + 取消超时未支付订单并归还库存
  try {
    await processDeliveryQueue(env);
    await expireStaleOrders(env);
  } catch {
    /* 表未迁移或单笔异常时忽略，等待下一轮 */
  }

  // 服务器巡检：按 monitor_interval_minutes（默认 15 分钟）判断是否到期
  const intervalRow = await env.DB.prepare(
    "SELECT value FROM site_settings WHERE key = 'monitor_interval_minutes'",
  ).first<{ value: string }>();
  const minutes = Math.max(5, Math.min(1440, Number(intervalRow?.value) || 15));
  const { results } = await env.DB.prepare("SELECT last_check FROM game_servers").all<{
    last_check: string | null;
  }>();
  const now = Date.now();
  const isStale = (row: { last_check: string | null }) => {
    if (!row.last_check) return true;
    const t = new Date(row.last_check.replace(" ", "T") + "Z").getTime();
    return Number.isNaN(t) || now - t > minutes * 60_000 - 30_000;
  };
  if (results.some(isStale)) {
    await checkAllServers(env.DB);
  }
}

/** 请求驱动的惰性维护：到期才执行，未到期直接返回 */
export async function maybeRunMaintenance(env: AppEnv["Bindings"]) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, '0')")
      .bind(LOCK_KEY)
      .run();
    const claimed = await env.DB.prepare(
      "UPDATE site_settings SET value = ?, updated_at = datetime('now') WHERE key = ? AND CAST(value AS INTEGER) < ?",
    )
      .bind(String(now), LOCK_KEY, String(now - INTERVAL_SECONDS))
      .run();
    if (!claimed.meta.changes) return;
  } catch {
    // 抢占失败（并发或表缺失）时放弃本轮
    return;
  }

  try {
    await runMaintenance(env);
  } catch {
    // 维护失败不影响主服务，等待下一轮
  }
}
