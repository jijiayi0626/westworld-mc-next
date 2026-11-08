import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, UserSession } from "../lib/auth";
import { requireAuth, requireAdmin, getSecret, readToken } from "../lib/auth";
import { verifyToken } from "../lib/jwt";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp, logUserAction } from "../lib/log";
import { rateLimit } from "../lib/ratelimit";
import { addPoints, awardWithCap, loadPointsConfig } from "../lib/points";
import { getClientIp } from "../lib/net";

const app = new Hono<AppEnv>();

/** 论坛数据统一存独立 D1（FORUM_DB）；未绑定时回退主库 */
function fdb(c: { env: AppEnv["Bindings"] }): D1Database {
  return c.env.FORUM_DB ?? c.env.DB;
}

/** 用户资料在主库，论坛库不能直接 JOIN users：按作者 ID 批量补头像 */
async function avatarMap(db: D1Database, ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const clean = [...new Set(ids.filter((v): v is number => Number.isInteger(v) && (v as number) > 0))];
  const map = new Map<number, string>();
  for (let i = 0; i < clean.length; i += 80) {
    const chunk = clean.slice(i, i + 80);
    try {
      const { results } = await db
        .prepare(`SELECT id, avatar FROM users WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all<{ id: number; avatar: string | null }>();
      for (const r of results ?? []) map.set(r.id, r.avatar || "");
    } catch {
      /* 主库不可用时头像留空 */
    }
  }
  return map;
}

interface ForumPost {
  id: number;
  board: string;
  title: string;
  content: string;
  author_id: number | null;
  author_name: string;
  ip_region?: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface ForumReply {
  id: number;
  post_id: number;
  author_id: number | null;
  author_name: string;
  author_avatar: string;
  ip_region?: string;
  parent_id?: number;
  reply_to?: string;
  image_url?: string;
  content: string;
  created_at: string;
}

const BOARDS = [
  { key: "general", name: "综合讨论", desc: "服务器日常、闲聊与自由讨论" },
  { key: "announcement", name: "官方公告", desc: "服务器官方公告与重要通知" },
  { key: "qa", name: "问答求助", desc: "游戏问题、技术疑问与互助解答" },
  { key: "share", name: "作品分享", desc: "建筑、截图、视频与创作分享" },
  { key: "guide", name: "攻略教程", desc: "玩法攻略、生存技巧与教程" },
];
const USER_BOARDS = ["general", "qa", "share", "guide"];
const PAGE_SIZE = 15;

/** Cloudflare 只提供到省 / 州一级，这里不保存完整 IP，仅保存省份用于展示 IP 属地 */
const CN_REGIONS: Record<string, string> = {
  Beijing: "北京",
  Tianjin: "天津",
  Hebei: "河北",
  Shanxi: "山西",
  "Inner Mongolia": "内蒙古",
  Liaoning: "辽宁",
  Jilin: "吉林",
  Heilongjiang: "黑龙江",
  Shanghai: "上海",
  Jiangsu: "江苏",
  Zhejiang: "浙江",
  Anhui: "安徽",
  Fujian: "福建",
  Jiangxi: "江西",
  Shandong: "山东",
  Henan: "河南",
  Hubei: "湖北",
  Hunan: "湖南",
  Guangdong: "广东",
  Guangxi: "广西",
  Hainan: "海南",
  Chongqing: "重庆",
  Sichuan: "四川",
  Guizhou: "贵州",
  Yunnan: "云南",
  Tibet: "西藏",
  Shaanxi: "陕西",
  Gansu: "甘肃",
  Qinghai: "青海",
  Ningxia: "宁夏",
  Xinjiang: "新疆",
  "Hong Kong": "香港",
  Macau: "澳门",
  Taiwan: "台湾",
};

function ipRegion(c: Context<AppEnv>): string {
  const cf = (c.req.raw as unknown as { cf?: Record<string, unknown> }).cf;
  const country = String(cf?.country || "").toUpperCase();
  const region = String(cf?.region || "").trim();
  const city = String(cf?.city || "").trim();
  if (country === "CN") {
    if (region && CN_REGIONS[region]) return CN_REGIONS[region];
    return region.slice(0, 20) || city.slice(0, 20) || "中国";
  }
  return (region || city || country).slice(0, 40);
}

// 惰性建表只做一次（模块级缓存，避免每个请求都执行 DDL）
let forumSchemaReady = false;

async function ensureForumSchema(db: D1Database): Promise<void> {
  if (forumSchemaReady) return;
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS forum_replies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          author_id INTEGER,
          author_name TEXT DEFAULT '',
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id, id)"),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS forum_likes (
          post_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          PRIMARY KEY(post_id, user_id)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS forum_notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL DEFAULT 'reply',
          post_id INTEGER NOT NULL DEFAULT 0,
          reply_id INTEGER NOT NULL DEFAULT 0,
          actor_id INTEGER,
          actor_name TEXT DEFAULT '',
          content TEXT DEFAULT '',
          read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS forum_checkins (
          user_id INTEGER NOT NULL,
          day TEXT NOT NULL,
          points INTEGER NOT NULL DEFAULT 0,
          streak INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY(user_id, day)
        )`,
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS forum_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL DEFAULT 'post',
          target_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL DEFAULT 0,
          reporter_id INTEGER NOT NULL,
          reporter_name TEXT DEFAULT '',
          reason TEXT NOT NULL DEFAULT '',
          detail TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          handled_by INTEGER,
          handled_at TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      ),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_forum_notifications_user ON forum_notifications(user_id, read, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_forum_reports_status ON forum_reports(status, id)"),
    ]);

    // 旧库补列：IP 属地（只记录到省，不保存完整 IP）
    for (const table of ["forum_posts", "forum_replies"]) {
      const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      const cols = new Set((info.results ?? []).map((r) => r.name));
      if (!cols.has("ip_region")) {
        try {
          await db.prepare(`ALTER TABLE ${table} ADD COLUMN ip_region TEXT DEFAULT ''`).run();
        } catch {
          /* 并发补列时忽略 */
        }
      }
      if (!cols.has("image_url")) {
        try {
          await db.prepare(`ALTER TABLE ${table} ADD COLUMN image_url TEXT DEFAULT ''`).run();
        } catch {
          /* 并发补列时忽略 */
        }
      }
    }
    const replyInfo = await db.prepare("PRAGMA table_info(forum_replies)").all<{ name: string }>();
    if (!(replyInfo.results ?? []).some((r) => r.name === "parent_id")) {
      try {
        await db.prepare("ALTER TABLE forum_replies ADD COLUMN parent_id INTEGER DEFAULT 0").run();
      } catch {
        /* 并发补列时忽略 */
      }
    }

    forumSchemaReady = true;
  } catch {
    // 建表失败不阻断读取（下次请求再试）
  }
}

