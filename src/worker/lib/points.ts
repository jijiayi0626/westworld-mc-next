const DEFAULT_CONFIG = {
  enabled: true,
  signin_base: 5,
  signin_streak_bonus: 1,
  signin_streak_max: 5,
  post_points: 2,
  comment_points: 1,
  like_points: 1,
  post_daily_limit: 10,
  comment_daily_limit: 20,
  like_daily_limit: 20,
  exchange_enabled: false,
  points_per_currency: 100,
  min_exchange: 100,
};

export type PointsConfig = typeof DEFAULT_CONFIG;

export const POINTS_SETTING_KEY = "points_config";

let pointsSchemaReady = false;

export async function ensurePointsSchema(db: D1Database): Promise<void> {
  if (pointsSchemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS points_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        detail TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_points_logs_user ON points_logs(user_id, created_at)",
    ),
  ]);
  pointsSchemaReady = true;
}

export async function loadPointsConfig(db: D1Database): Promise<PointsConfig> {
  const row = await db
    .prepare("SELECT value FROM site_settings WHERE key = ?")
    .bind(POINTS_SETTING_KEY)
    .first<{ value: string }>();
  if (!row) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<PointsConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 写入积分流水并增加余额；调用方负责额度判断 */
export async function addPoints(
  db: D1Database,
  userId: number,
  amount: number,
  reason: string,
  detail = "",
): Promise<number> {
  const value = Math.floor(amount);
  if (!value) return 0;
  await ensurePointsSchema(db);
  await db.batch([
    db.prepare("UPDATE users SET points = points + ? WHERE id = ?").bind(value, userId),
    db
      .prepare("INSERT INTO points_logs (user_id, amount, reason, detail) VALUES (?, ?, ?, ?)")
      .bind(userId, value, reason, detail),
  ]);
  return value;
}

/** 按每日上限发放积分，返回实际到账数量 */
export async function awardWithCap(
  db: D1Database,
  userId: number,
  reason: string,
  amount: number,
  dailyLimit: number,
  detail = "",
): Promise<number> {
  if (!amount || amount <= 0) return 0;
  await ensurePointsSchema(db);
  let finalAmount = Math.floor(amount);
  if (dailyLimit > 0) {
    const row = await db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS n FROM points_logs
         WHERE user_id = ? AND reason = ? AND date(created_at) = date('now')`,
      )
      .bind(userId, reason)
      .first<{ n: number }>();
    const used = row?.n ?? 0;
    if (used >= dailyLimit) return 0;
    finalAmount = Math.min(finalAmount, dailyLimit - used);
  }
  if (finalAmount <= 0) return 0;
  return addPoints(db, userId, finalAmount, reason, detail);
}
