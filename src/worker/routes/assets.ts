import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";

// 静态资源代理：/static/* -> R2 bucket（图片等大文件，避免打入 Worker bundle）
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
};

const app = new Hono<AppEnv>();

// 挂载于 /static 前缀下，子路由匹配去前缀后的路径，用完整 req.path 提取 key
app.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/static\//, "");
  if (!key) return c.notFound();
  const obj = await c.env.ASSETS?.get(key);
  if (!obj) return c.notFound();
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  return new Response(obj.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": obj.httpEtag,
    },
  });
});

export default app;
