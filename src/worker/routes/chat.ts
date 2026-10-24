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

/** 聊天室配置（后台可改，存 site_settings） */
interface ChatConfig {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
}

async function getChatConfig(db: D1Database): Promise<ChatConfig> {
  const def: ChatConfig = { enabled: true, welcome: "", max_text: MAX_TEXT, max_image_mb: 4 };
  try {
    const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'chat_config'").first<{ value: string }>();
    if (!row) return def;
    const parsed = JSON.parse(row.value) as Partial<ChatConfig>;
    return {
      enabled: parsed.enabled !== false,
      welcome: String(parsed.welcome ?? "").slice(0, 200),
      max_text: Math.min(1000, Math.max(20, Number(parsed.max_text) || MAX_TEXT)),
      max_image_mb: Math.min(8, Math.max(1, Number(parsed.max_image_mb) || 4)),
    };
  } catch {
    return def;
  }
}

/** 论坛 Tab 显隐配置（与聊天配置同存一个 JSON） */
async function getForumShowConfig(db: D1Database): Promise<{ show_announcements: boolean; show_chat: boolean }> {
  try {
    const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'chat_config'").first<{ value: string }>();
    if (row) {
      const parsed = JSON.parse(row.value) as { show_announcements?: boolean; show_chat?: boolean };
      return { show_announcements: parsed.show_announcements !== false, show_chat: parsed.show_chat !== false };
    }
  } catch {
    /* 默认全显示 */
  }
  return { show_announcements: true, show_chat: true };
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

/** 论坛数据统一存独立 D1（FORUM_DB）；未绑定时回退主库，保证兼容 */
function fdb(c: { env: AppEnv["Bindings"] }): D1Database {
  return c.env.FORUM_DB ?? c.env.DB;
}

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

// 限制与配置（前端展示用；后台可改）
app.get("/limits", async (c) => {
  const cfg = await getChatConfig(c.env.DB);
  const show = await getForumShowConfig(c.env.DB);
  return ok({
    enabled: cfg.enabled,
    welcome: cfg.welcome,
    max_text: cfg.max_text,
    max_image_mb: cfg.max_image_mb,
    min_interval_ms: MIN_INTERVAL_MS,
    daily_text: DAILY_TEXT,
    daily_image: DAILY_IMAGE,
    realtime: "polling_4s",
    ...show,
  });
});

// 消息列表：after_id 增量；before_id 翻页；默认最新 50 条（升序返回）
app.get("/messages", async (c) => {
  const afterId = Number(c.req.query("after_id")) || 0;
  const beforeId = Number(c.req.query("before_id")) || 0;

  let rows: ChatRow[];
  if (afterId > 0) {
    ({ results: rows } = await fdb(c).prepare(
      `SELECT id, user_id, username, avatar_url, role, content, image_key, created_at
       FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT 50`,
    ).bind(afterId).all<ChatRow>());
  } else {
    ({ results: rows } = await fdb(c).prepare(
      `SELECT id, user_id, username, avatar_url, role, content, image_key, created_at
       FROM chat_messages WHERE (?1 = 0 OR id < ?1) ORDER BY id DESC LIMIT 50`,
    ).bind(beforeId).all<ChatRow>());
    rows = rows.reverse();
  }

  // 近 5 分钟活跃人数（粗略在线估计，避免每用户心跳表）
  const online = await fdb(c).prepare(
    "SELECT COUNT(DISTINCT user_id) AS n FROM chat_messages WHERE created_at >= datetime('now', '-5 minutes')",
  ).first<{ n: number }>();

  return ok({ messages: (rows ?? []).map(shape), online: online?.n ?? 0 });
});

// 发送文字
app.post("/send", requireAuth, async (c) => {
  const user = c.get("user")!;
  const cfg = await getChatConfig(c.env.DB);
  if (!cfg.enabled) return fail("聊天室已关闭，暂时无法发言");

  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, cfg.max_text).trim();
  if (!content) return fail("消息不能为空");
  if (content.length > cfg.max_text) return fail(`消息需在 ${cfg.max_text} 字以内`);

  if (await tooFast(fdb(c), user.id)) return fail("发送太快了，休息一下~");
  if ((await dailyCount(fdb(c), user.id, false)) >= DAILY_TEXT) return fail("今日发言已达上限，明天再来聊吧");

  const profile = await c.env.DB.prepare("SELECT avatar FROM users WHERE id = ?").bind(user.id).first<{ avatar: string | null }>();
  const result = await fdb(c).prepare(
    "INSERT INTO chat_messages (user_id, username, avatar_url, role, content, image_key) VALUES (?, ?, ?, ?, ?, '')",
  )
    .bind(user.id, user.username, profile?.avatar || "", user.role, content)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_send", "发送聊天消息", getClientIp(c));

  return ok(shape({
    id: Number(result.meta.last_row_id),
    user_id: user.id,
    username: user.username,
    avatar_url: profile?.avatar || "",
    role: user.role,
    content,
    image_key: null,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  }));
});

