-- 个人中心支持手动绑定 Minecraft 游戏名
ALTER TABLE users ADD COLUMN mc_username TEXT DEFAULT '';