/** 可选登录态：公开接口里用于判断当前用户是否已点赞 */
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

/** D1 datetime('now') 为 UTC；返回距今天数（无效时间视为很久以前） */
function ageSeconds(createdAt: string): number {
  const t = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 1000;
}

/** 只接受站内上传图库路径，避免外链与脏数据 */
function normImage(value: unknown): string {
  const url = String(value || "").trim().slice(0, 300);
  return url.startsWith("/static/uploads/") ? url : "";
}

interface NotifyInput {
  userId: number | null | undefined;
  type: "reply" | "like";
  postId: number;
  replyId?: number;
  actorId: number;
  actorName: string;
  content: string;
}

/** 写入站内通知；自己操作自己、接收人无效时跳过；点赞同一帖子同一人只提醒一次 */
async function notify(db: D1Database, input: NotifyInput): Promise<void> {
  const target = Number(input.userId) || 0;
  if (!target || target === input.actorId) return;
  try {
    if (input.type === "like") {
      const exists = await db
        .prepare(
          "SELECT 1 AS x FROM forum_notifications WHERE user_id = ? AND type = 'like' AND post_id = ? AND actor_id = ? LIMIT 1",
        )
        .bind(target, input.postId, input.actorId)
        .first<{ x: number }>();
      if (exists) return;
    }
    await db
      .prepare(
        "INSERT INTO forum_notifications (user_id, type, post_id, reply_id, actor_id, actor_name, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        target,
        input.type,
        input.postId,
        input.replyId || 0,
        input.actorId,
        input.actorName.slice(0, 40),
        input.content.slice(0, 80),
      )
      .run();
  } catch {
    /* 通知失败不影响主流程 */
  }
}

/** 按后台配置发放社区积分；失败不影响发帖 / 评论 / 点赞主流程 */
async function awardAction(
  db: D1Database,
  userId: number,
  reason: "post" | "comment" | "like",
  detail: string,
): Promise<void> {
  try {
    const cfg = await loadPointsConfig(db);
    if (!cfg.enabled) return;
    if (reason === "post") {
      await awardWithCap(db, userId, "post", cfg.post_points, cfg.post_daily_limit, detail);
    } else if (reason === "comment") {
      await awardWithCap(db, userId, "comment", cfg.comment_points, cfg.comment_daily_limit, detail);
    } else {
      await awardWithCap(db, userId, "like_received", cfg.like_points, cfg.like_daily_limit, detail);
    }
  } catch {
    /* 积分失败不影响主流程 */
  }
}

