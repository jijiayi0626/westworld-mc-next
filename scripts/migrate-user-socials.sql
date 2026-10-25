-- ============================================================
-- 迁移：用户社交信息（2026-10-25）
-- 为 users 表补充 QQ / Discord 绑定字段（仅保存 ID，不做 OAuth）
-- 应用（远程）：npx wrangler d1 execute mc-next --remote --file scripts/migrate-user-socials.sql
-- 应用（本地）：npx wrangler d1 execute mc-next --local  --file scripts/migrate-user-socials.sql
-- 说明：SQLite 不支持 ADD COLUMN IF NOT EXISTS；报 duplicate column 表示已存在，可忽略。
-- ============================================================
ALTER TABLE users ADD COLUMN qq TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN discord TEXT DEFAULT '';
