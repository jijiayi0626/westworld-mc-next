-- ============================================================
-- 迁移：用户管理增强（2026-10-17）
-- 为 users 表补充注册 IP 与最后登录浏览器 UA 字段
-- 应用（远程）：npx wrangler d1 execute mc-next --remote --file scripts/migrate-users-login-info.sql
-- 应用（本地）：npx wrangler d1 execute mc-next --local  --file scripts/migrate-users-login-info.sql
-- 说明：SQLite 不支持 ADD COLUMN IF NOT EXISTS；
--       若报「duplicate column name」表示列已存在，可忽略该错误。
-- ============================================================

ALTER TABLE users ADD COLUMN register_ip TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN last_login_ua TEXT DEFAULT '';
