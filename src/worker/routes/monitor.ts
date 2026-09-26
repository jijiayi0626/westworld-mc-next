import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok } from "../lib/http";

const app = new Hono<AppEnv>();

/** 通过 mcsrvstat 公开 API 探测单个服务器，返回最新状态（探测失败返回 null） */
async function probeServer(
  host: string,
  port: number,
): Promise<{ status: string; players_online: number; max_players: number; version: string } | null> {
  try {
    const address = port === 25565 ? host : `${host}:${port}`;
    const resp = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      online?: boolean;
      players?: { online?: number; max?: number };
      version?: string;
    };
    if (!data.online) return { status: "offline", players_online: 0, max_players: 0, version: "" };
    return {
      status: "online",
      players_online: data.players?.online ?? 0,
      max_players: data.players?.max ?? 0,
      version: (data.version ?? "").slice(0, 50),
    };
  } catch {
    return null;
  }
}

// 服务器状态查询（公开只读）
// 若 last_check 超过 2 分钟则同步重新探测一次，保证 Hero/导航显示真实在线人数；
// 探测失败时回退库内旧值。
app.get("/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, server_name, host, port, game, version, status, players_online, max_players, last_check FROM game_servers ORDER BY id ASC",
  ).all();
  const servers = results as {
    id: number;
    host: string;
    port: number;
    last_check: string | null;
  }[];

  const now = Date.now();
  const stale = (row: { last_check: string | null }) => {
    if (!row.last_check) return true;
    const t = new Date(row.last_check.replace(" ", "T") + "Z").getTime();
    return Number.isNaN(t) || now - t > 120_000;
  };

  if (servers.some(stale)) {
    for (const s of servers) {
      if (!stale(s)) continue;
      const probed = await probeServer(s.host, s.port);
      if (!probed) continue;
      await c.env.DB.prepare(
        `UPDATE game_servers
         SET status = ?, players_online = ?, max_players = ?, version = ?, last_check = datetime('now')
         WHERE id = ?`,
      )
        .bind(probed.status, probed.players_online, probed.max_players, probed.version, s.id)
        .run();
    }
    // 重新读取最新
    const { results: fresh } = await c.env.DB.prepare(
      "SELECT id, server_name, host, port, game, version, status, players_online, max_players, last_check FROM game_servers ORDER BY id ASC",
    ).all();
    return ok(fresh);
  }

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

// 触发一次巡检（通过 mcsrvstat 公开 API 真实探测各服务器）
app.post("/admin/check", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, server_name, host, port FROM game_servers ORDER BY id ASC",
  ).all();
  const servers = results as { id: number; server_name: string; host: string; port: number }[];

  for (const s of servers) {
    let status = "offline";
    let playersOnline = 0;
    let maxPlayers = 0;
    let version = "";
    try {
      // address 不带端口时用默认 25565；显式端口保持原样
      const withoutPort = s.port === 25565 ? s.host : `${s.host}:${s.port}`;
      const resp = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(withoutPort)}`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          online?: boolean;
          players?: { online?: number; max?: number };
          version?: string;
        };
        if (data.online) {
          status = "online";
          playersOnline = data.players?.online ?? 0;
          maxPlayers = data.players?.max ?? 0;
          version = data.version ?? "";
        }
      }
    } catch {
      // 探测失败按离线处理
    }
    await c.env.DB.prepare(
      `UPDATE game_servers
       SET status = ?, players_online = ?, max_players = ?, version = ?, last_check = datetime('now')
       WHERE id = ?`,
    )
      .bind(status, playersOnline, maxPlayers, version.slice(0, 50), s.id)
      .run();
  }
  return ok({ checked: true, total: servers.length });
});

export default app;