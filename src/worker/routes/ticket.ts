import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";
import { queueAdminMail } from "../lib/notify";
import { escapeHtml } from "../lib/mail";

const app = new Hono<AppEnv>();

interface TicketAttachment {
  key: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

/** 校验并收敛客户端提交的附件列表（最多 5 个，仅允许 uploads/tickets/） */
function parseAttachments(raw: unknown): TicketAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 5)
    .map((item) => {
      const a = (item ?? {}) as Record<string, unknown>;
      const key = str(a.key, 300);
      const name = str(a.name, 120);
      const size = Number(a.size) || 0;
      const type = str(a.type, 100);
      if (!key.startsWith("uploads/tickets/")) return null;
      return {
        key,
        url: `/static/${key}`,
        name: name || key.split("/").pop() || "附件",
        size: Math.max(0, Math.min(size, 10 * 1024 * 1024)),
        type,
      };
    })
    .filter((x): x is TicketAttachment => !!x);
}

function replyView(r: {
  id: number;
  user_id: number;
  content: string;
  attachments: string | null;
  is_staff: number;
  created_at: string;
}) {
  let attachments: TicketAttachment[] = [];
  if (r.attachments) {
    try {
      const parsed = JSON.parse(r.attachments);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch {
      // 旧数据或损坏 JSON 时忽略
    }
  }
  return { ...r, attachments };
}

/** 写入回复；attachments 列未迁移时自动降级为纯文本插入 */
async function insertReply(
  db: D1Database,
  ticketId: number,
  userId: number,
  content: string,
  attachments: TicketAttachment[],
  isStaff: number,
): Promise<void> {
  try {
    await db.prepare(
      "INSERT INTO support_ticket_replies (ticket_id, user_id, content, attachments, is_staff) VALUES (?, ?, ?, ?, ?)",
    ).bind(ticketId, userId, content, attachments.length ? JSON.stringify(attachments) : "", isStaff).run();
  } catch {
    await db.prepare(
      "INSERT INTO support_ticket_replies (ticket_id, user_id, content, is_staff) VALUES (?, ?, ?, ?)",
    ).bind(ticketId, userId, content, isStaff).run();
  }
}

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
  const attachments = parseAttachments(body.attachments);

  if (!subject || (!content && attachments.length === 0)) return fail("标题和内容不能为空");

  const result = await c.env.DB.prepare(
    `INSERT INTO support_tickets (user_id, subject, category, priority)
     VALUES (?, ?, ?, ?)`,
  ).bind(user.id, subject, category, priority).run();

  const ticketId = Number(result.meta.last_row_id);
  if (!ticketId) return fail("工单创建失败", 500);

  await insertReply(c.env.DB, ticketId, user.id, content, attachments, 0);

  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'ticket', ?, ?)",
  ).bind(user.id, "工单已创建", `工单 #${ticketId} ${subject}`).run();

  queueAdminMail(
    c,
    "ticket",
    `新工单 #${ticketId}：${subject}`,
    `<p>用户：${escapeHtml(user.username)}</p>
     <p>分类：${escapeHtml(category)}，优先级：${escapeHtml(priority)}</p>
     <p>内容：</p><p>${escapeHtml(content.slice(0, 1000)).replace(/\n/g, "<br>") || "（仅附件）"}</p>
     <p>附件：${attachments.length} 个</p>`,
  );

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

  type ReplyRow = {
    id: number;
    user_id: number;
    content: string;
    attachments: string | null;
    is_staff: number;
    created_at: string;
  };
  let replies: ReplyRow[];
  try {
    const q = await c.env.DB.prepare(
      "SELECT id, user_id, content, attachments, is_staff, created_at FROM support_ticket_replies WHERE ticket_id = ? ORDER BY id ASC",
    ).bind(id).all<ReplyRow>();
    replies = q.results;
  } catch {
    // attachments 列未迁移时降级查询
    const q = await c.env.DB.prepare(
      "SELECT id, user_id, content, is_staff, created_at FROM support_ticket_replies WHERE ticket_id = ? ORDER BY id ASC",
    ).bind(id).all<Omit<ReplyRow, "attachments">>();
    replies = q.results.map((r) => ({ ...r, attachments: null }));
  }
  return ok({ ticket, replies: replies.map(replyView) });
});

// 回复工单（本人/管理员）
app.post("/:id/reply", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 5000).trim();
  const attachments = parseAttachments(body.attachments);
  if (!content && attachments.length === 0) return fail("回复内容不能为空");

  const ticket = await c.env.DB.prepare(
    "SELECT user_id, status FROM support_tickets WHERE id = ?",
  ).bind(id).first<{ user_id: number; status: string }>();
  if (!ticket) return fail("工单不存在", 404);
  if (ticket.user_id !== user.id && user.role !== "admin") return fail("无权限", 403);
  if (ticket.status === "closed") return fail("工单已关闭", 400);

  const isStaff = user.role === "admin" ? 1 : 0;
  await insertReply(c.env.DB, id, user.id, content, attachments, isStaff);
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