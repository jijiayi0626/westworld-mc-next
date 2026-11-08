import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAdmin, requireAuth } from "../lib/auth";
import { fail, ok } from "../lib/http";
import { logOp } from "../lib/log";
import {
  POINTS_SETTING_KEY,
  ensurePointsSchema,
  loadPointsConfig,
  type PointsConfig,
} from "../lib/points";
import { rateLimit } from "../lib/ratelimit";
import { runRconCommand, resolveRconTarget } from "./rcon";
import { fillTemplate, loadEconomyConfig, resolveMcName } from "./shop";

const app = new Hono<AppEnv>();

const clampInt = (value: unknown, min: number, max: number): number => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

function todayCN(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

function yesterdayCN(): string {
  return new Date(Date.now() + 8 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
}

/** 积分中心：余额、规则、流水、签到状态与兑换信息 */
app.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  await ensurePointsSchema(c.env.DB);
  const checkinPromise = c.env.FORUM_DB
    ? c.env.FORUM_DB.prepare(
        "SELECT day, streak FROM forum_checkins WHERE user_id = ? ORDER BY day DESC LIMIT 1",
      )
        .bind(user.id)
        .first<{ day: string; streak: number }>()
        .catch(() => null)
    : Promise.resolve(null);
  const [config, economy, pointRow, history, checkin] = await Promise.all([
    loadPointsConfig(c.env.DB),
    loadEconomyConfig(c.env.DB),
    c.env.DB.prepare("SELECT points FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ points: number }>(),
    c.env.DB.prepare(
      "SELECT amount, reason, detail, created_at FROM points_logs WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    )
      .bind(user.id)
      .all<{ amount: number; reason: string; detail: string; created_at: string }>(),
    checkinPromise,
  ]);
  const streak = checkin?.streak ?? 0;
  const checkedIn = checkin?.day === todayCN();
  const effectiveStreak = checkedIn
    ? streak + 1
    : checkin?.day === yesterdayCN()
      ? streak + 1
      : 1;
  const nextPoints =
    config.signin_base +
    Math.min(Math.max(effectiveStreak - 1, 0), config.signin_streak_max) * config.signin_streak_bonus;
  const mcName = economy.enabled ? await resolveMcName(c.env.DB, user.id) : null;

  return ok({
    points: pointRow?.points ?? 0,
    history: history.results ?? [],
    checkin: { checked_in: checkedIn, streak, next_points: nextPoints },
    exchange: {
      enabled: config.exchange_enabled && economy.enabled,
      currency_name: economy.currency_name,
      points_per_currency: config.points_per_currency,
      min_exchange: config.min_exchange,
      mc_name: mcName,
      bound: !!mcName,
    },
    config,
  });
});

/** 积分兑换游戏币（通过 RCON 发放） */
app.post("/exchange", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = c.env.DB;
  await ensurePointsSchema(db);
  if (!(await rateLimit(db, `points-exchange:${user.id}`, 10, 3600))) {
    return fail("兑换过于频繁，请稍后再试", 429);
  }
  const config = await loadPointsConfig(db);
  if (!config.exchange_enabled) return fail("积分兑换尚未开启", 400);
  const economy = await loadEconomyConfig(db);
  if (!economy.enabled) return fail("游戏经济系统尚未启用，暂时无法兑换", 400);

  const body = await c.req.json().catch(() => ({}));
  const requested = Math.floor(Number(body.amount));
  if (!Number.isFinite(requested) || requested <= 0) return fail("请输入要使用的积分数量");

  const rate = Math.max(1, config.points_per_currency);
  const min = Math.max(rate, config.min_exchange);
  if (requested < min) return fail(`单次至少使用 ${min} 积分`);
  const currency = Math.floor(requested / rate);
  const cost = currency * rate;

  const mcName = await resolveMcName(db, user.id);
  if (!mcName) return fail("请先通过入服申请或绑定微软账号，再兑换游戏币", 400);
  const server = await resolveRconTarget(c);
  if (!server || !server.password) return fail("未配置 RCON 服务器，暂时无法兑换", 502);

  const deducted = await db
    .prepare("UPDATE users SET points = points - ? WHERE id = ? AND points >= ?")
    .bind(cost, user.id, cost)
    .run();
  if (!deducted.meta.changes) return fail("积分不足", 400);

  const result = await runRconCommand(
    c,
    server.host,
    server.port,
    server.password,
    fillTemplate(economy.give_cmd, mcName, String(currency)),
    8,
  ).catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : "RCON 执行失败" }));

  if (!result.ok) {
    // 发放失败，原路退回积分
    await db.prepare("UPDATE users SET points = points + ? WHERE id = ?").bind(cost, user.id).run();
    await logOp(db, c, user.id, "points_exchange_failed", result.message || "rcn_failed");
    return fail("发放失败，积分已退回，请稍后再试", 502);
  }

  await db
    .prepare("INSERT INTO points_logs (user_id, amount, reason, detail) VALUES (?, ?, 'exchange', ?)")
    .bind(user.id, -cost, `${currency} ${economy.currency_name}`)
    .run();
  const row = await db.prepare("SELECT points FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ points: number }>();
  await logOp(db, c, user.id, "points_exchange", `${cost} → ${currency} ${economy.currency_name}`);
  return ok({
    points: row?.points ?? 0,
    cost,
    amount: currency,
    currency_name: economy.currency_name,
  });
});

// —— 管理端：积分配置 ——

app.get("/admin/config", requireAdmin, async (c) => {
  await ensurePointsSchema(c.env.DB);
  const config = await loadPointsConfig(c.env.DB);
  const [total, today] = await Promise.all([
    c.env.DB.prepare("SELECT COALESCE(SUM(points), 0) AS n FROM users").first<{ n: number }>(),
    c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS n FROM points_logs WHERE amount > 0 AND date(created_at) = date('now')",
    )
      .first<{ n: number }>()
      .catch(() => null),
  ]);
  return ok({ config, stats: { total_points: total?.n ?? 0, today_issued: today?.n ?? 0 } });
});

app.post("/admin/config", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const config: PointsConfig = {
    enabled: body.enabled === true,
    signin_base: clampInt(body.signin_base, 0, 1000),
    signin_streak_bonus: clampInt(body.signin_streak_bonus, 0, 1000),
    signin_streak_max: clampInt(body.signin_streak_max, 0, 366),
    post_points: clampInt(body.post_points, 0, 1000),
    comment_points: clampInt(body.comment_points, 0, 1000),
    like_points: clampInt(body.like_points, 0, 1000),
    post_daily_limit: clampInt(body.post_daily_limit, 0, 10000),
    comment_daily_limit: clampInt(body.comment_daily_limit, 0, 10000),
    like_daily_limit: clampInt(body.like_daily_limit, 0, 10000),
    exchange_enabled: body.exchange_enabled === true,
    points_per_currency: clampInt(body.points_per_currency, 1, 1_000_000),
    min_exchange: clampInt(body.min_exchange, 1, 10_000_000),
  };
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(POINTS_SETTING_KEY, JSON.stringify(config))
    .run();
  await logOp(c.env.DB, c, c.get("user")!.id, "points_config_update", config.enabled ? "enabled" : "disabled");
  return ok({ config });
});

export default app;
