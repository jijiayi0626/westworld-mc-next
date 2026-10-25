import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

const MAX_AVATAR = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE = 8 * 1024 * 1024; // 8MB
const MAX_TICKET_FILE = 10 * 1024 * 1024; // 10MB
const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const TICKET_ALLOWED: Record<string, string> = {
  ...ALLOWED,
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

function extOf(type: string): string {
  return ALLOWED[type] || "";
}

/**
 * 汇总所有可能引用图片的文本，用于图库「使用中 / 未使用」判定。
 * 图片 key 只要出现在下列任一文本中即视为被引用；单表查询失败（如未迁移）不影响其余来源。
 */
async function collectImageRefs(env: AppEnv["Bindings"]): Promise<string> {
  const queries: { db: D1Database; sql: string }[] = [
    { db: env.DB, sql: "SELECT value AS v FROM site_content LIMIT 3000" },
    { db: env.DB, sql: "SELECT value AS v FROM site_settings LIMIT 3000" },
    { db: env.DB, sql: "SELECT content AS v FROM announcements LIMIT 3000" },
    { db: env.DB, sql: "SELECT avatar AS v FROM users WHERE avatar IS NOT NULL AND avatar != '' LIMIT 3000" },
    { db: env.DB, sql: "SELECT image_key AS v FROM chat_messages WHERE image_key != '' LIMIT 3000" },
    { db: env.DB, sql: "SELECT avatar_url AS v FROM chat_messages WHERE avatar_url != '' LIMIT 3000" },
    { db: env.DB, sql: "SELECT description AS v FROM shop_products LIMIT 3000" },
    { db: env.DB, sql: "SELECT content AS v FROM support_ticket_replies LIMIT 3000" },
    { db: env.DB, sql: "SELECT attachments AS v FROM support_ticket_replies LIMIT 3000" },
    { db: env.DB, sql: "SELECT intro AS v FROM whitelist_applications LIMIT 3000" },
    { db: env.DB, sql: "SELECT message AS v FROM contact_messages LIMIT 3000" },
    { db: env.DB, sql: "SELECT reply AS v FROM contact_messages WHERE reply != '' LIMIT 3000" },
    { db: env.DB, sql: "SELECT ai_summary AS v FROM support_tickets WHERE ai_summary != '' LIMIT 3000" },
    { db: env.DB, sql: "SELECT content AS v FROM ai_conversation_messages LIMIT 3000" },
    { db: env.FORUM_DB ?? env.DB, sql: "SELECT content AS v FROM forum_posts LIMIT 3000" },
    { db: env.FORUM_DB ?? env.DB, sql: "SELECT content AS v FROM forum_replies LIMIT 3000" },
  ];
  const chunks: string[] = [];
  for (const q of queries) {
    try {
      const { results } = await q.db.prepare(q.sql).all<{ v: unknown }>();
      for (const row of results) {
        if (typeof row.v === "string" && row.v) chunks.push(row.v);
      }
    } catch {
      // 表/列不存在时跳过
    }
  }
  return chunks.join("\n");
}

/** 1 小时内新上传的图片不参与自动清理，避免误删刚上传尚未插入引用的文件 */
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

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

// 上传工单附件（登录；图片 / PDF / ZIP，限制 10MB）
app.post("/ticket-file", requireAuth, async (c) => {
  const user = c.get("user")!;
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail("无法解析上传内容");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少文件");
  if (file.size === 0 || file.size > MAX_TICKET_FILE) return fail("附件需小于 10MB");
  const ext = TICKET_ALLOWED[file.type];
  if (!ext) return fail("仅支持 PNG / JPG / WEBP / GIF / PDF / ZIP");
  const body = await file.arrayBuffer();
  const key = `uploads/tickets/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const url = await saveToR2(c, key, body, file.type);
  const name = (file.name || `附件${ext}`).replace(/[\r\n]/g, " ").slice(0, 120);
  return ok({ key, url, name, size: file.size, type: file.type });
});

// 列出图库图片（tab=mine 仅上传的；tab=system 含系统默认图片 assets/img/*；tab=all 两者）
// 每项带 in_use 标记：检查图片 key 是否被站点内容（site_content）引用
app.get("/admin/library", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const tab = c.req.query("tab") === "system" ? "system" : c.req.query("tab") === "all" ? "all" : "mine";

  // 使用中检测：站点内容、公告、头像、聊天、工单、论坛等所有文本中出现过该 key 即算引用
  const refs = await collectImageRefs(c.env);

  // 自定义名称（图库重命名）
  const nameRows = await c.env.DB.prepare("SELECT key, name FROM image_meta").all<{ key: string; name: string }>();
  const nameMap = new Map((nameRows.results ?? []).map((r) => [r.key, r.name]));

  const listPrefix = async (prefix: string, limit: number) => {
    const listed = await bucket.list({ prefix, limit });
    return listed.objects.map((o) => ({
      key: o.key,
      url: `/static/${o.key}`,
      size: o.size,
      uploaded: o.uploaded?.toISOString() ?? null,
      system: o.key.startsWith("assets/img/"),
      in_use: refs.includes(o.key),
      name: nameMap.get(o.key) || "",
    }));
  };

  if (tab === "system") {
    return ok(await listPrefix("assets/img/", 300));
  }

  const uploads = await listPrefix("uploads/library/", 200);
  if (tab === "all") {
    const system = await listPrefix("assets/img/", 300);
    return ok([...system, ...uploads]);
  }
  return ok(uploads);
});

// 删除图片（仅限 uploads/ 前缀；assets/img/ 为系统级资源，禁止删除）
app.post("/admin/library/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.key || "");
  if (key.startsWith("assets/img/")) {
    return fail("系统默认图片不可删除。如需调整请更新部署包中的 public 图片资源。");
  }
  if (!key.startsWith("uploads/")) return fail("非法路径");
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  await bucket.delete(key);
  return ok({ deleted: true });
});

// 重命名图片（存 image_meta，不影响 R2 对象；系统图片也可命名）
app.post("/admin/library/rename", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const key = String(body.key || "").slice(0, 300);
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!key || !(key.startsWith("uploads/") || key.startsWith("assets/"))) {
    return fail("非法路径");
  }
  await c.env.DB.prepare(
    `INSERT INTO image_meta (key, name, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
  )
    .bind(key, name)
    .run();
  await logOp(c.env.DB, c, admin.id, "image_rename", key);
  return ok({ renamed: true, name });
});

// 扫描未被引用的图片（孤儿图片）
app.get("/admin/library/orphans", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);

  const refs = await collectImageRefs(c.env);
  const nameRows = await c.env.DB.prepare("SELECT key, name FROM image_meta").all<{ key: string; name: string }>();
  const nameMap = new Map((nameRows.results ?? []).map((r) => [r.key, r.name]));

  const objects: R2Object[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const listed: R2Objects = await bucket.list({ prefix: "uploads/", limit: 1000, cursor });
    objects.push(...listed.objects);
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }

  const now = Date.now();
  const orphans = objects
    .filter((o) => !refs.includes(o.key))
    .filter((o) => !o.uploaded || now - o.uploaded.getTime() > ORPHAN_MIN_AGE_MS)
    .map((o) => ({
      key: o.key,
      url: `/static/${o.key}`,
      size: o.size,
      uploaded: o.uploaded?.toISOString() ?? null,
      name: nameMap.get(o.key) || "",
      group: o.key.startsWith("uploads/library/") ? "图库" : o.key.startsWith("uploads/avatars/") ? "头像" : o.key.startsWith("uploads/chat/") ? "聊天" : "其他",
    }));

  return ok({ orphans, scanned: objects.length, total: orphans.length });
});