// 公告列表（公开：无需登录；官网「论坛」页与用户中心共用）
app.get("/announcements", async (c) => {
  const { results } = await fdb(c)
    .prepare(
      `SELECT p.id, p.title, p.content, p.author_id, p.author_name,
              p.pinned, p.created_at, p.updated_at
       FROM forum_posts p
       WHERE p.board = 'announcement' ORDER BY p.pinned DESC, p.id DESC LIMIT 100`,
    )
    .all<ForumPost & { author_id: number | null }>();
  const avatars = await avatarMap(c.env.DB, (results ?? []).map((r) => r.author_id));
  return ok(
    (results ?? []).map((r) => ({ ...r, author_avatar: avatars.get(r.author_id ?? 0) || "" })),
  );
});

// 分区列表（固定）
app.get("/boards", async (c) => {
  return ok(BOARDS);
});

// 帖子列表（公开）：board / page / keyword
app.get("/posts", async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);

  const boardRaw = c.req.query("board") || "all";
  const board = ["all", ...BOARDS.map((b) => b.key)].includes(boardRaw) ? boardRaw : "all";
  const page = Math.max(1, Math.min(1000, Number(c.req.query("page")) || 1));
  const keyword = str(c.req.query("keyword"), 50).trim();

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (board !== "all") {
    where.push("p.board = ?");
    binds.push(board);
  }
  if (keyword) {
    where.push("(p.title LIKE ? OR p.content LIKE ?)");
    binds.push(`%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await db
    .prepare(
      `SELECT p.id, p.board, p.title, substr(p.content, 1, 160) AS content, p.author_id, p.author_name,
              p.ip_region, p.image_url, p.pinned, p.created_at, 0 AS views,
              COALESCE(r.n, 0) AS reply_count, COALESCE(l.n, 0) AS like_count
       FROM forum_posts p
       LEFT JOIN (SELECT post_id, COUNT(*) AS n FROM forum_replies GROUP BY post_id) r ON r.post_id = p.id
       LEFT JOIN (SELECT post_id, COUNT(*) AS n FROM forum_likes GROUP BY post_id) l ON l.post_id = p.id
       ${whereSql}
       ORDER BY p.pinned DESC, p.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<Record<string, unknown>>();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM forum_posts p ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  const avatars = await avatarMap(c.env.DB, (results ?? []).map((r) => Number(r.author_id) || 0));
  const items = (results ?? []).map((r) => ({
    ...r,
    author_avatar: avatars.get(Number(r.author_id) || 0) || "",
  }));

  return ok({ items, total: totalRow?.n ?? 0, page });
});

// 帖子详情（公开）：完整正文 + 回复 + 当前用户点赞状态
app.get("/posts/:id", async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);

  const id = Number(c.req.param("id")) || 0;
  if (!id) return fail("帖子不存在", 404);

  const post = await db
    .prepare(
      `SELECT p.id, p.board, p.title, p.content, p.author_id, p.author_name, p.ip_region, p.image_url,
              p.pinned, p.created_at, p.updated_at, 0 AS views,
              (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM forum_likes l WHERE l.post_id = p.id) AS like_count
       FROM forum_posts p WHERE p.id = ?`,
    )
    .bind(id)
    .first<ForumPost & { reply_count: number; like_count: number; views: number }>();
  if (!post) return fail("帖子不存在", 404);

  const { results: replies } = await db
    .prepare(
      `SELECT r.id, r.post_id, r.author_id, r.author_name, r.ip_region, r.image_url, r.content, r.created_at,
              COALESCE(r.parent_id, 0) AS parent_id, p.author_name AS reply_to
       FROM forum_replies r
       LEFT JOIN forum_replies p ON p.id = r.parent_id
       WHERE r.post_id = ? ORDER BY r.id ASC LIMIT 200`,
    )
    .bind(id)
    .all<ForumReply>();

  const avatars = await avatarMap(c.env.DB, [
    post.author_id,
    ...(replies ?? []).map((r) => r.author_id),
  ]);
  const postWithAvatar = {
    ...post,
    author_avatar: avatars.get(post.author_id ?? 0) || "",
  };
  const repliesWithAvatar = (replies ?? []).map((r) => ({
    ...r,
    author_avatar: avatars.get(r.author_id ?? 0) || "",
  }));

  let liked = false;
  const user = await optionalUser(c);
  if (user) {
    const row = await db
      .prepare("SELECT 1 AS x FROM forum_likes WHERE post_id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<{ x: number }>();
    liked = !!row;
  }

  return ok({ post: postWithAvatar, replies: repliesWithAvatar, liked });
});

