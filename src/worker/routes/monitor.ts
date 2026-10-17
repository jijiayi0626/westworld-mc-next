import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";

const app = new Hono<AppEnv>();

/** 巡检探测结果 */
interface ProbeResult {
  status: string;
  players_online: number;
  max_players: number;
  version: string;
  motd: string;
  source: string;
}

/**
 * 探测单个服务器，返回最新状态（探测失败返回 null）。
 * 优先使用 MineBBS /api/status（JSON 含 MOTD 纯文本，国内可达），失败回退 mcsrvstat.us。
 */
async function probeServer(
  host: string,
  port: number,
  db?: D1Database,
): Promise<ProbeResult | null> {
  const address = port === 25565 ? host : `${host}:${port}`;

  // 1) MineBBS MOTD API（可经 site_settings.motd_api_base 覆盖）
  const base = db ? await getMotdApiBase(db) : "https://motd.minebbs.com";
  try {
    const resp = await fetch(`${base}/api/status?host=${encodeURIComponent(address)}&stype=auto`, {
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        status?: string;
        pureMotd?: string;
        motd?: { text?: string };
        version?: string;
        players?: { online?: number; max?: number };
      };
      if (data && typeof data.status === "string") {
        const online = data.status !== "offline";
        return {
          status: online ? "online" : "offline",
          players_online: online ? Number(data.players?.online) || 0 : 0,
          max_players: online ? Number(data.players?.max) || 0 : 0,
          version: online ? String(data.version ?? "").slice(0, 50) : "",
          motd: online ? String(data.pureMotd ?? data.motd?.text ?? "").slice(0, 300) : "",
          source: "minebbs",
        };
      }
    }
  } catch {
    /* 回退到 mcsrvstat */
  }

  // 2) 回退：mcsrvstat.us 公开 API
  try {
    const resp = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`);
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      online?: boolean;
      players?: { online?: number; max?: number };
      version?: string;
      motd?: { clean?: string[] };
    };
    if (!data.online) return { status: "offline", players_online: 0, max_players: 0, version: "", motd: "", source: "mcsrvstat" };
    return {
      status: "online",
      players_online: data.players?.online ?? 0,
      max_players: data.players?.max ?? 0,
      version: (data.version ?? "").slice(0, 50),
      motd: (data.motd?.clean ?? []).join(" ").slice(0, 300),
      source: "mcsrvstat",
    };
  } catch {
    return null;
  }
}

/** 巡检所有服务器（写回 game_servers）。供管理端「立即巡检」与定时任务（scheduled）复用 */
export async function checkAllServers(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare("SELECT id, server_name, host, port FROM game_servers ORDER BY id ASC")
    .all();
  const servers = results as { id: number; server_name: string; host: string; port: number }[];

  for (const s of servers) {
    const probed = await probeServer(s.host, s.port, db);
    const status = probed?.status ?? "offline";
    const playersOnline = probed?.players_online ?? 0;
    const maxPlayers = probed?.max_players ?? 0;
    const version = probed?.version ?? "";
    const motd = probed?.motd ?? "";
    await db
      .prepare(
        `UPDATE game_servers
         SET status = ?, players_online = ?, max_players = ?, version = ?, motd = ?, last_check = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, playersOnline, maxPlayers, version, motd, s.id)
      .run();
  }
  return servers.length;
}

// 服务器状态查询（公开只读）
// 若 last_check 超过 2 分钟则同步重新探测一次，保证 Hero/导航显示真实在线人数；
// 探测失败时回退库内旧值。
app.get("/status", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, server_name, host, port, game, version, status, players_online, max_players, motd, last_check FROM game_servers ORDER BY id ASC",
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
      const probed = await probeServer(s.host, s.port, c.env.DB);
      if (!probed) continue;
      await c.env.DB.prepare(
        `UPDATE game_servers
         SET status = ?, players_online = ?, max_players = ?, version = ?, motd = ?, last_check = datetime('now')
         WHERE id = ?`,
      )
        .bind(probed.status, probed.players_online, probed.max_players, probed.version, probed.motd, s.id)
        .run();
    }
    // 重新读取最新
    const { results: fresh } = await c.env.DB.prepare(
      "SELECT id, server_name, host, port, game, version, status, players_online, max_players, motd, last_check FROM game_servers ORDER BY id ASC",
    ).all();
    return ok(fresh);
  }

  return ok(results);
});

/** MOTD 查询源（可用 site_settings 键 motd_api_base 覆盖，默认 MineBBS 公开接口） */
async function getMotdApiBase(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'motd_api_base'").first<{ value: string }>();
    if (row?.value) return row.value.replace(/\/+$/, "");
  } catch {
    /* 用默认 */
  }
  return "https://motd.minebbs.com";
}

// MOTD 查询（公开只读）：代理外部 MOTD API（MineBBS /api/status），避免浏览器跨域
// 返回 { status, type, motd, icon, version, players: { online, max } }
app.get("/motd", async (c) => {
  const host = String(c.req.query("host") || "").trim().slice(0, 120);
  if (!host || !/^[a-zA-Z0-9.\-_:]+$/.test(host)) return fail("请输入有效的服务器地址", 400);
  const stypeRaw = String(c.req.query("stype") || "auto");
  const stype = ["auto", "je", "be"].includes(stypeRaw) ? stypeRaw : "auto";

  const base = await getMotdApiBase(c.env.DB);
  try {
    const resp = await fetch(`${base}/api/status?host=${encodeURIComponent(host)}&stype=${stype}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return fail(`MOTD 查询失败（上游 HTTP ${resp.status}）`, 502);
    const data = (await resp.json()) as {
      status?: string;
      type?: string;
      pureMotd?: string;
      motd?: { text?: string };
      icon?: string;
      version?: string;
      players?: { online?: number; max?: number };
    };
    const online = data.status !== "offline";
    const motdText = online ? String(data.pureMotd ?? data.motd?.text ?? "") : "";
    return ok({
      status: online ? "online" : "offline",
      type: String(data.type ?? "").slice(0, 20),
      motd: motdText.slice(0, 500),
      icon: online && typeof data.icon === "string" && data.icon.startsWith("data:image") ? data.icon : "",
      version: online ? String(data.version ?? "").slice(0, 60) : "",
      players: { online: Number(data.players?.online) || 0, max: Number(data.players?.max) || 0 },
    });
  } catch {
    return fail("MOTD 查询超时或上游不可用", 502);
  }
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
  const total = await checkAllServers(c.env.DB);
  return ok({ checked: true, total });
});

export default app;