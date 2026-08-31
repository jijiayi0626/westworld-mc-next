import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// —— 用户端 ——

app.use("/create", requireAuth);

// 创建工单
app.post("/create", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const subject = str(body.subject, 100).trim();
  const category = ["general", "apply", "bug", "payment"].includes(body.category) ? body.category : "general";
  const priority = ["low", "normal", "high"].includes(body.priority) ? body.priority : "normal";
  const content = str(body.content, 5000).trim();

  if (!subject || !content) return fail("标题和内容不能为空");

  const result = await c.env.DB.prepare(
    `INSERT INTO support_tickets (user_id, subject, category, priority)
     VALUES (?, ?, ?, ?)`,
  ).bind(user.id, subject, category, priority).run();

  const ticketId = Number(result.meta.last_row_id);
  if (!ticketId) return fail("工单创建失败", 500);

  await c.env.DB.prepare(
    "INSERT INTO support_ticket_replies (ticket_id, user_id, content, is_staff) VALUES (?, ?, ?, 0)",
  ).bind(ticketId, user.id, content).run();

  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'ticket', ?, ?)",
  ).bind(user.id, "工单已创建", `工单 #${ticketId} ${subject}`).run();

  return ok({ id: ticketId });
});

// 我的工单列表
app.get("/mine", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS reply_count
     FROM support_tickets t WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 50`,
  ).bind(user.id).all();
  return ok(results);
});

// 工单详情 + 回复列表（仅本人/管理员）
app.get("/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const ticket = await c.env.DB.prepare(
    "SELECT * FROM support_tickets WHERE id = ?",
  ).bind(id).first<{ id: number; user_id: number; status: string }>();
  if (!ticket) return fail("工单不存在", 404);
  if (ticket.user_id !== user.id && user.role !== "admin") return fail("无权限", 403);

  const { results: replies } = await c.env.DB.prepare(
    "SELECT id, user_id, content, is_staff, created_at FROM support_ticket_replies WHERE ticket_id = ? ORDER BY id ASC",
  ).bind(id).all();
  return ok({ ticket, replies });
});

// 回复工单（本人/管理员）
app.post("/:id/reply", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 5000).trim();
  if (!content) return fail("回复内容不能为空");

  const ticket = await c.env.DB.prepare(
    "SELECT user_id, status FROM support_tickets WHERE id = ?",
  ).bind(id).first<{ user_id: number; status: string }>();
  if (!ticket) return fail("工单不存在", 404);
  if (ticket.user_id !== user.id && user.role !== "admin") return fail("无权限", 403);
  if (ticket.status === "closed") return fail("工单已关闭", 400);

  const isStaff = user.role === "admin" ? 1 : 0;
  await c.env.DB.prepare(
    "INSERT INTO support_ticket_replies (ticket_id, user_id, content, is_staff) VALUES (?, ?, ?, ?)",
  ).bind(id, user.id, content, isStaff).run();
  await c.env.DB.prepare(
    "UPDATE support_tickets SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
  ).bind(id).run();

  return ok({ replied: true });
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/list", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.created_at, u.username,
            (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id = t.id) AS reply_count
     FROM support_tickets t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// 关闭/重新打开工单
app.post("/admin/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = ["open", "pending", "closed"].includes(body.status) ? body.status : "closed";
  await c.env.DB.prepare(
    "UPDATE support_tickets SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?",
  ).bind(status, status, id).run();
  await logOp(c.env.DB, c, c.get("user")!.id, "ticket_status", String(id), status);
  return ok({ updated: true });
});

export default app;