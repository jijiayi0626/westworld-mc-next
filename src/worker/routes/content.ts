import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// 获取整站内容 JSON（公开；无自定义时返回 null，前端用默认值）
app.get("/site", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT value FROM site_settings WHERE key = 'site_content'",
  ).first<{ value: string }>();
  if (!row) return ok(null);
  try {
    return ok(JSON.parse(row.value));
  } catch {
    return fail("站点内容格式损坏", 500);
  }
});

// 获取全部站点内容（公开）
app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT page, field, value FROM site_content").all();
  return ok(results);
});

// 获取指定页面内容（公开）
app.get("/:page", async (c) => {
  const page = c.req.param("page");
  const { results } = await c.env.DB.prepare(
    "SELECT field, value FROM site_content WHERE page = ?",
  ).bind(page).all();
  return ok(results);
});

// —— 以下为管理接口 ——

app.use("/admin/*", requireAuth, requireAdmin);

// 保存整站内容 JSON（覆盖式）
app.post("/admin/site", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const content = body.content;
  if (!content || typeof content !== "object") {
    return fail("content 必须为对象");
  }
  const raw = JSON.stringify(content);
  if (raw.length > 200000) return fail("内容过大");
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('site_content', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(raw)
    .run();
  await logOp(c.env.DB, c, c.get("user")!.id, "content_update", "site_content");
  return ok({ updated: true });
});

// 新增/更新内容
app.post("/admin/set", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const page = str(body.page, 50);
  const field = str(body.field, 50);
  const value = str(body.value, 50000);
  if (!page || !field) return fail("page/field 不能为空");

  await c.env.DB.prepare(
    `INSERT INTO site_content (page, field, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(page, field) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
  )
    .bind(page, field, value, c.get("user")!.id)
    .run();

  await logOp(c.env.DB, c, c.get("user")!.id, "content_update", `${page}.${field}`);
  return ok({ updated: true });
});

// 删除内容
app.post("/admin/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const page = str(body.page, 50);
  const field = str(body.field, 50);
  await c.env.DB.prepare("DELETE FROM site_content WHERE page = ? AND field = ?")
    .bind(page, field)
    .run();
  await logOp(c.env.DB, c, c.get("user")!.id, "content_delete", `${page}.${field}`);
  return ok({ deleted: true });
});

export default app;