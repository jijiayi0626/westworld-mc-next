import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, UserSession } from "../lib/auth";
import { requireAuth, requireAdmin, getSecret, readToken } from "../lib/auth";
import { verifyToken } from "../lib/jwt";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logUserAction, logOp } from "../lib/log";
import { getClientIp } from "../lib/net";
import { rateLimit } from "../lib/ratelimit";
import { ensurePresenceSchema, presenceMap } from "../lib/presence";

/**
 * 社区消息（注意 Cloudflare 平台限制）：
 * - 免费套餐无 Durable Objects，实时性采用「自适应轮询 + after_id 增量拉取」，不显示刷新倒计时
 * - 文本 ≤ 400 字符；图片 ≤ 4MB（收窄以省 R2 写入配额，免费档 10 写/秒）
 * - 同一用户在同一会话两次发言间隔 ≥ 3s，每日文字 ≤ 300 条 / 图片 ≤ 30 张
 */

const MAX_TEXT = 400;
const MAX_IMAGE = 4 * 1024 * 1024;
const MIN_INTERVAL_MS = 3000;
const DAILY_TEXT = 300;
const DAILY_IMAGE = 30;
const COMMUNITY_ID = 1;

const ALLOWED: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

interface ChatConfig {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
  group_create: "all" | "admin";
}

interface RoomRow {
  id: number;
  kind: "community" | "group" | "dm";
  name: string;
  avatar: string;
  notice: string;
  owner_id: number | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  room_id: number;
  user_id: number;
  alias: string;
  remark: string;
  role: string;
  last_read_id: number;
  muted: number;
  joined_at: string;
}

interface MessageRow {
  id: number;
  room_id: number | null;
  user_id: number;
  username: string | null;
  avatar_url: string | null;
  role: string;
  content: string;
  image_key: string | null;
  created_at: string;
  recalled: number | null;
  recalled_at: string | null;
  recalled_by: number | null;
  reply_to_id?: number | null;
  reply_to_name?: string | null;
  reply_to_text?: string | null;
  mentions?: string | null;
}

const app = new Hono<AppEnv>();

/** 社区数据统一存独立 D1（FORUM_DB）；未绑定时回退主库 */
function fdb(c: { env: AppEnv["Bindings"] }): D1Database {
  return c.env.FORUM_DB ?? c.env.DB;
}

async function getChatConfig(db: D1Database): Promise<ChatConfig> {
  const def: ChatConfig = {
    enabled: true,
    welcome: "",
    max_text: MAX_TEXT,
    max_image_mb: 4,
    group_create: "all",
  };
  try {
    const row = await db
      .prepare("SELECT value FROM site_settings WHERE key = 'chat_config'")
      .first<{ value: string }>();
    if (!row) return def;
    const parsed = JSON.parse(row.value) as Partial<ChatConfig>;
    return {
      enabled: parsed.enabled !== false,
      welcome: String(parsed.welcome ?? "").slice(0, 200),
      max_text: Math.min(1000, Math.max(20, Number(parsed.max_text) || MAX_TEXT)),
      max_image_mb: Math.min(8, Math.max(1, Number(parsed.max_image_mb) || 4)),
      group_create: parsed.group_create === "admin" ? "admin" : "all",
    };
  } catch {
    return def;
  }
}

async function getForumShowConfig(
  db: D1Database,
): Promise<{ show_announcements: boolean; show_chat: boolean }> {
  try {
    const row = await db
      .prepare("SELECT value FROM site_settings WHERE key = 'chat_config'")
      .first<{ value: string }>();
    if (row) {
      const parsed = JSON.parse(row.value) as {
        show_announcements?: boolean;
        show_chat?: boolean;
      };
      return {
        show_announcements: parsed.show_announcements !== false,
        show_chat: parsed.show_chat !== false,
      };
    }
  } catch {
    /* 默认全显示 */
  }
  return { show_announcements: true, show_chat: true };
}

// 惰性建表只做一次（模块级缓存）；新增列通过 PRAGMA 检测后补齐
let schemaReady = false;