// 发帖（登录用户：不允许发公告）
app.post("/posts", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;

  const body = await c.req.json().catch(() => ({}));
  const board = str(body.board, 20).trim();
  const title = str(body.title, 120).trim();
  const content = str(body.content, 10000).trim();
  const imageUrl = normImage(body.image_url);

  if (!USER_BOARDS.includes(board)) return fail("请选择有效的分区");
  if (title.length < 5 || title.length > 120) return fail("标题需为 5-120 个字符");
  if ((content.length < 5 && !imageUrl) || content.length > 10000) return fail("内容需为 5-10000 个字符，或至少上传一张图片");

  // 频率限制：单账号 10 分钟 6 帖，单 IP 10 分钟 20 帖
  if (
    !(await rateLimit(c.env.DB, `forum-post:${user.id}`, 6, 600)) ||
    !(await rateLimit(c.env.DB, `forum-post-ip:${getClientIp(c)}`, 20, 600))
  ) {
    return fail("发帖过于频繁，请稍后再试", 429);
  }

  const last = await db
    .prepare("SELECT created_at FROM forum_posts WHERE author_id = ? ORDER BY id DESC LIMIT 1")
    .bind(user.id)
    .first<{ created_at: string }>();
  if (last && ageSeconds(last.created_at) < 30) {
    return fail("发帖太快了，请 30 秒后再试");
  }

  const result = await db
    .prepare(
      "INSERT INTO forum_posts (board, title, content, author_id, author_name, ip_region, image_url, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(board, title, content, user.id, user.username, ipRegion(c), imageUrl)
    .run();
  const id = Number(result.meta.last_row_id);

  await logUserAction(c.env.DB, user.id, "forum_post", `#${id} ${title.slice(0, 50)}`);
  await awardAction(c.env.DB, user.id, "post", `帖子 #${id}`);
  return ok({ id });
});

// 回帖
app.post("/posts/:id/reply", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const postId = Number(c.req.param("id")) || 0;

  const post = await db
    .prepare("SELECT id, author_id, title FROM forum_posts WHERE id = ?")
    .bind(postId)
    .first<{ id: number; author_id: number | null; title: string }>();
  if (!post) return fail("帖子不存在", 404);

  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 5000).trim();
  const imageUrl = normImage(body.image_url);
  const parentId = Number(body.parent_id) || 0;
  if ((content.length < 2 && !imageUrl) || content.length > 5000) return fail("回复需为 2-5000 个字符");

  // 楼中楼：父评论必须存在且属于同一帖子
  let replyTo = "";
  let parentAuthorId = 0;
  if (parentId > 0) {
    const parent = await db
      .prepare("SELECT post_id, author_id, author_name FROM forum_replies WHERE id = ?")
      .bind(parentId)
      .first<{ post_id: number; author_id: number | null; author_name: string }>();
    if (!parent || parent.post_id !== postId) return fail("要回复的评论不存在", 404);
    replyTo = parent.author_name;
    parentAuthorId = Number(parent.author_id) || 0;
  }

  // 频率限制：单账号 10 分钟 30 条，单 IP 10 分钟 60 条
  if (
    !(await rateLimit(c.env.DB, `forum-reply:${user.id}`, 30, 600)) ||
    !(await rateLimit(c.env.DB, `forum-reply-ip:${getClientIp(c)}`, 60, 600))
  ) {
    return fail("回复过于频繁，请稍后再试", 429);
  }

  const last = await db
    .prepare("SELECT created_at FROM forum_replies WHERE author_id = ? ORDER BY id DESC LIMIT 1")
    .bind(user.id)
    .first<{ created_at: string }>();
  if (last && ageSeconds(last.created_at) < 10) {
    return fail("回复太快了，请 10 秒后再试");
  }

  const result = await db
    .prepare(
      "INSERT INTO forum_replies (post_id, author_id, author_name, ip_region, parent_id, image_url, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(postId, user.id, user.username, ipRegion(c), parentId, imageUrl, content)
    .run();

  const profile = await c.env.DB.prepare("SELECT avatar FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ avatar: string | null }>();

  const reply: ForumReply = {
    id: Number(result.meta.last_row_id),
    post_id: postId,
    author_id: user.id,
    author_name: user.username,
    author_avatar: profile?.avatar || "",
    ip_region: ipRegion(c),
    parent_id: parentId,
    reply_to: replyTo,
    image_url: imageUrl,
    content,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  // 通知：帖子作者；楼中楼额外通知被回复的评论作者
  await notify(db, {
    userId: post.author_id,
    type: "reply",
    postId,
    replyId: reply.id,
    actorId: user.id,
    actorName: user.username,
    content,
  });
  if (parentAuthorId) {
    await notify(db, {
      userId: parentAuthorId,
      type: "reply",
      postId,
      replyId: reply.id,
      actorId: user.id,
      actorName: user.username,
      content,
    });
  }
  await logUserAction(c.env.DB, user.id, "forum_reply", `#${postId}`);
  await awardAction(c.env.DB, user.id, "comment", `评论 #${reply.id}`);
  return ok(reply);
});

// 点赞 / 取消点赞
app.post("/posts/:id/like", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const postId = Number(c.req.param("id")) || 0;

  const post = await db
    .prepare("SELECT id, author_id FROM forum_posts WHERE id = ?")
    .bind(postId)
    .first<{ id: number; author_id: number | null }>();
  if (!post) return fail("帖子不存在", 404);

  const exists = await db
    .prepare("SELECT 1 AS x FROM forum_likes WHERE post_id = ? AND user_id = ?")
    .bind(postId, user.id)
    .first<{ x: number }>();

  let liked: boolean;
  if (exists) {
    await db
      .prepare("DELETE FROM forum_likes WHERE post_id = ? AND user_id = ?")
      .bind(postId, user.id)
      .run();
    liked = false;
  } else {
    await db
      .prepare("INSERT OR IGNORE INTO forum_likes (post_id, user_id) VALUES (?, ?)")
      .bind(postId, user.id)
      .run();
    liked = true;
    await notify(db, {
      userId: post.author_id,
      type: "like",
      postId,
      actorId: user.id,
      actorName: user.username,
      content: "赞了你的帖子",
    });
    if (post.author_id && post.author_id !== user.id) {
      await awardAction(c.env.DB, post.author_id, "like", `帖子 #${postId}`);
    }
  }

  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM forum_likes WHERE post_id = ?")
    .bind(postId)
    .first<{ n: number }>();

  return ok({ liked, count: countRow?.n ?? 0 });
});

