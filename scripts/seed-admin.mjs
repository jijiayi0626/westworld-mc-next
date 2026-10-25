#!/usr/bin/env node
// 生成管理员账号 SQL（不包含任何默认口令）
// 用法：
//   ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='至少8位的强密码' \
//     node scripts/seed-admin.mjs > seed-admin.sql
//   npx wrangler d1 execute mc-next --remote --file=seed-admin.sql
import { pbkdf2Sync, randomBytes } from "node:crypto";

const username = (process.env.ADMIN_USERNAME || "").trim();
const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!username || !email || !password) {
  console.error("缺少环境变量：ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD 至少 8 位");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("ADMIN_EMAIL 格式不正确");
  process.exit(1);
}

const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const passwordHash = `pbkdf2$${iterations}$${salt.toString("hex")}$${hash.toString("hex")}`;
const csrf = randomBytes(24).toString("hex");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

console.log(`-- 由 scripts/seed-admin.mjs 生成（请勿提交到仓库）`);
console.log(
  `INSERT INTO users (username, email, password_hash, role, status, csrf_token, created_at, updated_at)\n` +
    `VALUES (${q(username)}, ${q(email)}, ${q(passwordHash)}, 'admin', 'active', ${q(csrf)}, datetime('now'), datetime('now'))\n` +
    `ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', status = 'active', updated_at = datetime('now');`,
);