async function ensureChatSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS chat_rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL DEFAULT 'group',
          name TEXT NOT NULL DEFAULT '',
          avatar TEXT DEFAULT '',
          notice TEXT DEFAULT '',
          owner_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS chat_room_members (
          room_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          alias TEXT DEFAULT '',
          remark TEXT DEFAULT '',
          role TEXT NOT NULL DEFAULT 'member',
          last_read_id INTEGER NOT NULL DEFAULT 0,
          muted INTEGER NOT NULL DEFAULT 0,
          joined_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY(room_id, user_id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS user_contacts (
          owner_id INTEGER NOT NULL,
          target_id INTEGER NOT NULL,
          alias TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'accepted',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY(owner_id, target_id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER NOT NULL DEFAULT 1,
          user_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          avatar_url TEXT DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user',
          content TEXT NOT NULL DEFAULT '',
          image_key TEXT DEFAULT '',
          recalled INTEGER NOT NULL DEFAULT 0,
          recalled_at TEXT DEFAULT '',
          recalled_by INTEGER,
          reply_to_id INTEGER NOT NULL DEFAULT 0,
          reply_to_name TEXT DEFAULT '',
          reply_to_text TEXT DEFAULT '',
          mentions TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ),
    ]);

    // 社区群固定 id = 1
    await db
      .prepare(
        `INSERT OR IGNORE INTO chat_rooms (id, kind, name, avatar, notice, owner_id)
         VALUES (1, 'community', '社区群', '', '欢迎来到西域社区，文明交流，禁止刷屏与广告。', NULL)`,
      )
      .run();

    // 旧库补列（单条失败不阻断其余）
    const info = await db
      .prepare("PRAGMA table_info(chat_messages)")
      .all<{ name: string }>();
    const cols = new Set((info.results ?? []).map((r) => r.name));
    const alters: string[] = [];
    if (!cols.has("room_id")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN room_id INTEGER NOT NULL DEFAULT 1");
    }
    if (!cols.has("recalled")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN recalled INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("recalled_at")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN recalled_at TEXT DEFAULT ''");
    }
    if (!cols.has("recalled_by")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN recalled_by INTEGER");
    }
    if (!cols.has("reply_to_id")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("reply_to_name")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN reply_to_name TEXT DEFAULT ''");
    }
    if (!cols.has("reply_to_text")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN reply_to_text TEXT DEFAULT ''");
    }
    if (!cols.has("mentions")) {
      alters.push("ALTER TABLE chat_messages ADD COLUMN mentions TEXT DEFAULT ''");
    }

    const contactInfo = await db
      .prepare("PRAGMA table_info(user_contacts)")
      .all<{ name: string }>();
    const contactCols = new Set((contactInfo.results ?? []).map((r) => r.name));
    if (!contactCols.has("status")) {
      // 历史好友关系默认为已通过，避免升级后互相失联
      alters.push("ALTER TABLE user_contacts ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'");
    }

    const memberInfo = await db
      .prepare("PRAGMA table_info(chat_room_members)")
      .all<{ name: string }>();
    const memberCols = new Set((memberInfo.results ?? []).map((r) => r.name));
    if (!memberCols.has("remark")) {
      // 群备注：仅自己可见的群显示名（类似 QQ 群备注）
      alters.push("ALTER TABLE chat_room_members ADD COLUMN remark TEXT DEFAULT ''");
    }
    for (const sql of alters) {
      try {
        await db.prepare(sql).run();
      } catch {
        /* 并发补列时忽略 */
      }
    }

    await db.batch([
      db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_rooms_kind ON chat_rooms(kind, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_room_members(user_id, room_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_user_contacts_owner ON user_contacts(owner_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_user_contacts_target ON user_contacts(target_id, status, created_at)"),
    ]);

    schemaReady = true;
  } catch {
    // 建表失败不阻断读取（下次请求再试）
  }
}

async function optionalUser(c: Context<AppEnv>): Promise<UserSession | null> {
  try {
    const token = readToken(c);
    if (!token) return null;
    const payload = await verifyToken(token, getSecret(c));
    if (!payload) return null;
    return { id: Number(payload.sub), username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

function ageMs(createdAt: string): number {
  const t = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : Date.now() - t;
}

async function roomById(db: D1Database, id: number): Promise<RoomRow | null> {
  return db.prepare("SELECT * FROM chat_rooms WHERE id = ?").bind(id).first<RoomRow>();
}

async function memberOf(db: D1Database, roomId: number, userId: number): Promise<MemberRow | null> {
  return db
    .prepare("SELECT * FROM chat_room_members WHERE room_id = ? AND user_id = ?")
    .bind(roomId, userId)
    .first<MemberRow>();
}

async function areFriends(db: D1Database, a: number, b: number): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS x FROM user_contacts WHERE owner_id = ? AND target_id = ? AND status = 'accepted' LIMIT 1",
    )
    .bind(a, b)
    .first<{ x: number }>();
  return Boolean(row);
}

/** 私信会话的对方用户 ID */
async function dmPeerId(db: D1Database, roomId: number, userId: number): Promise<number | null> {
  const row = await db
    .prepare(
      "SELECT user_id FROM chat_room_members WHERE room_id = ? AND user_id <> ? LIMIT 1",
    )
    .bind(roomId, userId)
    .first<{ user_id: number }>();
  return row?.user_id ?? null;
}

/** 每次读取房间列表时自动加入社区群 */
async function ensureCommunityMembership(db: D1Database, userId: number): Promise<void> {
  try {
    await db
      .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(COMMUNITY_ID, userId)
      .run();
  } catch {
    /* 社区群不存在时忽略 */
  }
}

/** 群主 / 群管理员 / 全局管理员可管理群资料与成员 */
async function canManageRoom(
  db: D1Database,
  room: RoomRow,
  user: UserSession,
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (room.kind !== "group") return false;
  if (room.owner_id === user.id) return true;
  const m = await memberOf(db, room.id, user.id);
  return m?.role === "admin";
}

const MSG_SELECT = `SELECT m.id, COALESCE(m.room_id, 1) AS room_id, m.user_id,
  m.username, m.avatar_url, m.role, m.content, m.image_key, m.created_at,
  COALESCE(m.recalled, 0) AS recalled, m.recalled_at, m.recalled_by,
  COALESCE(m.reply_to_id, 0) AS reply_to_id, COALESCE(m.reply_to_name, '') AS reply_to_name,
  COALESCE(m.reply_to_text, '') AS reply_to_text, COALESCE(m.mentions, '') AS mentions
FROM chat_messages m`;

function parseMentions(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0) : [];
  } catch {
    return [];
  }
}

function messageShape(r: MessageRow) {
  const recalled = !!r.recalled;
  return {
    id: r.id,
    room_id: r.room_id ?? COMMUNITY_ID,
    user_id: r.user_id,
    username: r.username || "玩家",
    avatar_url: r.avatar_url || "",
    role: r.role,
    content: recalled ? "" : r.content,
    image_url: !recalled && r.image_key ? `/static/${r.image_key}` : "",
    recalled,
    recalled_at: r.recalled_at || "",
    recalled_by: r.recalled_by || 0,
    reply_to_id: recalled ? 0 : Number(r.reply_to_id) || 0,
    reply_to_name: recalled ? "" : r.reply_to_name || "",
    reply_to_text: recalled ? "" : r.reply_to_text || "",
    mentions: recalled ? [] : parseMentions(r.mentions),
    created_at: r.created_at,
  };
}

// 频控：同一房间距上次发言不足 MIN_INTERVAL_MS 则拒绝
async function tooFast(db: D1Database, userId: number, roomId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT created_at FROM chat_messages WHERE user_id = ? AND room_id = ? ORDER BY id DESC LIMIT 1")
    .bind(userId, roomId)
    .first<{ created_at: string }>();
  if (!row) return false;
  return ageMs(row.created_at) < MIN_INTERVAL_MS;
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

async function currentProfile(db: D1Database, userId: number): Promise<{ avatar: string }> {
  try {
    const row = await db.prepare("SELECT avatar FROM users WHERE id = ?").bind(userId).first<{
      avatar: string | null;
    }>();
    return { avatar: row?.avatar || "" };
  } catch {
    return { avatar: "" };
  }
}

interface UserInfo {
  id: number;
  username: string;
  avatar: string;
}

/** 用户资料在主库；社区库只存快照，展示时按 ID 批量补最新昵称与头像 */
async function userMap(db: D1Database, ids: number[]): Promise<Map<number, UserInfo>> {
  const clean = [...new Set(ids.filter((v) => Number.isInteger(v) && v > 0))];
  const map = new Map<number, UserInfo>();
  for (let i = 0; i < clean.length; i += 80) {
    const chunk = clean.slice(i, i + 80);
    try {
      const { results } = await db
        .prepare(
          `SELECT id, username, avatar FROM users
           WHERE status = 'active' AND id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(...chunk)
        .all<{ id: number; username: string; avatar: string | null }>();
      for (const r of results ?? []) {
        map.set(r.id, { id: r.id, username: r.username, avatar: r.avatar || "" });
      }
    } catch {
      /* 主库异常时退回消息快照 */
    }
  }
  return map;
}

async function decorateMessages(
  mainDb: D1Database,
  rows: MessageRow[],
): Promise<MessageRow[]> {
  const map = await userMap(mainDb, rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = map.get(r.user_id);
    return u ? { ...r, username: u.username, avatar_url: u.avatar } : r;
  });
}

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

type CoreResult<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function sendTextCore(
  c: Context<AppEnv>,
  user: UserSession,
  roomId: number,
  raw: string,
  meta?: { replyTo?: number; mentions?: number[] },
): Promise<CoreResult<ReturnType<typeof messageShape>>> {
  const db = fdb(c);
  await ensureChatSchema(db);
  const cfg = await getChatConfig(c.env.DB);
  if (!cfg.enabled) return { ok: false, message: "社区消息已关闭，暂时无法发言" };

  const room = await roomById(db, roomId);
  if (!room) return { ok: false, message: "会话不存在", status: 404 };
  if (!(await memberOf(db, roomId, user.id))) return { ok: false, message: "你不在该会话中", status: 403 };
  if (room.kind === "dm") {
    const peer = await dmPeerId(db, roomId, user.id);
    if (!peer || !(await areFriends(db, user.id, peer))) {
      return { ok: false, message: "对方还不是你的好友，无法发送私信", status: 403 };
    }
  }

  // 注意：str() 自身会按第二个参数截断，若直接传 cfg.max_text，下面的超长判断永远不成立，
  // 用户只会看到消息被悄悄截断。这里先放宽到上限的 10 倍，再由下面的长度判断明确报错。
  const content = str(raw, cfg.max_text * 10).trim();
  if (!content) return { ok: false, message: "消息不能为空" };
  if (content.length > cfg.max_text) return { ok: false, message: `消息需在 ${cfg.max_text} 字以内` };

  if (await tooFast(db, user.id, roomId)) return { ok: false, message: "发送太快了，休息一下~" };
  if ((await dailyCount(db, user.id, false)) >= DAILY_TEXT) {
    return { ok: false, message: "今日发言已达上限，明天再来聊吧" };
  }

  const profile = await currentProfile(c.env.DB, user.id);

  // 引用回复：只允许引用同一会话内的消息，并保存快照避免原消息撤回后丢失上下文
  let replyToId = 0;
  let replyToName = "";
  let replyToText = "";
  const replyTarget = Number(meta?.replyTo) || 0;
  if (replyTarget > 0) {
    const target = await db
      .prepare("SELECT id, room_id, username, content, image_key, recalled FROM chat_messages WHERE id = ? LIMIT 1")
      .bind(replyTarget)
      .first<{ id: number; room_id: number; username: string; content: string; image_key: string; recalled: number }>();
    if (target && Number(target.room_id) === roomId && !target.recalled) {
      replyToId = target.id;
      replyToName = String(target.username || "玩家").slice(0, 40);
      replyToText = (target.content || (target.image_key ? "[图片]" : "")).slice(0, 80);
    }
  }

  // @ 提及：去重、限制数量，避免一次刷屏太多人
  const mentionIds = [...new Set((meta?.mentions ?? []).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))].slice(0, 10);
  const mentionJson = mentionIds.length ? JSON.stringify(mentionIds) : "";

  const result = await db
    .prepare(
      "INSERT INTO chat_messages (room_id, user_id, username, avatar_url, role, content, image_key, reply_to_id, reply_to_name, reply_to_text, mentions) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)",
    )
    .bind(roomId, user.id, user.username, profile.avatar, user.role, content, replyToId, replyToName, replyToText, mentionJson)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_send", `房间 ${roomId} 发送消息`, getClientIp(c));

  return {
    ok: true,
    data: messageShape({
      id: Number(result.meta.last_row_id),
      room_id: roomId,
      user_id: user.id,
      username: user.username,
      avatar_url: profile.avatar,
      role: user.role,
      content,
      image_key: "",
      created_at: nowText(),
      recalled: 0,
      recalled_at: "",
      recalled_by: null,
      reply_to_id: replyToId,
      reply_to_name: replyToName,
      reply_to_text: replyToText,
      mentions: mentionJson,
    }),
  };
}

async function sendImageCore(
  c: Context<AppEnv>,
  user: UserSession,
  roomId: number,
): Promise<CoreResult<ReturnType<typeof messageShape>>> {
  const db = fdb(c);
  await ensureChatSchema(db);
  const cfg = await getChatConfig(c.env.DB);
  if (!cfg.enabled) return { ok: false, message: "社区消息已关闭，暂时无法发图" };

  const room = await roomById(db, roomId);
  if (!room) return { ok: false, message: "会话不存在", status: 404 };
  if (!(await memberOf(db, roomId, user.id))) return { ok: false, message: "你不在该会话中", status: 403 };
  if (room.kind === "dm") {
    const peer = await dmPeerId(db, roomId, user.id);
    if (!peer || !(await areFriends(db, user.id, peer))) {
      return { ok: false, message: "对方还不是你的好友，无法发送私信", status: 403 };
    }
  }

  const maxImage = Math.min(cfg.max_image_mb * 1024 * 1024, MAX_IMAGE);
  const form = await c.req.formData().catch(() => null);
  if (!form) return { ok: false, message: "无法解析上传内容" };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "缺少图片文件" };
  if (file.size === 0 || file.size > maxImage) {
    return { ok: false, message: `图片需小于 ${cfg.max_image_mb}MB` };
  }
  const ext = ALLOWED[file.type];
  if (!ext) return { ok: false, message: "仅支持 PNG / JPG / WEBP / GIF" };

  if (await tooFast(db, user.id, roomId)) return { ok: false, message: "发送太快了，休息一下~" };
  if ((await dailyCount(db, user.id, true)) >= DAILY_IMAGE) {
    return { ok: false, message: "今日图片已达上限（30 张）" };
  }

  const bucket = c.env.ASSETS;
  if (!bucket) return { ok: false, message: "R2 未绑定", status: 503 };
  const key = `uploads/chat/${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const profile = await currentProfile(c.env.DB, user.id);
  const result = await db
    .prepare(
      "INSERT INTO chat_messages (room_id, user_id, username, avatar_url, role, content, image_key) VALUES (?, ?, ?, ?, ?, '', ?)",
    )
    .bind(roomId, user.id, user.username, profile.avatar, user.role, key)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_image", `房间 ${roomId} 发送图片`, getClientIp(c));

  return {
    ok: true,
    data: messageShape({
      id: Number(result.meta.last_row_id),
      room_id: roomId,
      user_id: user.id,
      username: user.username,
      avatar_url: profile.avatar,
      role: user.role,
      content: "",
      image_key: key,
      created_at: nowText(),
      recalled: 0,
      recalled_at: "",
      recalled_by: null,
    }),
  };
}

// —— 配置与限制 ——
app.get("/limits", async (c) => {
  await ensureChatSchema(fdb(c));
  const cfg = await getChatConfig(c.env.DB);
  const show = await getForumShowConfig(c.env.DB);
  const me = await optionalUser(c);
  return ok({
    enabled: cfg.enabled,
    welcome: cfg.welcome,
    max_text: cfg.max_text,
    max_image_mb: cfg.max_image_mb,
    min_interval_ms: MIN_INTERVAL_MS,
    daily_text: DAILY_TEXT,
    daily_image: DAILY_IMAGE,
    group_create: cfg.group_create,
    can_create_group: !!me && (cfg.group_create === "all" || me.role === "admin"),
    ...show,
  });
});

// —— 会话列表 ——
app.get("/rooms", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  await ensurePresenceSchema(db);
  await ensureCommunityMembership(db, user.id);

  const { results } = await db
    .prepare(
      `SELECT r.id, r.kind, r.name, r.avatar, r.notice, r.owner_id, r.created_at, r.updated_at,
              m.alias, m.remark, m.role AS my_role, m.last_read_id, m.muted,
              (SELECT COUNT(*) FROM chat_room_members x WHERE x.room_id = r.id) AS member_count,
              (SELECT MAX(c.id) FROM chat_messages c WHERE c.room_id = r.id) AS last_id,
              (SELECT COUNT(*) FROM chat_messages c
                WHERE c.room_id = r.id AND c.id > m.last_read_id AND c.user_id <> ?1
                  AND COALESCE(c.recalled, 0) = 0) AS unread,
              (SELECT c.content FROM chat_messages c
                WHERE c.room_id = r.id AND COALESCE(c.recalled, 0) = 0 ORDER BY c.id DESC LIMIT 1) AS last_text,
              (SELECT c.image_key FROM chat_messages c
                WHERE c.room_id = r.id AND COALESCE(c.recalled, 0) = 0 ORDER BY c.id DESC LIMIT 1) AS last_image,
              (SELECT c.created_at FROM chat_messages c
                WHERE c.room_id = r.id AND COALESCE(c.recalled, 0) = 0 ORDER BY c.id DESC LIMIT 1) AS last_at,
              (SELECT c.username FROM chat_messages c
                WHERE c.room_id = r.id AND COALESCE(c.recalled, 0) = 0 ORDER BY c.id DESC LIMIT 1) AS last_user,
              (SELECT om.user_id FROM chat_room_members om
                WHERE om.room_id = r.id AND om.user_id <> ?1 LIMIT 1) AS peer_id,
              (SELECT c.alias FROM user_contacts c WHERE c.owner_id = ?1 AND c.target_id =
                (SELECT om.user_id FROM chat_room_members om
                  WHERE om.room_id = r.id AND om.user_id <> ?1 LIMIT 1)) AS peer_alias
       FROM chat_rooms r
       JOIN chat_room_members m ON m.room_id = r.id AND m.user_id = ?1
       ORDER BY CASE r.kind WHEN 'community' THEN 0 WHEN 'group' THEN 1 ELSE 2 END,
                COALESCE(last_id, 0) DESC`,
    )
    .bind(user.id)
    .all<Record<string, unknown>>();

  const peerIds = (results ?? []).map((r) => Number(r.peer_id) || 0);
  const peers = await userMap(c.env.DB, peerIds);
  const peerPresence = await presenceMap(db, peerIds);

  const rooms: Record<string, unknown>[] = (results ?? []).map((r) => {
    const kind = String(r.kind);
    const peerAlias = String(r.peer_alias || "");
    const peer = peers.get(Number(r.peer_id) || 0);
    const remark = String(r.remark || "");
    const displayName =
      kind === "dm"
        ? peerAlias || peer?.username || "私信"
        : remark || String(r.name || "群聊");
    const displayAvatar = kind === "dm" ? peer?.avatar || "" : String(r.avatar || "");
    return {
      ...r,
      remark,
      display_name: displayName,
      display_avatar: displayAvatar,
      peer_id: Number(r.peer_id) || 0,
      peer_presence: kind === "dm" ? peerPresence.get(Number(r.peer_id) || 0) || null : null,
    };
  });

  const unread = rooms.reduce((n, r) => n + (Number(r.unread) || 0), 0);
  return ok({ rooms, unread });
});

app.post("/rooms", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const cfg = await getChatConfig(c.env.DB);
  if (cfg.group_create === "admin" && user.role !== "admin") {
    return fail("当前仅管理员可创建群聊", 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 30).trim();
  const notice = str(body.notice, 200).trim();
  if (name.length < 2 || name.length > 30) return fail("群名称需为 2-30 个字符");

  const result = await db
    .prepare("INSERT INTO chat_rooms (kind, name, notice, owner_id) VALUES ('group', ?, ?, ?)")
    .bind(name, notice, user.id)
    .run();
  const roomId = Number(result.meta.last_row_id);

  await db
    .prepare(
      "INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role, last_read_id) VALUES (?, ?, 'owner', 0)",
    )
    .bind(roomId, user.id)
    .run();

  const ids = Array.isArray(body.member_ids)
    ? (body.member_ids as unknown[]).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0).slice(0, 50)
    : [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await c.env.DB
      .prepare(`SELECT id FROM users WHERE status = 'active' AND id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: number }>();
    const valid = (results ?? []).map((r) => r.id);
    if (valid.length) {
      await db.batch(
        valid.map((id) =>
          db
            .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
            .bind(roomId, id),
        ),
      );
    }
  }

  await logUserAction(c.env.DB, user.id, "chat_group_create", `#${roomId} ${name}`, getClientIp(c));
  return ok({ id: roomId });
});

app.get("/rooms/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  await ensurePresenceSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);

  let me = await memberOf(db, roomId, user.id);
  if (room.kind === "community" && !me) {
    await ensureCommunityMembership(db, user.id);
    me = await memberOf(db, roomId, user.id);
  }
  if (!me) return fail("你不在该会话中", 403);

  const { results: memberRows } = await db
    .prepare(
      `SELECT m.user_id, m.alias, m.remark, m.role, m.joined_at
       FROM chat_room_members m
       WHERE m.room_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at ASC
       LIMIT 300`,
    )
    .bind(roomId)
    .all<{ user_id: number; alias: string; remark: string; role: string; joined_at: string }>();

  const memberUsers = await userMap(c.env.DB, (memberRows ?? []).map((m) => m.user_id));
  const memberPresence = await presenceMap(db, (memberRows ?? []).map((m) => m.user_id));
  const members = (memberRows ?? []).map((m) => {
    const u = memberUsers.get(m.user_id);
    return {
      user_id: m.user_id,
      username: u?.username || "玩家",
      avatar: u?.avatar || "",
      alias: m.alias || "",
      remark: m.remark || "",
      role: m.role,
      joined_at: m.joined_at,
      presence: memberPresence.get(m.user_id) || null,
    };
  });

  let displayName = me.remark ? me.remark : room.name;
  let displayAvatar = room.avatar;
  let peerId = 0;
  let peerPresence = null;
  if (room.kind === "dm") {
    const peer = members.find((m) => m.user_id !== user.id);
    peerId = peer?.user_id || 0;
    peerPresence = peer?.presence || null;
    const contact = peerId
      ? await db
          .prepare("SELECT alias FROM user_contacts WHERE owner_id = ? AND target_id = ?")
          .bind(user.id, peerId)
          .first<{ alias: string }>()
      : null;
    displayName = contact?.alias || peer?.alias || peer?.username || "私信";
    displayAvatar = peer?.avatar || "";
  }

  return ok({
    room: {
      ...room,
      display_name: displayName,
      display_avatar: displayAvatar,
      peer_id: peerId,
      peer_presence: peerPresence,
      member_count: members.length,
    },
    me,
    members,
  });
});

app.patch("/rooms/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (!(await memberOf(db, roomId, user.id))) return fail("你不在该会话中", 403);
  if (!(await canManageRoom(db, room, user))) return fail("无权限修改该会话", 403);
  if (room.kind === "dm") return fail("私信会话不支持修改");

  const body = await c.req.json().catch(() => ({}));
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (typeof body.name === "string") {
    const name = str(body.name, 30).trim();
    if (name.length < 2 || name.length > 30) return fail("群名称需为 2-30 个字符");
    sets.push("name = ?");
    binds.push(name);
  }
  if (typeof body.avatar === "string") {
    sets.push("avatar = ?");
    binds.push(str(body.avatar, 500).trim());
  }
  if (typeof body.notice === "string") {
    sets.push("notice = ?");
    binds.push(str(body.notice, 200).trim());
  }
  if (!sets.length) return fail("没有需要保存的内容");

  sets.push("updated_at = datetime('now')");
  await db.prepare(`UPDATE chat_rooms SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, roomId).run();
  await logUserAction(c.env.DB, user.id, "chat_room_update", `#${roomId}`, getClientIp(c));
  return ok({ updated: true });
});

// 解散群聊：群主或全局管理员（社区群、私信不可解散）
app.delete("/rooms/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind !== "group") return fail("只有自建群聊可以解散", 403);
  if (room.owner_id !== user.id && user.role !== "admin") {
    return fail("只有群主或管理员可以解散群聊", 403);
  }

  await db.batch([
    db.prepare("DELETE FROM chat_messages WHERE room_id = ?").bind(roomId),
    db.prepare("DELETE FROM chat_room_members WHERE room_id = ?").bind(roomId),
    db.prepare("DELETE FROM chat_rooms WHERE id = ?").bind(roomId),
  ]);
  await logUserAction(c.env.DB, user.id, "chat_group_dissolve", `解散群 #${roomId} ${room.name}`, getClientIp(c));
  return ok({ dissolved: true });
});

app.post("/rooms/:id/join", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind === "dm") return fail("私信会话需由对方发起", 403);
  await db
    .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
    .bind(roomId, user.id)
    .run();
  return ok({ joined: true });
});

app.post("/rooms/:id/leave", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind === "community") return fail("社区群不可退出");
  if (room.owner_id === user.id) return fail("群主需先转让或解散群聊");
  await db
    .prepare("DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?")
    .bind(roomId, user.id)
    .run();
  return ok({ left: true });
});

