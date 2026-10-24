import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, UserSession } from "../lib/auth";
import { requireAuth, requireAdmin, getSecret, readToken } from "../lib/auth";
import { verifyToken } from "../lib/jwt";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp, logUserAction } from "../lib/log";

const app = new Hono<AppEnv>();

/** 论坛数据统一存独立 D1（FORUM_DB）；未绑定时回退主库 */
function fdb(c: { env: AppEnv["Bindings"] }): D1Database {
  return c.env.FORUM_DB ?? c.env.DB;
}

interface ForumPost {
  id: number;
  board: string;
  title: string;
  content: string;
  author_id: number | null;
  author_name: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface ForumReply {
  id: number;
  post_id: number;
  author_id: number | null;
  author_name: string;
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
    ]);
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

// 公告列表（公开：无需登录；官网「论坛」页与用户中心共用）
app.get("/announcements", async (c) => {
  const { results } = await fdb(c)
    .prepare(
      "SELECT id, title, content, author_name, pinned, created_at, updated_at FROM forum_posts WHERE board = 'announcement' ORDER BY pinned DESC, id DESC LIMIT 100",
    )
    .all<ForumPost>();
  return ok(results ?? []);
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
      `SELECT p.id, p.board, p.title, substr(p.content, 1, 160) AS content, p.author_name, p.pinned,
              p.created_at, 0 AS views,
              COALESCE(r.n, 0) AS reply_count, COALESCE(l.n, 0) AS like_count
       FROM forum_posts p
       LEFT JOIN (SELECT post_id, COUNT(*) AS n FROM forum_replies GROUP BY post_id) r ON r.post_id = p.id
       LEFT JOIN (SELECT post_id, COUNT(*) AS n FROM forum_likes GROUP BY post_id) l ON l.post_id = p.id
       ${whereSql}
       ORDER BY p.pinned DESC, p.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all();

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM forum_posts p ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>();

  return ok({ items: results ?? [], total: totalRow?.n ?? 0, page });
});

// 帖子详情（公开）：完整正文 + 回复 + 当前用户点赞状态
app.get("/posts/:id", async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);

  const id = Number(c.req.param("id")) || 0;
  if (!id) return fail("帖子不存在", 404);

  const post = await db
    .prepare(
      `SELECT p.id, p.board, p.title, p.content, p.author_id, p.author_name, p.pinned,
              p.created_at, p.updated_at, 0 AS views,
              (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM forum_likes l WHERE l.post_id = p.id) AS like_count
       FROM forum_posts p WHERE p.id = ?`,
    )
    .bind(id)
    .first<ForumPost & { reply_count: number; like_count: number; views: number }>();
  if (!post) return fail("帖子不存在", 404);

  const { results: replies } = await db
    .prepare(
      "SELECT id, post_id, author_id, author_name, content, created_at FROM forum_replies WHERE post_id = ? ORDER BY id ASC LIMIT 200",
    )
    .bind(id)
    .all<ForumReply>();

  let liked = false;
  const user = await optionalUser(c);
  if (user) {
    const row = await db
      .prepare("SELECT 1 AS x FROM forum_likes WHERE post_id = ? AND user_id = ?")
      .bind(id, user.id)
      .first<{ x: number }>();
    liked = !!row;
  }

  return ok({ post, replies: replies ?? [], liked });
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

  if (!USER_BOARDS.includes(board)) return fail("请选择有效的分区");
  if (title.length < 5 || title.length > 120) return fail("标题需为 5-120 个字符");
  if (content.length < 5 || content.length > 10000) return fail("内容需为 5-10000 个字符");

  const last = await db
    .prepare("SELECT created_at FROM forum_posts WHERE author_id = ? ORDER BY id DESC LIMIT 1")
    .bind(user.id)
    .first<{ created_at: string }>();
  if (last && ageSeconds(last.created_at) < 30) {
    return fail("发帖太快了，请 30 秒后再试");
  }

  const result = await db
    .prepare(
      "INSERT INTO forum_posts (board, title, content, author_id, author_name, pinned) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .bind(board, title, content, user.id, user.username)
    .run();
  const id = Number(result.meta.last_row_id);

  await logUserAction(db, user.id, "forum_post", `#${id} ${title.slice(0, 50)}`);
  return ok({ id });
});

// 回帖
app.post("/posts/:id/reply", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const postId = Number(c.req.param("id")) || 0;

  const post = await db.prepare("SELECT id FROM forum_posts WHERE id = ?").bind(postId).first<{ id: number }>();
  if (!post) return fail("帖子不存在", 404);

  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 5000).trim();
  if (content.length < 2 || content.length > 5000) return fail("回复需为 2-5000 个字符");

  const last = await db
    .prepare("SELECT created_at FROM forum_replies WHERE author_id = ? ORDER BY id DESC LIMIT 1")
    .bind(user.id)
    .first<{ created_at: string }>();
  if (last && ageSeconds(last.created_at) < 10) {
    return fail("回复太快了，请 10 秒后再试");
  }

  const result = await db
    .prepare("INSERT INTO forum_replies (post_id, author_id, author_name, content) VALUES (?, ?, ?, ?)")
    .bind(postId, user.id, user.username, content)
    .run();

  const reply: ForumReply = {
    id: Number(result.meta.last_row_id),
    post_id: postId,
    author_id: user.id,
    author_name: user.username,
    content,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };
  await logUserAction(db, user.id, "forum_reply", `#${postId}`);
  return ok(reply);
});

// 点赞 / 取消点赞
app.post("/posts/:id/like", requireAuth, async (c) => {
  const db = fdb(c);
  await ensureForumSchema(db);
  const user = c.get("user")!;
  const postId = Number(c.req.param("id")) || 0;

  const post = await db.prepare("SELECT id FROM forum_posts WHERE id = ?").bind(postId).first<{ id: number }>();
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
    db.prepare("DELETE FROM forum_posts WHERE id = ?").bind(postId),
  ]);

  await logUserAction(db, user.id, "forum_post_delete", `#${postId}`);
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

  await db.prepare("DELETE FROM forum_replies WHERE id = ?").bind(replyId).run();
  await logUserAction(db, user.id, "forum_reply_delete", `#${reply.post_id}/${replyId}`);
  return ok({ deleted: true });
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

export default app;
