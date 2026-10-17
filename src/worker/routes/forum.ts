import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

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

// 公告列表（公开：无需登录；官网「论坛」页与用户中心共用）
app.get("/announcements", async (c) => {
  const { results } = await fdb(c)
    .prepare(
      "SELECT id, title, content, author_name, pinned, created_at, updated_at FROM forum_posts WHERE board = 'announcement' ORDER BY pinned DESC, id DESC LIMIT 100",
    )
    .all<ForumPost>();
  return ok(results ?? []);
});

// —— 管理端 ——
app.use("/admin/*", requireAuth, requireAdmin);

app.post("/announcements", async (c) => {
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

app.put("/announcements/:id", async (c) => {
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

app.delete("/announcements/:id", async (c) => {
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