// 发送图片
app.post("/image", requireAuth, async (c) => {
  const user = c.get("user")!;
  const cfg = await getChatConfig(c.env.DB);
  if (!cfg.enabled) return fail("聊天室已关闭，暂时无法发图");

  const maxImage = cfg.max_image_mb * 1024 * 1024;
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail("无法解析上传内容");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少图片文件");
  if (file.size === 0 || file.size > maxImage) return fail(`图片需小于 ${cfg.max_image_mb}MB`);
  const ext = ALLOWED[file.type];
  if (!ext) return fail("仅支持 PNG / JPG / WEBP / GIF");

  if (await tooFast(fdb(c), user.id)) return fail("发送太快了，休息一下~");
  if ((await dailyCount(fdb(c), user.id, true)) >= DAILY_IMAGE) return fail("今日图片已达上限（30 张）");

  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const key = `uploads/chat/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const profile = await c.env.DB.prepare("SELECT avatar FROM users WHERE id = ?").bind(user.id).first<{ avatar: string | null }>();
  const result = await fdb(c).prepare(
    "INSERT INTO chat_messages (user_id, username, avatar_url, role, content, image_key) VALUES (?, ?, ?, ?, '', ?)",
  )
    .bind(user.id, user.username, profile?.avatar || "", user.role, key)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_image", "发送聊天图片", getClientIp(c));

  return ok(shape({
    id: Number(result.meta.last_row_id),
    user_id: user.id,
    username: user.username,
    avatar_url: profile?.avatar || "",
    role: user.role,
    content: "",
    image_key: key,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  }));
});

// 撤回自己的消息：仅限本人、10 分钟内（管理员不受时间限制）
app.post("/delete-own", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (!id) return fail("缺少消息 ID");

  const row = await fdb(c)
    .prepare("SELECT id, user_id, image_key, created_at FROM chat_messages WHERE id = ?")
    .bind(id)
    .first<{ id: number; user_id: number; image_key: string | null; created_at: string }>();
  if (!row) return fail("消息不存在", 404);
  if (row.user_id !== user.id) return fail("只能撤回自己的消息", 403);

  if (user.role !== "admin") {
    const t = new Date(row.created_at.replace(" ", "T") + "Z").getTime();
    if (Number.isNaN(t) || Date.now() - t > 10 * 60 * 1000) {
      return fail("超过 10 分钟的消息无法撤回");
    }
  }

  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await fdb(c).prepare("DELETE FROM chat_messages WHERE id = ?").bind(id).run();
  await logUserAction(c.env.DB, user.id, "chat_delete_own", `撤回 #${id}`, getClientIp(c));

  return ok({ deleted: true });
});

// —— 管理端 ——
app.use("/admin/*", requireAuth, requireAdmin);

// 删除消息（连带清理 R2 图片）
app.post("/admin/delete", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (!id) return fail("缺少消息 ID");
  const row = await fdb(c).prepare("SELECT id, image_key FROM chat_messages WHERE id = ?").bind(id).first<{ id: number; image_key: string | null }>();
  if (!row) return fail("消息不存在", 404);
  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await fdb(c).prepare("DELETE FROM chat_messages WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, admin.id, "chat_delete", `#${id}`);
  return ok({ deleted: true });
});

export default app;
