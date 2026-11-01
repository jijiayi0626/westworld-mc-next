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
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
};

const app = new Hono<AppEnv>();

// 挂载于 /static 前缀下，子路由匹配去前缀后的路径，用完整 req.path 提取 key
/** 仅允许公开资源前缀；backups/ 等私有对象不得经此路由暴露 */
const PUBLIC_PREFIXES = ["uploads/", "assets/", "png/", "egg/", "gallery/"];

app.get("/*", async (c) => {
  const key = c.req.path.replace(/^\/static\//, "");
  if (!key || key.includes("..")) return c.notFound();
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return c.notFound();
  const obj = await c.env.ASSETS?.get(key);
  if (!obj) return c.notFound();
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "ETag": obj.httpEtag,
  };
  // 压缩包/Office 文档强制下载，避免浏览器直接打开
  if ([".zip", ".doc", ".docx", ".xls", ".xlsx"].includes(ext)) {
    const filename = key.split("/").pop() || "download";
    headers["Content-Disposition"] = `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`;
  }
  return new Response(obj.body, { headers });
});

export default app;
