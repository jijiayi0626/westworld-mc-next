-- ============================================================
-- 迁移：商城库存与自动发货（2026-10-25）
-- 应用（远程）：npx wrangler d1 execute mc-next --remote --file scripts/migrate-shop-delivery.sql
-- 应用（本地）：npx wrangler d1 execute mc-next --local  --file scripts/migrate-shop-delivery.sql
-- 说明：SQLite 不支持 ADD COLUMN IF NOT EXISTS；报 duplicate column 表示已存在，可忽略。
-- ============================================================
ALTER TABLE shop_products ADD COLUMN stock INTEGER NOT NULL DEFAULT -1;
ALTER TABLE shop_products ADD COLUMN delivery_cmd TEXT DEFAULT '';

ALTER TABLE shop_orders ADD COLUMN mc_name TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN delivery_cmd TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN delivery_status TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN delivery_log TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN next_retry_at TEXT;
