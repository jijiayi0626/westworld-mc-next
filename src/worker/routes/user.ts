import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth } from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { ok, fail } from "../lib/http";
import { isValidPassword, isValidPlayerName, str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logUserAction } from "../lib/log";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// 我的信息
app.get("/me", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, u.status, u.avatar, u.bio, u.qq, u.discord,
            u.created_at, u.last_login_at, u.last_login_ip,
            COALESCE(
              NULLIF(u.mc_username, ''),
              (SELECT b.mc_username FROM microsoft_bindings b WHERE b.user_id = u.id),
              (SELECT w.mc_name FROM whitelist_applications w
               WHERE w.user_id = u.id AND w.status = 'approved' ORDER BY w.id DESC LIMIT 1)
            ) AS mc_username,
            (SELECT mc_uuid FROM microsoft_bindings WHERE user_id = u.id) AS mc_uuid
     FROM users u WHERE u.id = ?`,
  )
    .bind(user.id)
    .first();
  if (!row) return fail("用户不存在", 404);
  return ok(row);
});

// 修改资料（bio/avatar/qq/discord/mc_username）
app.post("/profile", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const bio = str(body.bio, 200);
  const avatar = str(body.avatar, 500);
  const qq = str(body.qq, 20).replace(/[^\d]/g, "");
  const discord = str(body.discord, 50).replace(/[^\w.#-]/g, "");
  const mcUsername = str(body.mc_username, 32).trim();

  if (mcUsername && !isValidPlayerName(mcUsername)) {
    return fail("游戏名需 3-16 位（字母/数字/下划线）");
  }
  if (mcUsername) {
    const used = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id <> ? AND mc_username = ? COLLATE NOCASE",
    )
      .bind(user.id, mcUsername)
      .first();
    if (used) return fail("该游戏名已绑定其他账号", 409);
    const applied = await c.env.DB.prepare(
      `SELECT id FROM whitelist_applications
       WHERE user_id <> ? AND mc_name = ? COLLATE NOCASE AND status IN ('pending','approved')`,
    )
      .bind(user.id, mcUsername)
      .first();
    if (applied) return fail("该游戏名已被其他账号申请或通过审核", 409);
  }

  await c.env.DB.prepare(
    "UPDATE users SET bio = ?, avatar = ?, qq = ?, discord = ?, mc_username = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(bio, avatar, qq, discord, mcUsername, user.id)
    .run();
  if (mcUsername) {
    await logUserAction(c.env.DB, user.id, "bind_game_name", `绑定游戏名 ${mcUsername}`, getClientIp(c), getUa(c));
  }
  return ok({ updated: true });
});

// 修改密码（需旧密码）
app.post("/password", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const oldPassword = str(body.old_password, 64);
  const newPassword = str(body.new_password, 64);
  if (!isValidPassword(newPassword)) return fail("新密码需 8-64 位，且包含字母和数字");

  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(oldPassword, row.password_hash))) {
    return fail("原密码错误", 400);
  }
  const hash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(hash, user.id)
    .run();
  await logUserAction(c.env.DB, user.id, "change_password", "修改密码", getClientIp(c), getUa(c));
  return ok({ updated: true });
});

// 我的通知
app.get("/notifications", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    "SELECT id, type, title, content, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50",
  )
    .bind(user.id)
    .all();
  return ok(results);
});

// 标记通知已读
app.post("/notifications/read", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  if (id) {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")
      .bind(user.id)
      .run();
  }
  return ok({ updated: true });
});

// 我的操作日志
app.get("/logs", async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    "SELECT id, action, ip, ua, detail, created_at FROM user_logs WHERE user_id = ? ORDER BY id DESC LIMIT 50",
  )
    .bind(user.id)
    .all();
  return ok(results);
});

// 安全中心：查看绑定的微软账号
app.get("/bindings", async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare(
    "SELECT mc_username, mc_uuid, ms_username, bound_at FROM microsoft_bindings WHERE user_id = ?",
  )
    .bind(user.id)
    .first();
  return ok(row || null);
});

export default app;