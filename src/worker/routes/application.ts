import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isValidPlayerName, str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

// —— 用户端 ——

app.use("/submit", requireAuth);

// 提交入服申请
app.post("/submit", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const mcName = str(body.mc_name, 16).trim();
  const type = ["java", "bedrock"].includes(body.type) ? body.type : "java";
  const intro = str(body.intro, 2000).trim();
  const channel = str(body.channel, 50).trim();

  if (!isValidPlayerName(mcName)) return fail("游戏名需 3-16 位（字母/数字/下划线）");
  if (!intro) return fail("请填写自我介绍");

  const existing = await c.env.DB.prepare(
    `SELECT id FROM whitelist_applications
     WHERE mc_name = ? COLLATE NOCASE AND status IN ('pending','approved')`,
  ).bind(mcName).first();
  if (existing) return fail("该游戏名已存在待审核或已通过的申请", 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO whitelist_applications (user_id, mc_name, type, intro, channel, ip, ua)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(user.id, mcName, type, intro, channel, getClientIp(c), getUa(c))
    .run();

  const id = Number(result.meta.last_row_id);
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'whitelist', ?, ?)",
  ).bind(user.id, "入服申请已提交", `申请 #${id} 正在审核中`).run();

  return ok({ id });
});

// 我的申请列表
app.get("/mine", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.mc_name, w.type, w.status, w.created_at, w.reviewed_at,
            w.review_note, u.username AS reviewer
     FROM whitelist_applications w LEFT JOIN users u ON u.id = w.reviewed_by
     WHERE w.user_id = ? ORDER BY w.id DESC LIMIT 20`,
  ).bind(user.id).all();
  return ok(results);
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/list", async (c) => {
  const status = c.req.query("status") || "pending";
  const allowed = ["pending", "approved", "rejected"];
  const cond = allowed.includes(status) ? `WHERE w.status = '${status}'` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.mc_name, w.type, w.intro, w.channel, w.status, w.created_at,
            w.review_note, w.ip, u.id AS user_id, u.username
     FROM whitelist_applications w JOIN users u ON u.id = w.user_id ${cond}
     ORDER BY w.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// 审核：approved / rejected
app.post("/admin/:id/review", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = body.status === "approved" ? "approved" : "rejected";
  const note = str(body.note, 1000).trim();

  const appRow = await c.env.DB.prepare(
    "SELECT user_id, mc_name FROM whitelist_applications WHERE id = ?",
  ).bind(id).first<{ user_id: number; mc_name: string }>();
  if (!appRow) return fail("申请不存在", 404);

  await c.env.DB.prepare(
    `UPDATE whitelist_applications SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(status, note, admin.id, id)
    .run();

  // 通知用户
  const title = status === "approved" ? "入服申请已通过" : "入服申请被拒绝";
  const content = status === "approved"
    ? `游戏名 ${appRow.mc_name} 已通过审核，欢迎加入西域之光！`
    : `游戏名 ${appRow.mc_name} 未通过审核${note ? `：${note}` : ""}`;
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'whitelist', ?, ?)",
  ).bind(appRow.user_id, title, content).run();

  await logOp(c.env.DB, c, admin.id, "whitelist_review", appRow.mc_name, status);
  return ok({ updated: true });
});

export default app;