app.post("/rooms/:id/read", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  if (!(await memberOf(db, roomId, user.id))) return fail("你不在该会话中", 403);
  const body = await c.req.json().catch(() => ({}));
  const lastId = Number(body.last_id) || 0;
  await db
    .prepare(
      "UPDATE chat_room_members SET last_read_id = MAX(last_read_id, ?) WHERE room_id = ? AND user_id = ?",
    )
    .bind(lastId, roomId, user.id)
    .run();
  return ok({ read: true });
});

app.post("/rooms/:id/alias", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  const me = await memberOf(db, roomId, user.id);
  if (!me) return fail("你不在该会话中", 403);

  const body = await c.req.json().catch(() => ({}));
  const alias = str(body.alias, 20).trim();
  await db
    .prepare("UPDATE chat_room_members SET alias = ? WHERE room_id = ? AND user_id = ?")
    .bind(alias, roomId, user.id)
    .run();

  // 私信里设置备注，同时写入好友备注
  if (room.kind === "dm" && alias) {
    const peer = await db
      .prepare(
        "SELECT user_id FROM chat_room_members WHERE room_id = ? AND user_id <> ? LIMIT 1",
      )
      .bind(roomId, user.id)
      .first<{ user_id: number }>();
    if (peer) {
      await db
        .prepare(
          `UPDATE user_contacts SET alias = ?
           WHERE owner_id = ? AND target_id = ? AND status = 'accepted'`,
        )
        .bind(user.id, peer.user_id, alias)
        .run();
    }
  }
  return ok({ alias });
});

