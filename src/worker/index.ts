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
import monitorRoutes from "./routes/monitor";
import rconRoutes from "./routes/rcon";
import uploadRoutes from "./routes/upload";
import assetsRoutes from "./routes/assets";
import { RconDO } from "./do/rcon-do";

const app = new Hono<AppEnv>();

// CORS（默认同域部署不开启；仅当配置 CORS_ORIGINS/SITE_URL 时按白名单放行，防止任意站点携带 Cookie 跨域调用）
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  const siteUrl = c.env.SITE_URL ? String(c.env.SITE_URL).replace(/\/$/, "") : "";
  const allowList = String(c.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (origin && (allowList.includes(origin) || (siteUrl && origin === siteUrl))) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
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
app.route("/api/monitor", monitorRoutes);
app.route("/api/rcon", rconRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/static", assetsRoutes);

// 健康检查
app.get("/api/health", (c) => c.json({ code: 0, message: "ok", data: { app: "mc-next", ts: Date.now() } }));

// 404 兜底
app.notFound((c) => c.json({ code: 404, message: "接口不存在", data: null }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<AppEnv["Bindings"]>;

export { RconDO };
