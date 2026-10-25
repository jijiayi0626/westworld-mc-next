import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken, verifyToken } from "../lib/jwt";
import { ok, fail } from "../lib/http";
import { isEmail, isValidUsername, isValidPassword, str } from "../lib/validate";
import { getClientIp, getUa, uaFingerprint, genCsrfToken, genCode } from "../lib/net";
import { rateLimit, isBlacklisted } from "../lib/ratelimit";
import { logUserAction } from "../lib/log";
import { getSecret } from "../lib/auth";
import { loadMailConfig, mailEnabled, sendMail, renderEmail } from "../lib/mail";

const app = new Hono<AppEnv>();

function authCookie(token: string, maxAge = 7 * 86400): string {
  return `auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
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

  const ip = getClientIp(c);
  if (await isBlacklisted(c.env.DB, ip)) return fail("请求被拒绝", 403);
  if (!(await rateLimit(c.env.DB, `reg:${ip}`, 5, 3600))) {
    return fail("注册过于频繁，请一小时后再试", 429);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ?",
  )
    .bind(username, email)
    .first();
  if (existing) return fail("用户名或邮箱已被占用", 409);

  const passwordHash = await hashPassword(password);
  const csrf = genCsrfToken();

  const result = await c.env.DB.prepare(
    "INSERT INTO users (username, email, password_hash, ua_fingerprint, csrf_token, register_ip, last_login_ip, last_login_ua, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
  )
    .bind(username, email, passwordHash, fingerprint, csrf, getClientIp(c), getClientIp(c), getUa(c))
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

  const ip = getClientIp(c);
  if (await isBlacklisted(c.env.DB, ip)) return fail("请求被拒绝", 403);
  if (!(await rateLimit(c.env.DB, `login:${ip}`, 10, 300))) {
    return fail("尝试次数过多，请 5 分钟后再试", 429);
  }

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
    "UPDATE users SET last_login_ip = ?, last_login_at = datetime('now'), last_login_ua = ?, ua_fingerprint = ? WHERE id = ?",
  )
    .bind(getClientIp(c), getUa(c), await uaFingerprint(c), user.id)
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

// 找回密码：生成重置码（永不通过 HTTP 返回明文验证码，防接管；仅写入后台日志）
app.post("/forgot", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 100).trim().toLowerCase();
  if (!isEmail(email)) return fail("邮箱格式不正确");

  // 限流：同一邮箱 10 分钟内最多 3 次
  if (!(await rateLimit(c.env.DB, `forgot:${email}`, 3, 600))) {
    return fail("请求过于频繁，请稍后再试", 429);
  }

  const user = await c.env.DB.prepare("SELECT id, username FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; username: string }>();
  if (!user) return ok({ sent: true }); // 不暴露账号是否存在

  const code = genCode(6);
  const expires = Date.now() + 30 * 60 * 1000;
  const resetToken = await signToken(
    { sub: String(user.id), username: user.username, role: "reset" },
    getSecret(c),
  );

  await c.env.DB.prepare(
    "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
  )
    .bind(`reset_code:${user.id}`, `${code}:${expires}:${resetToken}`)
    .run();

  // 重置码仅记录到后台日志（用户/管理员可见），不再返回给前端，防止账号接管
  await logUserAction(c.env.DB, user.id, "forgot_password", `重置码已生成: ${code}`, getClientIp(c), getUa(c));

  // 邮件服务已配置时同步投递验证码邮件；失败仅记录，不影响日志兜底流程
  try {
    const cfg = await loadMailConfig(c.env.DB);
    if (mailEnabled(cfg)) {
      await sendMail(cfg, {
        to: email,
        subject: `【${c.env.APP_NAME || "Westworld西域之光"}】密码重置验证码`,
        html: renderEmail(
          "密码重置验证码",
          `<p>您好，<b>${user.username}</b>：</p><p>您正在重置账号密码，验证码为：</p>` +
            `<p style="font-size:28px;font-weight:800;letter-spacing:6px;color:#059669;margin:18px 0;">${code}</p>` +
            `<p>验证码 30 分钟内有效。如非本人操作，请忽略本邮件并建议尽快修改密码。</p>`,
        ),
      });
      await logUserAction(c.env.DB, user.id, "forgot_password", "重置码已通过邮件投递", getClientIp(c), getUa(c));
    }
  } catch (e) {
    console.log("[mail] forgot 投递失败:", e instanceof Error ? e.message : e);
  }

  return ok({ sent: true });
});

// 重置密码（凭重置码）
app.post("/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = str(body.email, 100).trim().toLowerCase();
  const code = str(body.code, 10).trim().toUpperCase();
  const newPassword = str(body.new_password, 64);
  if (!isValidPassword(newPassword)) return fail("密码需 6-64 位");

  // 防暴力破解：同一 IP 30 次/10 分钟，同一邮箱 10 次/10 分钟
  const ip = getClientIp(c);
  if (
    !(await rateLimit(c.env.DB, `reset-ip:${ip}`, 30, 600)) ||
    !(await rateLimit(c.env.DB, `reset:${email}`, 10, 600))
  ) {
    return fail("尝试次数过多，请稍后再试", 429);
  }
  if (!/^\d{6}$/.test(code)) return fail("重置码无效或已过期", 400);

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