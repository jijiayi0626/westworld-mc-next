-- ---------- 论坛独立库（westworld-forum）----------
-- 公告帖（后台「公告管理」发布内容同步/发布到此板块；主库 announcements 保留作通知来源）
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL DEFAULT 'announcement',   -- announcement / chat ...
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  author_id INTEGER,
  author_name TEXT DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,            -- 0/1 置顶
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_forum_posts_board ON forum_posts(board, pinned, id);

-- 帖子回复（与 ensureForumSchema 保持一致）
CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_id INTEGER,
  author_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id, id);

-- 帖子点赞（post_id + user_id 联合主键防重复）
CREATE TABLE IF NOT EXISTS forum_likes (
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

-- 聊天室消息（自主库 chat_messages 迁移；图片仍存 R2 uploads/chat/，此处仅存 key）
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL DEFAULT '',
  image_key TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_id ON chat_messages(id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);