// 群备注：只对自己显示的群名称（类似 QQ 群备注，不影响其他成员）
app.post("/rooms/:id/remark", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const me = await memberOf(db, roomId, user.id);
  if (!me) return fail("你不在该会话中", 403);

  const body = await c.req.json().catch(() => ({}));
  const remark = str(body.remark, 20).trim();
  await db
    .prepare("UPDATE chat_room_members SET remark = ? WHERE room_id = ? AND user_id = ?")
    .bind(remark, roomId, user.id)
    .run();
  return ok({ remark });
});

// —— 成员 ——
app.post("/rooms/:id/members", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (!(await canManageRoom(db, room, user))) return fail("无权限邀请成员", 403);
  if (room.kind === "dm") return fail("私信会话不支持邀请");

  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.user_ids)
    ? (body.user_ids as unknown[]).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0).slice(0, 50)
    : [];
  if (!ids.length) return fail("请选择要邀请的玩家");
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await c.env.DB
    .prepare(`SELECT id FROM users WHERE status = 'active' AND id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: number }>();
  const valid = (results ?? []).map((r) => r.id).filter((id) => id !== user.id);
  if (!valid.length) return fail("没有可邀请的玩家");

  // 只能拉「已通过」的好友进群：只发了好友申请的不算
  const { results: friendRows } = await db
    .prepare(
      `SELECT target_id FROM user_contacts
       WHERE owner_id = ? AND status = 'accepted' AND target_id IN (${valid.map(() => "?").join(",")})`,
    )
    .bind(user.id, ...valid)
    .all<{ target_id: number }>();
  const friends = new Set((friendRows ?? []).map((r) => r.target_id));
  const allowed = valid.filter((id) => friends.has(id));
  if (!allowed.length) return fail("只能邀请已成为好友的玩家，请先发送好友申请并等待对方同意", 403);

  await db.batch(
    allowed.map((id) =>
      db
        .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(roomId, id),
    ),
  );
  return ok({ added: allowed.length, skipped: valid.length - allowed.length });
});

app.post("/rooms/:id/members/:uid/role", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const uid = Number(c.req.param("uid")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind === "dm") return fail("私信会话不支持设置管理员");

  const me = await memberOf(db, roomId, user.id);
  if (!me) return fail("你不在该会话中", 403);
  // 社区群：任何成员都可以把其他成员设为管理员（按需求放开）
  if (room.kind !== "community" && !(await canManageRoom(db, room, user))) {
    return fail("无权限设置管理员", 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const role = body.role === "admin" ? "admin" : "member";
  const target = await memberOf(db, roomId, uid);
  if (!target) return fail("该成员不在会话中", 404);
  if (target.role === "owner") return fail("群主角色不可修改");
  await db
    .prepare("UPDATE chat_room_members SET role = ? WHERE room_id = ? AND user_id = ?")
    .bind(role, roomId, uid)
    .run();
  return ok({ role });
});

app.delete("/rooms/:id/members/:uid", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const uid = Number(c.req.param("uid")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind === "community") return fail("社区群成员不可移除");
  if (!(await memberOf(db, roomId, user.id))) return fail("你不在该会话中", 403);

  if (uid !== user.id) {
    if (!(await canManageRoom(db, room, user))) return fail("无权限移除成员", 403);
    if (room.owner_id === uid) return fail("群主不可被移除");
  }
  await db
    .prepare("DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?")
    .bind(roomId, uid)
    .run();
  return ok({ removed: true });
});

// —— 消息 ——
app.get("/rooms/:id/messages", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const roomId = Number(c.req.param("id")) || 0;
  const room = await roomById(db, roomId);
  if (!room) return fail("会话不存在", 404);
  if (room.kind === "community") await ensureCommunityMembership(db, user.id);
  if (!(await memberOf(db, roomId, user.id))) return fail("你不在该会话中", 403);

  const afterId = Number(c.req.query("after_id")) || 0;
  const beforeId = Number(c.req.query("before_id")) || 0;

  let rows: MessageRow[];
  if (afterId > 0) {
    ({ results: rows } = await db
      .prepare(`${MSG_SELECT} WHERE m.room_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 50`)
      .bind(roomId, afterId)
      .all<MessageRow>());
  } else {
    ({ results: rows } = await db
      .prepare(`${MSG_SELECT} WHERE m.room_id = ? AND (? = 0 OR m.id < ?) ORDER BY m.id DESC LIMIT 50`)
      .bind(roomId, beforeId, beforeId)
      .all<MessageRow>());
    rows = (rows ?? []).reverse();
  }

  const online = await db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) AS n FROM chat_messages WHERE room_id = ? AND created_at >= datetime('now', '-5 minutes')",
    )
    .bind(roomId)
    .first<{ n: number }>();

  const decorated = await decorateMessages(c.env.DB, rows ?? []);
  return ok({
    messages: decorated.map(messageShape),
    online: online?.n ?? 0,
  });
});

app.post("/rooms/:id/send", requireAuth, async (c) => {
  const user = c.get("user")!;
  const roomId = Number(c.req.param("id")) || 0;
  const body = await c.req.json().catch(() => ({}));
  const res = await sendTextCore(c, user, roomId, String(body.content ?? ""), {
    replyTo: Number(body.reply_to) || 0,
    mentions: Array.isArray(body.mentions) ? body.mentions : [],
  });
  if (!res.ok) return fail(res.message, res.status || 400);
  return ok(res.data);
});

app.post("/rooms/:id/image", requireAuth, async (c) => {
  const user = c.get("user")!;
  const roomId = Number(c.req.param("id")) || 0;
  const res = await sendImageCore(c, user, roomId);
  if (!res.ok) return fail(res.message, res.status || 400);
  return ok(res.data);
});

app.post("/messages/:id/recall", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const id = Number(c.req.param("id")) || 0;
  if (!id) return fail("缺少消息 ID");

  const row = await db
    .prepare(
      "SELECT id, room_id, user_id, image_key, created_at, COALESCE(recalled, 0) AS recalled FROM chat_messages WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: number;
      room_id: number | null;
      user_id: number;
      image_key: string | null;
      created_at: string;
      recalled: number;
    }>();
  if (!row) return fail("消息不存在", 404);
  if (row.recalled) return ok({ recalled: true });

  const roomId = row.room_id ?? COMMUNITY_ID;
  const mem = await memberOf(db, roomId, user.id);
  const privileged =
    user.role === "admin" || mem?.role === "admin" || mem?.role === "owner";
  const isOwn = row.user_id === user.id;
  if (!isOwn && !privileged) return fail("只能撤回自己的消息", 403);
  if (isOwn && !privileged && ageMs(row.created_at) > 10 * 60 * 1000) {
    return fail("超过 10 分钟的消息无法撤回");
  }

  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await db
    .prepare(
      `UPDATE chat_messages
       SET recalled = 1, content = '', image_key = '', recalled_at = datetime('now'), recalled_by = ?
       WHERE id = ?`,
    )
    .bind(user.id, id)
    .run();
  await logUserAction(c.env.DB, user.id, "chat_recall", `撤回 #${id}`, getClientIp(c));
  return ok({ recalled: true });
});

