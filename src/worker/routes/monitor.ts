import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok } from "../lib/http";

const app = new Hono<AppEnv>();

// 服务器状态查询（公开只读：版本/在线人数由巡检任务写入 game_servers）
app.get("/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, server_name, host, port, game, version, status, players_online, max_players, last_check FROM game_servers ORDER BY id ASC",
  ).all();
  return ok(results);
});

// —— 管理接口：更新服务器状态 & RCON 触发巡检 ——

app.use("/admin/*", requireAuth, requireAdmin);

// 手动更新（通常在 worker 内定时/触发时调用）；这里提供管理入口
app.post("/admin/update", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id) || 1;
  const playersOnline = Number(body.players_online) || 0;
  const maxPlayers = Number(body.max_players) || 0;
  const status = body.status === "offline" ? "offline" : "online";
  const version = String(body.version || "").slice(0, 50);

  await c.env.DB.prepare(
    `UPDATE game_servers SET players_online = ?, max_players = ?, status = ?, version = ?, last_check = datetime('now') WHERE id = ?`,
  )
    .bind(playersOnline, maxPlayers, status, version, id)
    .run();
  return ok({ updated: true });
});

// 触发一次巡检（调用外部状态 API 占位）
app.post("/admin/check", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, server_name, host, port FROM game_servers ORDER BY id ASC").all();
  for (const s of results as { id: number; host: string; port: number }[]) {
    // TODO: 接入 mcstatus 类接口实际探测
    await c.env.DB.prepare(
      "UPDATE game_servers SET last_check = datetime('now') WHERE id = ?",
    ).bind(s.id).run();
  }
  return ok({ checked: true });
});

export default app;