// 清理孤儿图片：不传 keys 时清理全部扫描结果；仍被引用的文件会被跳过
app.post("/admin/library/cleanup", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const body = await c.req.json().catch(() => ({}));

  let keys: string[] = Array.isArray(body.keys)
    ? body.keys.map((k: unknown) => String(k || "").slice(0, 300)).filter(Boolean).slice(0, 500)
    : [];

  if (keys.length === 0) {
    const objects: R2Object[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const listed: R2Objects = await bucket.list({ prefix: "uploads/", limit: 1000, cursor });
      objects.push(...listed.objects);
      if (!listed.truncated) break;
      cursor = listed.cursor;
    }
    keys = objects
      .filter((o) => (!o.uploaded || Date.now() - o.uploaded.getTime() > ORPHAN_MIN_AGE_MS))
      .map((o) => o.key);
  }

  const refs = await collectImageRefs(c.env);
  const deleted: string[] = [];
  const skipped: { key: string; reason: string }[] = [];

  for (const key of keys) {
    if (!key.startsWith("uploads/")) {
      skipped.push({ key, reason: "非法路径" });
      continue;
    }
    if (refs.includes(key)) {
      skipped.push({ key, reason: "仍被引用" });
      continue;
    }
    try {
      await bucket.delete(key);
      deleted.push(key);
    } catch {
      skipped.push({ key, reason: "删除失败" });
    }
  }

  if (deleted.length > 0) {
    try {
      await c.env.DB.prepare(
        `DELETE FROM image_meta WHERE key IN (${deleted.map(() => "?").join(",")})`,
      ).bind(...deleted).run();
    } catch {
      // image_meta 未创建时忽略
    }
  }

  const admin = c.get("user")!;
  await logOp(c.env.DB, c, admin.id, "image_cleanup", `deleted=${deleted.length} skipped=${skipped.length}`);
  return ok({ deleted, skipped, total: deleted.length });
});

export default app;