// —— 好友 / 私信 ——
app.get("/contacts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const { results } = await db
    .prepare(
      `SELECT target_id AS user_id, alias, created_at
       FROM user_contacts WHERE owner_id = ? AND status = 'accepted'
       ORDER BY created_at DESC LIMIT 500`,
    )
    .bind(user.id)
    .all<{ user_id: number; alias: string; created_at: string }>();
  const users = await userMap(c.env.DB, (results ?? []).map((r) => r.user_id));
  const online = await presenceMap(db, (results ?? []).map((r) => r.user_id));
  const contacts = (results ?? []).flatMap((r) => {
    const u = users.get(r.user_id);
    return u
      ? [{ ...r, username: u.username, avatar: u.avatar, presence: online.get(r.user_id) || null }]
      : [];
  });
  return ok({ contacts });
});

app.post("/contacts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const body = await c.req.json().catch(() => ({}));
  const targetId = Number(body.user_id) || 0;
  if (!targetId || targetId === user.id) return fail("请选择有效的玩家");
  const target = await c.env.DB
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(targetId)
    .first<{ id: number }>();
  if (!target) return fail("玩家不存在", 404);

  const mine = await db
    .prepare("SELECT status FROM user_contacts WHERE owner_id = ? AND target_id = ?")
    .bind(user.id, targetId)
    .first<{ status: string }>();
  if (mine?.status === "accepted") return ok({ added: true, already: true });

  // 对方已经申请过自己：直接互相通过，省一步操作
  const theirs = await db
    .prepare("SELECT status FROM user_contacts WHERE owner_id = ? AND target_id = ?")
    .bind(targetId, user.id)
    .first<{ status: string }>();
  if (theirs?.status === "pending") {
    await db.batch([
      db
        .prepare("UPDATE user_contacts SET status = 'accepted' WHERE owner_id = ? AND target_id = ?")
        .bind(targetId, user.id),
      db
        .prepare(
          `INSERT INTO user_contacts (owner_id, target_id, alias, status) VALUES (?, ?, '', 'accepted')
           ON CONFLICT(owner_id, target_id) DO UPDATE SET status = 'accepted'`,
        )
        .bind(user.id, targetId),
    ]);
    return ok({ added: true, accepted: true });
  }

  if (!(await rateLimit(c.env.DB, `friend-req:${user.id}`, 20, 3600))) {
    return fail("好友申请过于频繁，请稍后再试", 429);
  }

  await db
    .prepare(
      `INSERT INTO user_contacts (owner_id, target_id, alias, status) VALUES (?, ?, '', 'pending')
       ON CONFLICT(owner_id, target_id) DO UPDATE SET status = 'pending', created_at = datetime('now')`,
    )
    .bind(user.id, targetId)
    .run();
  return ok({ requested: true });
});

