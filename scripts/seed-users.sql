-- ============================================================
-- Westworld西域之光 - 测试账号种子数据
-- 应用：wrangler d1 execute mc-next --remote --file=scripts/seed-users.sql
-- 账号：
--   管理员 admin     / Admin@2026
--   普通用户 testuser / Test@2026
-- ============================================================

INSERT OR IGNORE INTO users (username, email, password_hash, role, status, csrf_token, created_at, updated_at) VALUES
('admin', 'admin@westworld.local', 'pbkdf2$100000$f610290eef04e375f7d600d99eb4de78$4b3999d3b9c8d837118f781902409f53e401ca6fc12fa1575863a7885f24e1d0', 'admin', 'active', 'a3691be43d9c47279f7762a65c546119', datetime('now'), datetime('now')),
('testuser', 'test@westworld.local', 'pbkdf2$100000$697776ba20096a66683a74d92ee50655$ea2d2eea806a817d67ac23c87af88552dfa9449962778ef0864eb44c0bbc2a03', 'user', 'active', '0807e651721b40429c5c864eea915691', datetime('now'), datetime('now'));
