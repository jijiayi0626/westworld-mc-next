import type { AppEnv } from "./auth";

/**
 * 在线状态（轻量实现，免费套餐无 Durable Objects）：
 * - 前端每 25 秒心跳一次，写入 user_presence.last_seen（UNIX 秒）
 * - 90 秒内有心跳且状态不是「隐身」即视为在线
 * - 状态：online 在线 / away 离开 / busy 忙碌 / invisible 隐身
 */

export type PresenceStatus = "online" | "away" | "busy" | "invisible";

export interface PresenceInfo {
  status: PresenceStatus;
  text: string;
  online: boolean;
  last_seen: number;
}

export const PRESENCE_STATUSES: PresenceStatus[] = ["online", "away", "busy", "invisible"];

const ONLINE_WINDOW_MS = 90_000;

let ready = false;

/** 在线状态与聊天数据同库，避免跨库查询 */
export function presenceDb(env: AppEnv["Bindings"]): D1Database {
  return env.FORUM_DB ?? env.DB;
}

export function normalizePresenceStatus(value: unknown): PresenceStatus {
  return PRESENCE_STATUSES.includes(value as PresenceStatus)
    ? (value as PresenceStatus)
    : "online";
}

export async function ensurePresenceSchema(db: D1Database): Promise<void> {
  if (ready) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS user_presence (
          user_id INTEGER PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'online',
          text TEXT DEFAULT '',
          last_seen INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      )
      .run();
    ready = true;
  } catch {
    /* 建表失败不阻断主流程，下次请求再试 */
  }
}

function shape(row: { status: string; text: string | null; last_seen: number } | null): PresenceInfo {
  const now = Date.now();
  const lastSeen = Number(row?.last_seen) || 0;
  const status = normalizePresenceStatus(row?.status);
  return {
    status,
    text: row?.text || "",
    online: lastSeen > 0 && now - lastSeen * 1000 < ONLINE_WINDOW_MS && status !== "invisible",
    last_seen: lastSeen,
  };
}

/** 只更新心跳，保留用户设置的状态 */
export async function heartbeatPresence(db: D1Database, userId: number): Promise<PresenceInfo> {
  await ensurePresenceSchema(db);
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO user_presence (user_id, status, text, last_seen) VALUES (?, 'online', '', ?)
       ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen`,
    )
    .bind(userId, now)
    .run();
  return getPresence(db, userId);
}

/** 设置状态 + 文案，同时刷新心跳 */
export async function setPresence(
  db: D1Database,
  userId: number,
  status: PresenceStatus,
  text: string,
): Promise<PresenceInfo> {
  await ensurePresenceSchema(db);
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO user_presence (user_id, status, text, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         status = excluded.status,
         text = excluded.text,
         last_seen = excluded.last_seen,
         updated_at = datetime('now')`,
    )
    .bind(userId, status, text, now)
    .run();
  return shape({ status, text, last_seen: now });
}

export async function getPresence(db: D1Database, userId: number): Promise<PresenceInfo> {
  await ensurePresenceSchema(db);
  try {
    const row = await db
      .prepare("SELECT status, text, last_seen FROM user_presence WHERE user_id = ?")
      .bind(userId)
      .first<{ status: string; text: string | null; last_seen: number }>();
    return shape(row ?? null);
  } catch {
    return shape(null);
  }
}

/** 批量读取在线状态，用于好友 / 群成员 / 搜索结果 */
export async function presenceMap(
  db: D1Database,
  ids: (number | null | undefined)[],
): Promise<Map<number, PresenceInfo>> {
  const clean = [...new Set(ids.filter((v): v is number => Number.isInteger(v) && (v as number) > 0))];
  const map = new Map<number, PresenceInfo>();
  if (!clean.length) return map;
  await ensurePresenceSchema(db);
  for (let i = 0; i < clean.length; i += 80) {
    const chunk = clean.slice(i, i + 80);
    try {
      const { results } = await db
        .prepare(
          `SELECT user_id, status, text, last_seen FROM user_presence
           WHERE user_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(...chunk)
        .all<{ user_id: number; status: string; text: string | null; last_seen: number }>();
      for (const row of results ?? []) map.set(row.user_id, shape(row));
    } catch {
      /* 状态读取失败时按离线处理 */
    }
  }
  return map;
}
