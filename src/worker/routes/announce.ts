import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// 已发布公告（公开）
app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, content, created_at FROM announcements WHERE status = 'published' ORDER BY id DESC LIMIT 20",
  ).all();
  return ok(results);
});

// 公告详情（公开）
app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "SELECT id, title, content, created_at FROM announcements WHERE id = ? AND status = 'published'",
  ).bind(id).first();
  if (!row) return fail("公告不存在", 404);
  return ok(row);
});

// —— 管理接口 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/list", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, title, status, created_at, published_at FROM announcements ORDER BY id DESC LIMIT 100",
  ).all();
  return ok(results);
});

// 公告详情（管理，含正文供编辑）
app.get("/admin/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    "SELECT id, title, content, status FROM announcements WHERE id = ?",
  ).bind(id).first();
  if (!row) return fail("公告不存在", 404);
  return ok(row);
});

app.post("/admin/create", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 100).trim();
  const content = str(body.content, 20000).trim();
  const status = body.status === "published" ? "published" : "draft";
  if (!title || !content) return fail("标题和内容不能为空");

  await c.env.DB.prepare(
    `INSERT INTO announcements (title, content, status, created_by, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, CASE WHEN ? = 'published' THEN datetime('now') ELSE NULL END, datetime('now'), datetime('now'))`,
  )
    .bind(title, content, status, c.get("user")!.id, status)
    .run();
  await logOp(c.env.DB, c, c.get("user")!.id, "announce_create", title);
  return ok({ created: true });
});

app.post("/admin/update", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  const title = str(body.title, 100).trim();
  const content = str(body.content, 20000).trim();
  const status = body.status === "published" ? "published" : body.status === "archived" ? "archived" : "draft";
  if (!id || !title || !content) return fail("参数不完整");

  await c.env.DB.prepare(
    `UPDATE announcements SET title = ?, content = ?, status = ?,
            published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN datetime('now') ELSE published_at END,
            updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(title, content, status, status, id)
    .run();
  await logOp(c.env.DB, c, c.get("user")!.id, "announce_update", title);
  return ok({ updated: true });
});

app.post("/admin/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  await c.env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "announce_delete", String(id));
  return ok({ deleted: true });
});

export default app;