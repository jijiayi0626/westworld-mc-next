-- ============================================================
-- 迁移：服务器 MOTD 巡检字段（2026-10-17）
-- 应用（远程）：npx wrangler d1 execute mc-next --remote --file scripts/migrate-game-servers-motd.sql
-- 说明：若报「duplicate column name」表示列已存在，可忽略。
-- ============================================================

ALTER TABLE game_servers ADD COLUMN motd TEXT DEFAULT '';