// 删除帖子（作者本人或管理员）
app.post("/posts/:id/delete", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const postId = Number(c.req.param("id")) || 0;

  const post = await db
    .prepare("SELECT id, author_id FROM forum_posts WHERE id = ?")
    .bind(postId)
    .first<{ id: number; author_id: number | null }>();
  if (!post) return fail("帖子不存在", 404);
  if (post.author_id !== user.id && user.role !== "admin") return fail("无权限删除该帖子", 403);

  await db.batch([
    db.prepare("DELETE FROM forum_replies WHERE post_id = ?").bind(postId),
    db.prepare("DELETE FROM forum_likes WHERE post_id = ?").bind(postId),
    db.prepare("DELETE FROM forum_notifications WHERE post_id = ?").bind(postId),
    db.prepare("DELETE FROM forum_reports WHERE post_id = ?").bind(postId),
    db.prepare("DELETE FROM forum_posts WHERE id = ?").bind(postId),
  ]);

  await logUserAction(c.env.DB, user.id, "forum_post_delete", `#${postId}`);
  return ok({ deleted: true });
});

// 删除回复（作者本人或管理员）
app.post("/replies/:id/delete", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const replyId = Number(c.req.param("id")) || 0;

  const reply = await db
    .prepare("SELECT id, post_id, author_id FROM forum_replies WHERE id = ?")
    .bind(replyId)
    .first<{ id: number; post_id: number; author_id: number | null }>();
  if (!reply) return fail("回复不存在", 404);
  if (reply.author_id !== user.id && user.role !== "admin") return fail("无权限删除该回复", 403);

  await db.batch([
    db.prepare("DELETE FROM forum_replies WHERE parent_id = ?").bind(replyId),
    db.prepare("DELETE FROM forum_replies WHERE id = ?").bind(replyId),
    db.prepare("DELETE FROM forum_notifications WHERE reply_id = ?").bind(replyId),
    db.prepare("DELETE FROM forum_reports WHERE target_type = 'reply' AND target_id = ?").bind(replyId),
  ]);
  await logUserAction(c.env.DB, user.id, "forum_reply_delete", `#${reply.post_id}/${replyId}`);
  return ok({ deleted: true });
});

// —— 社区通知 ——

