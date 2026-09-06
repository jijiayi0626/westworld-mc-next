import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";

const app = new Hono<AppEnv>();

const MAX_AVATAR = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE = 8 * 1024 * 1024; // 8MB
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extOf(type: string): string {
  return ALLOWED[type] || "";
}

/** 校验并保存到 R2，返回公开路径 */
async function saveToR2(
  c: { env: AppEnv["Bindings"] },
  key: string,
  body: ArrayBuffer,
  type: string,
): Promise<string> {
  const bucket = c.env.ASSETS;
  if (!bucket) throw new Error("R2 未绑定");
  await bucket.put(key, body, { httpMetadata: { contentType: type } });
  return `/static/${key}`;
}

// 上传头像（登录；限制 2MB，仅图片类型）
app.post("/avatar", requireAuth, async (c) => {
  const user = c.get("user")!;
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail("无法解析上传内容");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少文件");
  if (file.size === 0 || file.size > MAX_AVATAR) return fail("头像需小于 2MB");
  const ext = extOf(file.type);
  if (!ext) return fail("仅支持 PNG / JPG / WEBP / GIF");
  const body = await file.arrayBuffer();
  const key = `uploads/avatars/${user.id}-${Date.now()}${ext}`;
  const url = await saveToR2(c, key, body, file.type);
  return ok({ url });
});

// 上传图库图片（登录；限制 8MB）
app.post("/image", requireAuth, async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail("无法解析上传内容");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少文件");
  if (file.size === 0 || file.size > MAX_IMAGE) return fail("图片需小于 8MB");
  const ext = extOf(file.type);
  if (!ext) return fail("仅支持 PNG / JPG / WEBP / GIF");
  const body = await file.arrayBuffer();
  const key = `uploads/library/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const url = await saveToR2(c, key, body, file.type);
  return ok({ url });
});

// —— 管理端：图片库 ——

app.use("/admin/*", requireAuth, requireAdmin);

// 列出图库图片
app.get("/admin/library", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const listed = await bucket.list({ prefix: "uploads/library/", limit: 200 });
  const items = listed.objects.map((o) => ({
    key: o.key,
    url: `/static/${o.key}`,
    size: o.size,
    uploaded: o.uploaded?.toISOString() ?? null,
  }));
  return ok(items);
});

// 删除图片（仅限 uploads/ 前缀，防目录穿越）
app.post("/admin/library/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!key.startsWith("uploads/")) return fail("非法路径");
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  await bucket.delete(key);
  return ok({ deleted: true });
});

export default app;