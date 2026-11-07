-- ---------- 社区独立库（westworld-forum）----------
-- 公告帖（后台「公告管理」发布内容同步/发布到此板块；主库 announcements 保留作通知来源）
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL DEFAULT 'announcement',   -- announcement / general / qa / share / guide
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  author_id INTEGER,
  author_name TEXT DEFAULT '',
  ip_region TEXT DEFAULT '',                    -- IP 属地（仅省 / 州一级）
  pinned INTEGER NOT NULL DEFAULT 0,            -- 0/1 置顶
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_forum_posts_board ON forum_posts(board, pinned, id);

-- 帖子回复
CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_id INTEGER,
  author_name TEXT DEFAULT '',
  ip_region TEXT DEFAULT '',                    -- IP 属地（仅省 / 州一级）
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

-- 会话：社区群（固定 id=1）/ 群聊 / 私信
CREATE TABLE IF NOT EXISTS chat_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'group',           -- community / group / dm
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT DEFAULT '',
  notice TEXT DEFAULT '',
  owner_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_kind ON chat_rooms(kind, id);

-- 会话成员：备注、角色、已读位置
CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  alias TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',           -- owner / admin / member
  last_read_id INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_room_members(user_id, room_id);

-- 好友 / 备注（owner 视角）
CREATE TABLE IF NOT EXISTS user_contacts (
  owner_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  alias TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(owner_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_user_contacts_owner ON user_contacts(owner_id, created_at);

-- 会话消息（图片存 R2 uploads/chat/，此处仅存 key；撤回保留占位）
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL DEFAULT '',
  image_key TEXT DEFAULT '',
  recalled INTEGER NOT NULL DEFAULT 0,
  recalled_at TEXT DEFAULT '',
  recalled_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at);

-- 社区群固定存在
INSERT OR IGNORE INTO chat_rooms (id, kind, name, avatar, notice, owner_id)
VALUES (1, 'community', '社区群', '', '欢迎来到西域社区，文明交流，禁止刷屏与广告。', NULL);