// 通知列表（登录）：unread 为未读数，items 按时间倒序
app.get("/notifications", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit")) || 20));

  const { results } = await db
    .prepare(
      `SELECT id, user_id, type, post_id, reply_id, actor_id, actor_name, content, read, created_at
       FROM forum_notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .bind(user.id, limit)
    .all<Record<string, unknown>>();

  const avatars = await avatarMap(c.env.DB, (results ?? []).map((r) => Number(r.actor_id) || 0));
  const unreadRow = await db
    .prepare("SELECT COUNT(*) AS n FROM forum_notifications WHERE user_id = ? AND read = 0")
    .bind(user.id)
    .first<{ n: number }>();

  return ok({
    items: (results ?? []).map((r) => ({
      ...r,
      actor_avatar: avatars.get(Number(r.actor_id) || 0) || "",
    })),
    unread: unreadRow?.n ?? 0,
  });
});

// 未读数（登录；用于导航红点轮询）
app.get("/notifications/unread", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM forum_notifications WHERE user_id = ? AND read = 0")
    .bind(user.id)
    .first<{ n: number }>();
  return ok({ unread: row?.n ?? 0 });
});

// 标记已读：传 id 标记单条，不传则全部已读
app.post("/notifications/read", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 0;
  if (id > 0) {
    await db
      .prepare("UPDATE forum_notifications SET read = 1 WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .run();
  } else {
    await db
      .prepare("UPDATE forum_notifications SET read = 1 WHERE user_id = ? AND read = 0")
      .bind(user.id)
      .run();
  }
  return ok({ read: true });
});

// —— 每日签到（积分余额存主库 users.points）——

/** 以北京时间计算自然日 */
function todayCN(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function yesterdayCN(): string {
  return new Date(Date.now() + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10);
}

app.get("/checkin", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;

  const [todayRow, lastRow, pointsRow, pointsConfig] = await Promise.all([
    db.prepare("SELECT 1 AS x FROM forum_checkins WHERE user_id = ? AND day = ?").bind(user.id, todayCN()).first<{ x: number }>(),
    db.prepare("SELECT day, streak FROM forum_checkins WHERE user_id = ? ORDER BY day DESC LIMIT 1").bind(user.id).first<{ day: string; streak: number }>(),
    c.env.DB.prepare("SELECT points FROM users WHERE id = ?").bind(user.id).first<{ points: number }>(),
    loadPointsConfig(c.env.DB),
  ]);
  const nextStreak =
    lastRow?.day === todayCN()
      ? (lastRow.streak || 0) + 1
      : lastRow?.day === yesterdayCN()
        ? (lastRow.streak || 0) + 1
        : 1;

  return ok({
    checked_in: !!todayRow,
    date: todayCN(),
    points: pointsRow?.points ?? 0,
    streak: lastRow?.day === todayCN() || lastRow?.day === yesterdayCN() ? lastRow?.streak ?? 0 : 0,
    next_points:
      pointsConfig.signin_base +
      Math.min(Math.max(nextStreak - 1, 0), pointsConfig.signin_streak_max) * pointsConfig.signin_streak_bonus,
  });
});

app.post("/checkin", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const day = todayCN();

  const exists = await db
    .prepare("SELECT 1 AS x FROM forum_checkins WHERE user_id = ? AND day = ?")
    .bind(user.id, day)
    .first<{ x: number }>();
  if (exists) return fail("今天已经签到过了");

  const prev = await db
    .prepare("SELECT day, streak FROM forum_checkins WHERE user_id = ? ORDER BY day DESC LIMIT 1")
    .bind(user.id)
    .first<{ day: string; streak: number }>();

  const streak = prev?.day === yesterdayCN() ? (prev.streak || 0) + 1 : 1;
  const pointsConfig = await loadPointsConfig(c.env.DB);
  const gained = pointsConfig.enabled
    ? pointsConfig.signin_base +
      Math.min(Math.max(streak - 1, 0), pointsConfig.signin_streak_max) * pointsConfig.signin_streak_bonus
    : 0;
  const inserted = await db
    .prepare("INSERT OR IGNORE INTO forum_checkins (user_id, day, points, streak) VALUES (?, ?, ?, ?)")
    .bind(user.id, day, gained, streak)
    .run();
  if (inserted.meta.changes && gained > 0) {
    await addPoints(c.env.DB, user.id, gained, "checkin", `连续签到 ${streak} 天`);
  }
  await logUserAction(c.env.DB, user.id, "forum_checkin", `连续 ${streak} 天，+${gained} 积分`);

  const pointsRow = await c.env.DB.prepare("SELECT points FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ points: number }>();

  return ok({ checked_in: true, gained, streak, points: pointsRow?.points ?? 0 });
});

// —— 玩家主页（公开）——

app.get("/users/:id", async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const id = Number(c.req.param("id")) || 0;
  if (!id) return fail("用户不存在", 404);

  const profile = await c.env.DB.prepare(
    "SELECT id, username, avatar, bio, role, points, created_at FROM users WHERE id = ? AND status != 'banned'",
  )
    .bind(id)
    .first<{ id: number; username: string; avatar: string | null; bio: string | null; role: string; points: number; created_at: string }>();
  if (!profile) return fail("用户不存在", 404);

  const [postCount, replyCount, likeCount, posts, replies] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM forum_posts WHERE author_id = ?").bind(id).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM forum_replies WHERE author_id = ?").bind(id).first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM forum_likes l JOIN forum_posts p ON p.id = l.post_id WHERE p.author_id = ?")
      .bind(id)
      .first<{ n: number }>(),
    db
      .prepare(
        "SELECT id, board, title, substr(content, 1, 90) AS content, image_url, created_at FROM forum_posts WHERE author_id = ? ORDER BY id DESC LIMIT 10",
      )
      .bind(id)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT r.id, r.post_id, r.content, r.parent_id, r.created_at, p.title AS post_title
         FROM forum_replies r LEFT JOIN forum_posts p ON p.id = r.post_id
         WHERE r.author_id = ? ORDER BY r.id DESC LIMIT 10`,
      )
      .bind(id)
      .all<Record<string, unknown>>(),
  ]);

  return ok({
    user: {
      ...profile,
      avatar: profile.avatar || "",
      bio: profile.bio || "",
      points: profile.points ?? 0,
    },
    stats: {
      posts: postCount?.n ?? 0,
      replies: replyCount?.n ?? 0,
      likes: likeCount?.n ?? 0,
    },
    posts: posts.results ?? [],
    replies: replies.results ?? [],
  });
});

