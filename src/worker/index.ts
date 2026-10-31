/// <reference types="@cloudflare/workers-types" />

import { Hono } from "hono";
import type { AppEnv } from "./lib/auth";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import adminRoutes from "./routes/admin";
import contentRoutes from "./routes/content";
import announceRoutes from "./routes/announce";
import contactRoutes from "./routes/contact";
import ticketRoutes from "./routes/ticket";
import applicationRoutes from "./routes/application";
import aiRoutes from "./routes/ai";
import shopRoutes from "./routes/shop";
import payRoutes from "./routes/pay";
import microsoftRoutes from "./routes/microsoft";
import inuRoutes from "./routes/inu";
import upopRoutes from "./routes/upop";
import chatRoutes from "./routes/chat";
import forumRoutes from "./routes/forum";
import monitorRoutes from "./routes/monitor";
import { checkAllServers } from "./routes/monitor";
import rconRoutes from "./routes/rcon";
import uploadRoutes from "./routes/upload";
import assetsRoutes from "./routes/assets";
import rainyunRoutes from "./routes/rainyun";
import backupRoutes from "./routes/backup";
import { processDeliveryQueue, expireStaleOrders } from "./routes/shop";
import { RconDO } from "./do/rcon-do";

const app = new Hono<AppEnv>();

// CORS + CSRF 同源校验（默认同域部署不开启 CORS；配置 CORS_ORIGINS/SITE_URL 时按白名单放行）
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin") || "";
  const siteUrl = c.env.SITE_URL ? String(c.env.SITE_URL).replace(/\/$/, "") : "";
  const allowList = String(c.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowedOrigin =
    origin && (allowList.includes(origin) || (siteUrl && origin === siteUrl)) ? origin : "";

  if (c.req.method === "OPTIONS") {
    if (allowedOrigin) {
      c.header("Access-Control-Allow-Origin", allowedOrigin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Vary", "Origin");
    }
    return c.body(null, 204);
  }

  // CSRF：Cookie 鉴权的写操作必须来自同源（或显式 CORS 白名单）；Bearer 客户端不受影响
  const bearer = (c.req.header("authorization") || "").startsWith("Bearer ");
  if (!bearer && !["GET", "HEAD"].includes(c.req.method)) {
    const fetchSite = c.req.header("sec-fetch-site");
    if (fetchSite === "cross-site") {
      return c.json({ code: 403, message: "跨站请求已拒绝", data: null }, 403);
    }
    let source = origin;
    if (!source) {
      const referer = c.req.header("referer");
      if (referer) {
        try {
          source = new URL(referer).origin;
        } catch {
          source = "";
        }
      }
    }
    if (source) {
      const reqOrigin = new URL(c.req.url).origin;
      const trusted =
        source === reqOrigin || (!!siteUrl && source === siteUrl) || allowList.includes(source);
      if (!trusted) {
        return c.json({ code: 403, message: "跨站请求已拒绝", data: null }, 403);
      }
    }
  }

  await next();

  // 必须在 next() 之后写入：ok()/fail() 返回裸 Response，之前的 c.header 会被丢弃
  if (allowedOrigin) {
    c.header("Access-Control-Allow-Origin", allowedOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
  }
});

app.route("/api/auth", authRoutes);
app.route("/api/user", userRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/content", contentRoutes);
app.route("/api/announce", announceRoutes);
app.route("/api/contact", contactRoutes);
app.route("/api/ticket", ticketRoutes);
app.route("/api/application", applicationRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/shop", shopRoutes);
app.route("/api/pay", payRoutes);
app.route("/api/microsoft", microsoftRoutes);
app.route("/api/inu", inuRoutes);
app.route("/api/upop", upopRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/forum", forumRoutes);
app.route("/api/monitor", monitorRoutes);
app.route("/api/rcon", rconRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/rainyun", rainyunRoutes);
app.route("/api/backup", backupRoutes);
app.route("/static", assetsRoutes);

// 健康检查
app.get("/api/health", (c) => c.json({ code: 0, message: "ok", data: { app: "mc-next", ts: Date.now() } }));

// 404 兜底
app.notFound((c) => c.json({ code: 404, message: "接口不存在", data: null }, 404));

// 全局异常兜底：任何未捕获异常都返回统一 JSON，避免客户端拿到 HTML/纯文本错误
// （前端 api() 依赖 JSON 结构；透出堆栈既无用也可能泄露内部信息）
app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path} ->`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ code: 500, message: "服务器内部错误，请稍后再试", data: null }, 500);
});

export default {
  fetch: app.fetch,
  // 定时服务器巡检：cron 每 5 分钟触发一次；实际巡检间隔由
  // site_settings.monitor_interval_minutes 控制（后台「服务器监控」可设置，默认 15 分钟），
  // 未到期的触发直接跳过，避免无谓的外部 API 调用。
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        try {
          // 心跳：每次 cron 触发都记录时间（后台「系统健康」据此判断巡检是否存活）
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
        } catch {
          // 定时任务失败不影响主服务，等待下一轮
        }
      })(),
    );
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;

export { RconDO };
