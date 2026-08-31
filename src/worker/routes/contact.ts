import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isEmail, str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// 提交留言（公开，带简单频率限制存储）
app.post("/submit", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 50).trim();
  const email = str(body.email, 100).trim();
  const subject = str(body.subject, 100).trim();
  const message = str(body.message, 5000).trim();

  if (!name || !message) return fail("姓名和留言内容不能为空");
  if (email && !isEmail(email)) return fail("邮箱格式不正确");

  const ip = getClientIp(c);

  // 简单限频：同一 IP 1 分钟内最多 3 条
  const recent = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM contact_messages WHERE ip = ? AND created_at > datetime('now', '-1 minute')",
  )
    .bind(ip)
    .first<{ cnt: number }>();
  if (recent && Number(recent.cnt) >= 3) return fail("提交过于频繁，请稍后再试", 429);

  await c.env.DB.prepare(
    "INSERT INTO contact_messages (name, email, subject, message, ip, ua) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(name, email, subject, message, ip, getUa(c))
    .run();

  return ok({ submitted: true });
});

// —— 管理接口：留言列表 / 回复 / 删除 ——

app.use("/admin/*", requireAdmin);

app.get("/admin/list", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, name, email, subject, message, status, ip, created_at, reply FROM contact_messages ORDER BY id DESC LIMIT 100",
  ).all();
  return ok(results);
});

app.post("/admin/reply", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  const reply = str(body.reply, 5000).trim();
  if (!id || !reply) return fail("参数不完整");

  await c.env.DB.prepare(
    `UPDATE contact_messages SET reply = ?, status = 'replied', replied_at = datetime('now') WHERE id = ?`,
  )
    .bind(reply, id)
    .run();
  await logOp(c.env.DB, c, c.get("user")?.id ?? null, "contact_reply", String(id));
  return ok({ updated: true });
});

app.post("/admin/delete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  await c.env.DB.prepare("DELETE FROM contact_messages WHERE id = ?").bind(id).run();
  return ok({ deleted: true });
});

export default app;