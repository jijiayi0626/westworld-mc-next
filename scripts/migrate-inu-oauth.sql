-- ============================================================
-- 迁移：INU OAuth 登录（2026-10-31）
-- 新增 inu_accounts 表，用于 sub 映射、资料展示与退出撤销 token
-- 应用（远程）：npx wrangler d1 execute mc-next --remote --file scripts/migrate-inu-oauth.sql
-- 应用（本地）：npx wrangler d1 execute mc-next --local  --file scripts/migrate-inu-oauth.sql
-- 说明：CREATE TABLE IF NOT EXISTS 可重复执行。
-- ============================================================
CREATE TABLE IF NOT EXISTS inu_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  inu_sub TEXT NOT NULL UNIQUE,
  inu_id TEXT DEFAULT '',
  name TEXT DEFAULT '',
  preferred_username TEXT DEFAULT '',
  orbit TEXT DEFAULT '',
  avatar_text TEXT DEFAULT '',
  tier TEXT DEFAULT '',
  tier_label TEXT DEFAULT '',
  email TEXT DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  access_token_enc TEXT DEFAULT '',
  token_expires_at INTEGER,
  bound_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