// 好友申请：收到的 + 已发出的
app.get("/contacts/requests", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const [{ results: incoming }, { results: outgoing }] = await Promise.all([
    db
      .prepare(
        `SELECT owner_id AS user_id, created_at FROM user_contacts
         WHERE target_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(user.id)
      .all<{ user_id: number; created_at: string }>(),
    db
      .prepare(
        `SELECT target_id AS user_id, created_at FROM user_contacts
         WHERE owner_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(user.id)
      .all<{ user_id: number; created_at: string }>(),
  ]);
  const users = await userMap(c.env.DB, [
    ...(incoming ?? []).map((r) => r.user_id),
    ...(outgoing ?? []).map((r) => r.user_id),
  ]);
  const shape = (rows: { user_id: number; created_at: string }[] | null) =>
    (rows ?? []).flatMap((r) => {
      const u = users.get(r.user_id);
      return u ? [{ ...r, username: u.username, avatar: u.avatar }] : [];
    });
  return ok({ incoming: shape(incoming), outgoing: shape(outgoing) });
});

app.post("/contacts/requests/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const requesterId = Number(c.req.param("id")) || 0;
  const body = await c.req.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : "accept";
  const pending = await db
    .prepare(
      "SELECT 1 AS x FROM user_contacts WHERE owner_id = ? AND target_id = ? AND status = 'pending'",
    )
    .bind(requesterId, user.id)
    .first<{ x: number }>();
  if (!pending) return fail("该好友申请不存在或已处理", 404);

  if (action === "reject") {
    await db
      .prepare("DELETE FROM user_contacts WHERE owner_id = ? AND target_id = ?")
      .bind(requesterId, user.id)
      .run();
    return ok({ rejected: true });
  }

  await db.batch([
    db
      .prepare("UPDATE user_contacts SET status = 'accepted' WHERE owner_id = ? AND target_id = ?")
      .bind(requesterId, user.id),
    db
      .prepare(
        `INSERT INTO user_contacts (owner_id, target_id, alias, status) VALUES (?, ?, '', 'accepted')
         ON CONFLICT(owner_id, target_id) DO UPDATE SET status = 'accepted'`,
      )
      .bind(user.id, requesterId),
  ]);
  return ok({ accepted: true });
});

