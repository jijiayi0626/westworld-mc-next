-- ============================================================
-- Westworld西域之光 - D1 Database Schema
-- 应用：wrangler d1 migrations apply mc-next --local
-- ============================================================

-- ---------- 第 2 期：用户系统 ----------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',           -- user / admin
  status TEXT NOT NULL DEFAULT 'active',       -- active / banned / pending
  avatar TEXT,
  bio TEXT DEFAULT '',
  ua_fingerprint TEXT DEFAULT '',
  csrf_token TEXT DEFAULT '',
  last_login_ip TEXT DEFAULT '',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  ip TEXT DEFAULT '',
  ua TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_logs_user ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_created ON user_logs(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'info',                    -- info / system / ticket / whitelist / shop
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ---------- 第 3 期：内容系统 + 公告 + 留言 ----------
CREATE TABLE IF NOT EXISTS site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,                          -- hero / help / footer / contact ...
  field TEXT NOT NULL,                         -- title / subtitle / desc ...
  value TEXT DEFAULT '',
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(page, field)
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',        -- draft / published / archived
  created_by INTEGER,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  message TEXT NOT NULL,
  ip TEXT DEFAULT '',
  ua TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',          -- new / replied / closed
  reply TEXT DEFAULT '',
  replied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 第 4 期：工单 + 入服申请 + AI ----------
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'general',             -- general / apply / bug / payment
  priority TEXT DEFAULT 'normal',              -- low / normal / high
  status TEXT NOT NULL DEFAULT 'open',         -- open / pending / closed
  ai_summary TEXT DEFAULT '',
  closed_by INTEGER,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_replies ON support_ticket_replies(ticket_id);

CREATE TABLE IF NOT EXISTS whitelist_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mc_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'java',           -- java / bedrock
  intro TEXT NOT NULL,
  channel TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  ua TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',      -- pending / approved / rejected
  review_note TEXT DEFAULT '',
  sync_status TEXT DEFAULT '',                 -- off / synced / failed / skipped
  sync_log TEXT DEFAULT '',
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_applications_user ON whitelist_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON whitelist_applications(status);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '新对话',
  status TEXT NOT NULL DEFAULT 'active',       -- active / deleted
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);

CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,                          -- user / assistant
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_conversation_messages(conversation_id);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,                          -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);

-- ---------- 第 5 期：商城 + 支付 + 交付 ----------
CREATE TABLE IF NOT EXISTS shop_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  category TEXT DEFAULT 'general',             -- vip / item / whitelist ...
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,           -- 0/1
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'pending',      -- pending / paid / completed / cancelled / refunded
  provider TEXT DEFAULT '',                    -- manual / creem / stripe
  payment_id TEXT DEFAULT '',
  delivery TEXT DEFAULT '',
  paid_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON shop_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON shop_orders(order_no);

-- ---------- 第 5 期：服务器监控 + RCON ----------
CREATE TABLE IF NOT EXISTS game_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 25565,
  password TEXT DEFAULT '',                    -- RCON 密码
  game TEXT DEFAULT 'minecraft',
  status TEXT NOT NULL DEFAULT 'offline',      -- online / offline
  version TEXT DEFAULT '',
  players_online INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  last_check TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO game_servers (id, server_name, host, port, game, status)
  SELECT 1, '西域之光主服', 'sdcmc.chipzz.top', 23400, 'minecraft', 'online'
  WHERE NOT EXISTS (SELECT 1 FROM game_servers WHERE id = 1);

-- ---------- 安全：IP 黑名单 + 操作日志 ----------
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS op_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id INTEGER,
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_op_logs_created ON op_logs(created_at);

-- ---------- 微软账号绑定 ----------
CREATE TABLE IF NOT EXISTS microsoft_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  ms_account_id TEXT NOT NULL,                 -- Microsoft account id (sub)
  ms_username TEXT NOT NULL,
  mc_uuid TEXT NOT NULL,
  mc_username TEXT NOT NULL,
  access_token TEXT DEFAULT '',
  refresh_token TEXT DEFAULT '',
  expires_at TEXT,
  bound_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ms_bindings_uuid ON microsoft_bindings(mc_uuid);
CREATE INDEX IF NOT EXISTS idx_ms_bindings_ms ON microsoft_bindings(ms_account_id);