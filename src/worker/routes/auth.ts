import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken, verifyToken } from "../lib/jwt";
import { ok, fail } from "../lib/http";
import { isEmail, isValidUsername, isValidPassword, str } from "../lib/validate";
import { getClientIp, getUa, uaFingerprint, genCsrfToken } from "../lib/net";
import { logUserAction } from "../lib/log";
import { getSecret } from "../lib/auth";

const app = new Hono<AppEnv>();

function authCookie(token: string, maxAge = 7 * 86400): string {
  return `auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

// 注册
app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = str(body.username, 20).trim();
  const email = str(body.email, 100).trim().toLowerCase();
  const password = str(body.password, 64);
  const fingerprint = await uaFingerprint(c);

  if (!isValidUsername(username)) return fail("用户名需 3-20 位（字母/数字/下划线/中文）");
  if (!isEmail(email)) return fail("邮箱格式不正确");
  if (!isValidPassword(password)) return fail("密码需 6-64 位");

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ?",
  )
    .bind(username, email)
    .first();
  if (existing) return fail("用户名或邮箱已被占用", 409);

  const passwordHash = await hashPassword(password);
  const csrf = genCsrfToken();

  const result = await c.env.DB.prepare(
    "INSERT INTO users (username, email, password_hash, ua_fingerprint, csrf_token, last_login_ip, last_login_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
  )
    .bind(username, email, passwordHash, fingerprint, csrf, getClientIp(c))
    .run();

  const userId = Number(result.meta.last_row_id);
  const token = await signToken({ sub: String(userId), username, role: "user" }, getSecret(c));

  await logUserAction(c.env.DB, userId, "register", "新用户注册", getClientIp(c), getUa(c));

  return ok({ id: userId, username, email, csrf }, 200, { "Set-Cookie": authCookie(token) });
});

// 登录
app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const account = str(body.account, 100).trim();
  const password = str(body.password, 64);

  if (!account || !password) return fail("请输入账号和密码");

  const user = await c.env.DB.prepare(
    "SELECT id, username, email, password_hash, csrf_token, role, status FROM users WHERE username = ? OR email = ?",
  )
    .bind(account, account)
    .first<{
      id: number;
      username: string;
      email: string;
      password_hash: string;
      csrf_token: string;
      role: string;
      status: string;
    }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return fail("账号或密码错误", 401);
  }
  if (user.status === "banned") return fail("该账号已被封禁", 403);

  const token = await signToken(
    { sub: String(user.id), username: user.username, role: user.role },
    getSecret(c),
  );

  await c.env.DB.prepare(
    "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now'), ua_fingerprint = ? WHERE id = ?",
  )
    .bind(getClientIp(c), await uaFingerprint(c), user.id)
    .run();
  await logUserAction(c.env.DB, user.id, "login", "登录成功", getClientIp(c), getUa(c));

  return ok(
    { id: user.id, username: user.username, email: user.email, csrf: user.csrf_token },
    200,
    { "Set-Cookie": authCookie(token) },
  );
});

// CSRF token（登录态下刷新）
app.get("/csrf", async (c) => {
  const token = c.req.header("cookie")?.match(/(?:^|;\s*)auth_token=([^;]+)/)?.[1];
  if (!token) return fail("未登录", 401);
  const payload = await verifyToken(decodeURIComponent(token), getSecret(c));
  if (!payload) return fail("登录已过期", 401);

  const row = await c.env.DB.prepare("SELECT csrf_token FROM users WHERE id = ?")
    .bind(Number(payload.sub))
    .first<{ csrf_token: string }>();
  const csrf = row?.csrf_token || genCsrfToken();

  return ok({ csrf });
});

// 找回密码：发送重置码（邮件未接入时返回码供调试/日志记录）
app.post("/forgot", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 100).trim().toLowerCase();
  if (!isEmail(email)) return fail("邮箱格式不正确");

  const user = await c.env.DB.prepare("SELECT id, username FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; username: string }>();
  if (!user) return ok({ sent: true }); // 不暴露账号是否存在

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expires = Date.now() + 30 * 60 * 1000;
  const resetToken = await signToken(
    { sub: String(user.id), username: user.username, role: "reset" },
    getSecret(c),
  );

  // 存储重置码到 site_settings（key=reset_code:{userId}），简单实现
  await c.env.DB.prepare(
    "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
  )
    .bind(`reset_code:${user.id}`, `${code}:${expires}:${resetToken}`)
    .run();

  await logUserAction(c.env.DB, user.id, "forgot_password", `重置码已生成: ${code}`, getClientIp(c), getUa(c));

  // TODO: 接入 SMTP 后通过邮件发送 code
  if (c.env.SMTP_ENABLED === "true") {
    // send email...
  }
  return ok({ sent: true, devCode: code });
});

// 重置密码（凭重置码）
app.post("/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 100).trim().toLowerCase();
  const code = str(body.code, 10).trim().toUpperCase();
  const newPassword = str(body.new_password, 64);
  if (!isValidPassword(newPassword)) return fail("密码需 6-64 位");

  const user = await c.env.DB.prepare("SELECT id, username FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; username: string }>();
  if (!user) return fail("重置码无效或已过期", 400);

  const row = await c.env.DB.prepare("SELECT value FROM site_settings WHERE key = ?")
    .bind(`reset_code:${user.id}`)
    .first<{ value: string }>();
  if (!row) return fail("重置码无效或已过期", 400);

  const [storedCode, expires, resetToken] = row.value.split(":");
  if (storedCode !== code || Number(expires) < Date.now()) {
    return fail("重置码无效或已过期", 400);
  }

  const payload = await verifyToken(resetToken, getSecret(c));
  if (!payload || payload.role !== "reset" || payload.sub !== String(user.id)) {
    return fail("重置码无效或已过期", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, user.id)
    .run();
  await c.env.DB.prepare("DELETE FROM site_settings WHERE key = ?")
    .bind(`reset_code:${user.id}`)
    .run();

  await logUserAction(c.env.DB, user.id, "reset_password", "密码已重置", getClientIp(c), getUa(c));
  return ok({ reset: true });
});

// 登出
app.post("/logout", async (c) => {
  return ok({ loggedOut: true }, 200, { "Set-Cookie": authCookie("", 0) });
});

export default app;