app.patch("/contacts/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const targetId = Number(c.req.param("id")) || 0;
  const body = await c.req.json().catch(() => ({}));
  const alias = str(body.alias, 20).trim();
  const row = await db
    .prepare(
      "SELECT 1 AS x FROM user_contacts WHERE owner_id = ? AND target_id = ? AND status = 'accepted'",
    )
    .bind(user.id, targetId)
    .first<{ x: number }>();
  if (!row) return fail("该玩家不在好友列表中", 404);
  await db
    .prepare("UPDATE user_contacts SET alias = ? WHERE owner_id = ? AND target_id = ?")
    .bind(alias, user.id, targetId)
    .run();
  return ok({ alias });
});

app.delete("/contacts/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const targetId = Number(c.req.param("id")) || 0;
  await db.batch([
    db
      .prepare("DELETE FROM user_contacts WHERE owner_id = ? AND target_id = ?")
      .bind(user.id, targetId),
    db
      .prepare("DELETE FROM user_contacts WHERE owner_id = ? AND target_id = ?")
      .bind(targetId, user.id),
  ]);
  return ok({ deleted: true });
});

app.get("/users/search", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const q = str(c.req.query("q"), 30).trim();
  if (!q) return ok({ users: [] });
  const like = `%${q}%`;
  const { results } = await c.env.DB
    .prepare(
      `SELECT id, username, avatar, mc_username
       FROM users
       WHERE status = 'active' AND id <> ? AND (username LIKE ? OR mc_username LIKE ?)
       ORDER BY id DESC LIMIT 20`,
    )
    .bind(user.id, like, like)
    .all<{ id: number; username: string; avatar: string | null; mc_username: string | null }>();

  const ids = (results ?? []).map((r) => r.id);
  const statusMap = new Map<number, "accepted" | "outgoing" | "incoming" | "none">();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const { results: rows } = await db
      .prepare(
        `SELECT owner_id, target_id, status FROM user_contacts
         WHERE (owner_id = ? AND target_id IN (${placeholders}))
            OR (target_id = ? AND owner_id IN (${placeholders}))`,
      )
      .bind(user.id, ...ids, user.id, ...ids)
      .all<{ owner_id: number; target_id: number; status: string }>();
    for (const row of rows ?? []) {
      const peer = row.owner_id === user.id ? row.target_id : row.owner_id;
      if (statusMap.get(peer) === "accepted") continue;
      if (row.status === "accepted") statusMap.set(peer, "accepted");
      else if (row.owner_id === user.id) statusMap.set(peer, "outgoing");
      else statusMap.set(peer, "incoming");
    }
  }

  const online = await presenceMap(db, ids);

  return ok({
    users: (results ?? []).map((r) => ({
      id: r.id,
      username: r.username,
      avatar: r.avatar || "",
      mc_username: r.mc_username,
      is_contact: statusMap.get(r.id) === "accepted" ? 1 : 0,
      friend_status: statusMap.get(r.id) || "none",
      presence: online.get(r.id) || null,
    })),
  });
});

app.post("/dm", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const body = await c.req.json().catch(() => ({}));
  const targetId = Number(body.user_id) || 0;
  if (!targetId || targetId === user.id) return fail("不能和自己发起私信");
  const target = await c.env.DB
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(targetId)
    .first<{ id: number }>();
  if (!target) return fail("玩家不存在", 404);

  if (!(await areFriends(db, user.id, targetId))) {
    return fail("请先发送好友申请，对方同意后才能发私信", 403);
  }

  const existing = await db
    .prepare(
      `SELECT r.id FROM chat_rooms r
       JOIN chat_room_members a ON a.room_id = r.id AND a.user_id = ?
       JOIN chat_room_members b ON b.room_id = r.id AND b.user_id = ?
       WHERE r.kind = 'dm' LIMIT 1`,
    )
    .bind(user.id, targetId)
    .first<{ id: number }>();

  let roomId = existing?.id || 0;
  if (!roomId) {
    const result = await db
      .prepare("INSERT INTO chat_rooms (kind, name, owner_id) VALUES ('dm', '', NULL)")
      .run();
    roomId = Number(result.meta.last_row_id);
    await db.batch([
      db
        .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(roomId, user.id),
      db
        .prepare("INSERT OR IGNORE INTO chat_room_members (room_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(roomId, targetId),
    ]);
  }

  return ok({ id: roomId });
});