// —— 举报 ——

app.post("/reports", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;

  const body = await c.req.json().catch(() => ({}));
  const targetType = body.target_type === "reply" ? "reply" : "post";
  const targetId = Number(body.target_id) || 0;
  const reason = str(body.reason, 40).trim();
  const detail = str(body.detail, 300).trim();
  if (!targetId) return fail("举报对象不存在", 404);
  if (reason.length < 2) return fail("请选择举报原因");

  if (!(await rateLimit(c.env.DB, `forum-report:${user.id}`, 10, 3600))) {
    return fail("举报过于频繁，请稍后再试", 429);
  }

  let postId = targetId;
  let authorId = 0;
  if (targetType === "post") {
    const row = await db.prepare("SELECT id, author_id FROM forum_posts WHERE id = ?").bind(targetId).first<{ id: number; author_id: number | null }>();
    if (!row) return fail("帖子不存在", 404);
    postId = row.id;
    authorId = Number(row.author_id) || 0;
  } else {
    const row = await db.prepare("SELECT id, post_id, author_id FROM forum_replies WHERE id = ?").bind(targetId).first<{ id: number; post_id: number; author_id: number | null }>();
    if (!row) return fail("评论不存在", 404);
    postId = row.post_id;
    authorId = Number(row.author_id) || 0;
  }
  if (authorId === user.id) return fail("不能举报自己的内容");

  const dup = await db
    .prepare("SELECT 1 AS x FROM forum_reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'")
    .bind(user.id, targetType, targetId)
    .first<{ x: number }>();
  if (dup) return fail("你已举报过该内容，管理员会尽快处理");

  await db
    .prepare(
      "INSERT INTO forum_reports (target_type, target_id, post_id, reporter_id, reporter_name, reason, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(targetType, targetId, postId, user.id, user.username, reason, detail)
    .run();
  await logUserAction(c.env.DB, user.id, "forum_report", `${targetType}#${targetId} ${reason}`);
  return ok({ reported: true });
});

// —— 管理端 ——
app.use("/admin/*", requireAuth, requireAdmin);

app.post("/admin/announcements", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 120).trim();
  const content = str(body.content, 10000).trim();
  if (!title) return fail("公告标题不能为空");
  if (!content) return fail("公告内容不能为空");
  const pinned = body.pinned === true ? 1 : 0;

  const result = await fdb(c)
    .prepare(
      "INSERT INTO forum_posts (board, title, content, author_id, author_name, pinned) VALUES ('announcement', ?, ?, ?, ?, ?)",
    )
    .bind(title, content, admin.id, admin.username, pinned)
    .run();
  await logOp(c.env.DB, c, admin.id, "forum_announcement_create", title.slice(0, 50));
  return ok({ id: Number(result.meta.last_row_id) });
});

app.put("/admin/announcements/:id", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id")) || 0;
  const row = await fdb(c)
    .prepare("SELECT id FROM forum_posts WHERE id = ? AND board = 'announcement'")
    .bind(id)
    .first<{ id: number }>();
  if (!row) return fail("公告不存在", 404);

  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 120).trim();
  const content = str(body.content, 10000).trim();
  if (!title || !content) return fail("标题与内容不能为空");
  const pinned = body.pinned === true ? 1 : 0;

  await fdb(c)
    .prepare(
      "UPDATE forum_posts SET title = ?, content = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(title, content, pinned, id)
    .run();
  await logOp(c.env.DB, c, admin.id, "forum_announcement_update", `#${id}`);
  return ok({ updated: true });
});

