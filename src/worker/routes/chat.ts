import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logUserAction, logOp } from "../lib/log";
import { getClientIp } from "../lib/net";

/**
 * 聊天室（注意 Cloudflare 平台限制）：
 * - 免费套餐无 Durable Objects（需付费），实时性采用 4s 轮询 + 增量拉取（after_id），避免全量刷新
 * - 图片 ≤ 4MB（Workers 请求体限制远大于此，收窄以省 R2 写入配额，免费档 10 写/秒）
 * - 文本 ≤ 400 字符（D1 单行上限 1MB，留足余量）
 * - 同一用户两次发言间隔 ≥ 3s，每日文字 ≤ 300 条 / 图片 ≤ 30 张（防刷屏，R2/D1 配额友好）
 */

const MAX_TEXT = 400;
const MAX_IMAGE = 4 * 1024 * 1024; // 4MB
const MIN_INTERVAL_MS = 3000;
const DAILY_TEXT = 300;
const DAILY_IMAGE = 30;

const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

interface ChatRow {
  id: number;
  user_id: number;
  username: string;
  avatar_url: string | null;
  role: string;
  content: string;
  image_key: string | null;
  created_at: string;
}

function shape(r: ChatRow) {
  return {
    id: r.id,
    user_id: r.user_id,
    username: r.username,
    avatar_url: r.avatar_url || "",
    role: r.role,
    content: r.content,
    image_url: r.image_key ? `/static/${r.image_key}` : "",
    created_at: r.created_at,
  };
}

const app = new Hono<AppEnv>();

// 频控：距上次发言不足 MIN_INTERVAL_MS 则拒绝
async function tooFast(db: D1Database, userId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId)
    .first<{ created_at: string }>();
  if (!row) return false;
  const t = new Date(row.created_at.replace(" ", "T") + "Z").getTime();
  return !Number.isNaN(t) && Date.now() - t < MIN_INTERVAL_MS;
}

async function dailyCount(db: D1Database, userId: number, withImage: boolean): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages
       WHERE user_id = ? AND image_key ${withImage ? "!= ''" : "= ''"}
         AND created_at >= datetime('now', 'start of day')`,
    )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// 限制说明（前端展示用）
app.get("/limits", (c) =>
  ok({
    max_text: MAX_TEXT,
    max_image_mb: 4,
    min_interval_ms: MIN_INTERVAL_MS,
    daily_text: DAILY_TEXT,
    daily_image: DAILY_IMAGE,
    realtime: "polling_4s",
  }),
);

// 消息列表：after_id 增量；before_id 翻页；默认最新 50 条（升序返回）
app.get("/messages", async (c) => {
  const afterId = Number(c.req.query("after_id")) || 0;
  const beforeId = Number(c.req.query("before_id")) || 0;

  let rows: ChatRow[];
  if (afterId > 0) {
    ({ results: rows } = await c.env.DB.prepare(
      `SELECT id, user_id, username, avatar_url, role, content, image_key, created_at
       FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT 50`,
    ).bind(afterId).all<ChatRow>());
  } else {
    ({ results: rows } = await c.env.DB.prepare(
      `SELECT id, user_id, username, avatar_url, role, content, image_key, created_at
       FROM chat_messages WHERE (?1 = 0 OR id < ?1) ORDER BY id DESC LIMIT 50`,
    ).bind(beforeId).all<ChatRow>());
    rows = rows.reverse();
  }

  // 近 5 分钟活跃人数（粗略在线估计，避免每用户心跳表）
  const online = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT user_id) AS n FROM chat_messages WHERE created_at >= datetime('now', '-5 minutes')",
  ).first<{ n: number }>();

  return ok({ messages: (rows ?? []).map(shape), online: online?.n ?? 0 });
});

// 发送文字
app.post("/send", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, MAX_TEXT).trim();
  if (!content) return fail("消息不能为空");
  if (content.length > MAX_TEXT) return fail(`消息需在 ${MAX_TEXT} 字以内`);

  if (await tooFast(c.env.DB, user.id)) return fail("发送太快了，休息一下~");
  if ((await dailyCount(c.env.DB, user.id, false)) >= DAILY_TEXT) return fail("今日发言已达上限，明天再来聊吧");

  const profile = await c.env.DB.prepare("SELECT avatar_url FROM users WHERE id = ?").bind(user.id).first<{ avatar_url: string | null }>();
  const result = await c.env.DB.prepare(
    "INSERT INTO chat_messages (user_id, username, avatar_url, role, content, image_key) VALUES (?, ?, ?, ?, ?, '')",
  )
    .bind(user.id, user.username, profile?.avatar_url || "", user.role, content)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_send", "发送聊天消息", getClientIp(c));

  return ok(shape({
    id: Number(result.meta.last_row_id),
    user_id: user.id,
    username: user.username,
    avatar_url: profile?.avatar_url || "",
    role: user.role,
    content,
    image_key: null,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  }));
});

// 发送图片
app.post("/image", requireAuth, async (c) => {
  const user = c.get("user")!;
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail("无法解析上传内容");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少图片文件");
  if (file.size === 0 || file.size > MAX_IMAGE) return fail("图片需小于 4MB");
  const ext = ALLOWED[file.type];
  if (!ext) return fail("仅支持 PNG / JPG / WEBP / GIF");

  if (await tooFast(c.env.DB, user.id)) return fail("发送太快了，休息一下~");
  if ((await dailyCount(c.env.DB, user.id, true)) >= DAILY_IMAGE) return fail("今日图片已达上限（30 张）");

  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const key = `uploads/chat/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const profile = await c.env.DB.prepare("SELECT avatar_url FROM users WHERE id = ?").bind(user.id).first<{ avatar_url: string | null }>();
  const result = await c.env.DB.prepare(
    "INSERT INTO chat_messages (user_id, username, avatar_url, role, content, image_key) VALUES (?, ?, ?, ?, '', ?)",
  )
    .bind(user.id, user.username, profile?.avatar_url || "", user.role, key)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_image", "发送聊天图片", getClientIp(c));

  return ok(shape({
    id: Number(result.meta.last_row_id),
    user_id: user.id,
    username: user.username,
    avatar_url: profile?.avatar_url || "",
    role: user.role,
    content: "",
    image_key: key,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  }));
});

// —— 管理端 ——
app.use("/admin/*", requireAuth, requireAdmin);

// 删除消息（连带清理 R2 图片）
app.post("/admin/delete", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (!id) return fail("缺少消息 ID");
  const row = await c.env.DB.prepare("SELECT id, image_key FROM chat_messages WHERE id = ?").bind(id).first<{ id: number; image_key: string | null }>();
  if (!row) return fail("消息不存在", 404);
  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await c.env.DB.prepare("DELETE FROM chat_messages WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, admin.id, "chat_delete", `#${id}`);
  return ok({ deleted: true });
});

export default app;