app.get("/unread", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  await ensureCommunityMembership(db, user.id);
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(
         (SELECT COUNT(*) FROM chat_messages c
          WHERE c.room_id = m.room_id AND c.id > m.last_read_id AND c.user_id <> ?
            AND COALESCE(c.recalled, 0) = 0)
       ), 0) AS n
       FROM chat_room_members m WHERE m.user_id = ?`,
    )
    .bind(user.id, user.id)
    .first<{ n: number }>();
  const total = row?.n ?? 0;
  return ok({ total, rooms: total });
});

// —— 兼容旧聊天面板（全部映射到社区群） ——
app.get("/messages", async (c) => {
  const db = fdb(c);
  await ensureChatSchema(db);
  const afterId = Number(c.req.query("after_id")) || 0;
  const beforeId = Number(c.req.query("before_id")) || 0;

  let rows: MessageRow[];
  if (afterId > 0) {
    ({ results: rows } = await db
      .prepare(`${MSG_SELECT} WHERE m.room_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 50`)
      .bind(COMMUNITY_ID, afterId)
      .all<MessageRow>());
  } else {
    ({ results: rows } = await db
      .prepare(`${MSG_SELECT} WHERE m.room_id = ? AND (? = 0 OR m.id < ?) ORDER BY m.id DESC LIMIT 50`)
      .bind(COMMUNITY_ID, beforeId, beforeId)
      .all<MessageRow>());
    rows = (rows ?? []).reverse();
  }

  const online = await db
    .prepare(
      "SELECT COUNT(DISTINCT user_id) AS n FROM chat_messages WHERE room_id = ? AND created_at >= datetime('now', '-5 minutes')",
    )
    .bind(COMMUNITY_ID)
    .first<{ n: number }>();

  const decorated = await decorateMessages(c.env.DB, rows ?? []);
  return ok({ messages: decorated.map(messageShape), online: online?.n ?? 0 });
});

app.post("/send", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  await ensureCommunityMembership(db, user.id);
  const body = await c.req.json().catch(() => ({}));
  const res = await sendTextCore(c, user, COMMUNITY_ID, String(body.content ?? ""), {
    replyTo: Number(body.reply_to) || 0,
    mentions: Array.isArray(body.mentions) ? body.mentions : [],
  });
  if (!res.ok) return fail(res.message, res.status || 400);
  return ok(res.data);
});

app.post("/image", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  await ensureCommunityMembership(db, user.id);
  const res = await sendImageCore(c, user, COMMUNITY_ID);
  if (!res.ok) return fail(res.message, res.status || 400);
  return ok(res.data);
});

app.post("/delete-own", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (!id) return fail("缺少消息 ID");
  const db = fdb(c);
  await ensureChatSchema(db);
  const row = await db
    .prepare("SELECT id, user_id, image_key, created_at FROM chat_messages WHERE id = ?")
    .bind(id)
    .first<{ id: number; user_id: number; image_key: string | null; created_at: string }>();
  if (!row) return fail("消息不存在", 404);
  if (row.user_id !== user.id) return fail("只能撤回自己的消息", 403);
  if (user.role !== "admin" && ageMs(row.created_at) > 10 * 60 * 1000) {
    return fail("超过 10 分钟的消息无法撤回");
  }
  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await db
    .prepare(
      `UPDATE chat_messages SET recalled = 1, content = '', image_key = '', recalled_at = datetime('now'), recalled_by = ? WHERE id = ?`,
    )
    .bind(user.id, id)
    .run();
  return ok({ deleted: true });
});

// —— 管理端 ——
app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/rooms", async (c) => {
  const db = fdb(c);
  await ensureChatSchema(db);
  const { results } = await db
    .prepare(
      `SELECT r.id, r.kind, r.name, r.avatar, r.notice, r.owner_id, r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM chat_room_members m WHERE m.room_id = r.id) AS member_count,
              (SELECT COUNT(*) FROM chat_messages c WHERE c.room_id = r.id) AS message_count
       FROM chat_rooms r
       ORDER BY r.kind = 'community' DESC, r.id DESC LIMIT 500`,
    )
    .all<Record<string, unknown>>();

  const owners = await userMap(
    c.env.DB,
    (results ?? []).map((r) => Number(r.owner_id) || 0),
  );
  return ok({
    rooms: (results ?? []).map((r) => ({
      ...r,
      owner_name: owners.get(Number(r.owner_id) || 0)?.username || "",
    })),
  });
});

app.post("/admin/rooms/:id/delete", async (c) => {
  const admin = c.get("user")!;
  const db = fdb(c);
  await ensureChatSchema(db);
  const id = Number(c.req.param("id")) || 0;
  if (!id || id === COMMUNITY_ID) return fail("社区群不可删除");
  const room = await roomById(db, id);
  if (!room) return fail("会话不存在", 404);

  // 清理会话图片
  try {
    const { results } = await db
      .prepare("SELECT image_key FROM chat_messages WHERE room_id = ? AND image_key != '' LIMIT 500")
      .bind(id)
      .all<{ image_key: string }>();
    for (const r of results ?? []) {
      if (r.image_key.startsWith("uploads/chat/")) {
        await c.env.ASSETS?.delete(r.image_key).catch(() => undefined);
      }
    }
  } catch {
    /* 忽略清理失败 */
  }

  await db.batch([
    db.prepare("DELETE FROM chat_room_members WHERE room_id = ?").bind(id),
    db.prepare("DELETE FROM chat_messages WHERE room_id = ?").bind(id),
    db.prepare("DELETE FROM chat_rooms WHERE id = ?").bind(id),
  ]);
  await logOp(c.env.DB, c, admin.id, "chat_room_delete", `#${id} ${room.name || room.kind}`);
  return ok({ deleted: true });
});

app.post("/admin/delete", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (!id) return fail("缺少消息 ID");
  const db = fdb(c);
  await ensureChatSchema(db);
  const row = await db
    .prepare("SELECT id, image_key FROM chat_messages WHERE id = ?")
    .bind(id)
    .first<{ id: number; image_key: string | null }>();
  if (!row) return fail("消息不存在", 404);
  if (row.image_key?.startsWith("uploads/chat/")) {
    await c.env.ASSETS?.delete(row.image_key).catch(() => undefined);
  }
  await db.prepare("DELETE FROM chat_messages WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, admin.id, "chat_delete", `#${id}`);
  return ok({ deleted: true });
});

export default app;