app.delete("/admin/announcements/:id", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id")) || 0;
  const row = await fdb(c)
    .prepare("SELECT id FROM forum_posts WHERE id = ? AND board = 'announcement'")
    .bind(id)
    .first<{ id: number }>();
  if (!row) return fail("公告不存在", 404);

  await fdb(c).prepare("DELETE FROM forum_posts WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, admin.id, "forum_announcement_delete", `#${id}`);
  return ok({ deleted: true });
});

// —— 管理端：举报处理 ——

interface ReportRow {
  id: number;
  target_type: "post" | "reply";
  target_id: number;
  post_id: number;
  reporter_id: number;
  reporter_name: string;
  reason: string;
  detail: string;
  status: string;
  created_at: string;
}

// 举报列表：默认只返回待处理，status=all 返回全部
app.get("/admin/reports", async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const all = c.req.query("status") === "all";

  const { results } = await db
    .prepare(
      `SELECT id, target_type, target_id, post_id, reporter_id, reporter_name, reason, detail, status, created_at
       FROM forum_reports ${all ? "" : "WHERE status = 'pending'"} ORDER BY id DESC LIMIT 100`,
    )
    .all<ReportRow>();

  const items: (ReportRow & { target: Record<string, unknown> | null })[] = [];
  for (const r of results ?? []) {
    let target: Record<string, unknown> | null = null;
    if (r.target_type === "post") {
      target = await db
        .prepare("SELECT id, title, substr(content, 1, 120) AS content, author_name FROM forum_posts WHERE id = ?")
        .bind(r.target_id)
        .first<Record<string, unknown>>();
    } else {
      target = await db
        .prepare(
          `SELECT r.id, substr(r.content, 1, 120) AS content, r.author_name, r.post_id, p.title AS post_title
           FROM forum_replies r LEFT JOIN forum_posts p ON p.id = r.post_id WHERE r.id = ?`,
        )
        .bind(r.target_id)
        .first<Record<string, unknown>>();
    }
    items.push({ ...r, target });
  }

  return ok(items);
});

// 处理举报：action=delete 删除内容并标记已处理；action=reject 仅驳回
app.post("/admin/reports/:id", async (c) => {
  const admin = c.get("user")!;
  const db = fdb(c);
  await ensureForumSchema(db);
  const id = Number(c.req.param("id")) || 0;
  const body = await c.req.json().catch(() => ({}));
  const action = body.action === "delete" ? "delete" : "reject";

  const report = await db
    .prepare("SELECT * FROM forum_reports WHERE id = ?")
    .bind(id)
    .first<ReportRow>();
  if (!report) return fail("举报不存在", 404);
  if (report.status !== "pending") return fail("该举报已处理");

  if (action === "delete") {
    if (report.target_type === "post") {
      await db.batch([
        db.prepare("DELETE FROM forum_replies WHERE post_id = ?").bind(report.target_id),
        db.prepare("DELETE FROM forum_likes WHERE post_id = ?").bind(report.target_id),
        db.prepare("DELETE FROM forum_notifications WHERE post_id = ?").bind(report.target_id),
        db.prepare("DELETE FROM forum_posts WHERE id = ?").bind(report.target_id),
      ]);
      await db
        .prepare("UPDATE forum_reports SET status = 'resolved' WHERE target_type = 'post' AND target_id = ?")
        .bind(report.target_id)
        .run();
    } else {
      await db.batch([
        db.prepare("DELETE FROM forum_replies WHERE parent_id = ?").bind(report.target_id),
        db.prepare("DELETE FROM forum_replies WHERE id = ?").bind(report.target_id),
        db.prepare("DELETE FROM forum_notifications WHERE reply_id = ?").bind(report.target_id),
      ]);
      await db
        .prepare("UPDATE forum_reports SET status = 'resolved' WHERE target_type = 'reply' AND target_id = ?")
        .bind(report.target_id)
        .run();
    }
    await logOp(c.env.DB, c, admin.id, "forum_report_delete", `${report.target_type}#${report.target_id}`);
  } else {
    await db.prepare("UPDATE forum_reports SET status = 'rejected' WHERE id = ?").bind(id).run();
    await logOp(c.env.DB, c, admin.id, "forum_report_reject", `#${id}`);
  }

  return ok({ handled: true, action });
});

export default app;
