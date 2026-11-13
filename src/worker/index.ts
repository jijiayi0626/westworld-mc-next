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
import pointsRoutes from "./routes/points";
import presenceRoutes from "./routes/presence";
import monitorRoutes from "./routes/monitor";
import rconRoutes from "./routes/rcon";
import uploadRoutes from "./routes/upload";
import assetsRoutes from "./routes/assets";
import rainyunRoutes from "./routes/rainyun";
import backupRoutes from "./routes/backup";
import { maybeRunMaintenance } from "./lib/maintenance";
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
app.route("/api/points", pointsRoutes);
app.route("/api/presence", presenceRoutes);
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

// 健康检查（同时兼容结尾带 / 的写法，浏览器/监控工具常见）
app.on("GET", ["/api/health", "/api/health/"], (c) =>
  c.json({ code: 0, message: "ok", data: { app: "mc-next", ts: Date.now() } }),
);

// 数据库健康检查：同时探测主库与论坛库，任一失败返回 500，便于外部监控告警
app.on("GET", ["/api/health/db", "/api/health/db/"], async (c) => {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  const probe = async (name: string, db?: D1Database) => {
    if (!db) {
      checks[name] = { ok: false, error: "未绑定" };
      return;
    }
    try {
      await db.prepare("SELECT 1").first();
      checks[name] = { ok: true };
    } catch (e) {
      checks[name] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  await Promise.all([probe("DB", c.env.DB), probe("FORUM_DB", c.env.FORUM_DB)]);
  const healthy = Object.values(checks).every((v) => v.ok);

  return c.json(
    {
      code: healthy ? 0 : 1,
      message: healthy ? "ok" : "db error",
      data: { checks, latency_ms: Date.now() - started, ts: Date.now() },
    },
    healthy ? 200 : 500,
  );
});

// 404 兜底
app.notFound((c) => c.json({ code: 404, message: "接口不存在", data: null }, 404));

// 全局异常兜底：任何未捕获异常都返回统一 JSON，避免客户端拿到 HTML/纯文本错误
// （前端 api() 依赖 JSON 结构；透出堆栈既无用也可能泄露内部信息）
app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path} ->`, err instanceof Error ? err.stack || err.message : err);
  return c.json({ code: 500, message: "服务器内部错误，请稍后再试", data: null }, 500);
});

export default {
  // 维护任务不再依赖 cron：有 API 请求时惰性触发，5 分钟内只跑一次，
  // 由 site_settings.maintenance_lock 原子抢占，避免并发重复执行。
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      ctx.waitUntil(maybeRunMaintenance(env));
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;

export { RconDO };
