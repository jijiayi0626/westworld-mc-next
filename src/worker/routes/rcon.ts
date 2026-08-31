import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";

const app = new Hono<AppEnv>();

// —— 全部管理接口 ——
app.use("*", requireAuth, requireAdmin);

// 服务器状态（ping 探测入口：返回应用层信息，real status 由 RCON 提供）
app.get("/ping", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, server_name, host, port, game, status, players_online, max_players, last_check
     FROM game_servers ORDER BY id ASC LIMIT 20`,
  ).all();
  return ok(results);
});

// 通过 RCON Durable Object 执行命令
app.post("/command", async (c) => {
  const admin = c.get("user")!;
  if (c.env.RCON_ENABLED !== "true") {
    return fail("RCON 未开启", 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const serverId = Number(body.server_id) || 1;
  const command = String(body.command || "").trim().slice(0, 500);
  if (!command) return fail("命令不能为空");

  const server = await c.env.DB.prepare(
    "SELECT id, server_name, host, port, password FROM game_servers WHERE id = ?",
  ).bind(serverId).first<{ id: number; server_name: string; host: string; port: number; password: string }>();
  if (!server) return fail("服务器不存在", 404);

  const ns = c.env.RCON;
  if (!ns) return fail("RCON Durable Object 未绑定", 503);

  // 按服务器单实例化 DO：同一服务器保持一个长连接，避免并发重连
  const stub = ns.get(ns.idFromName(`server-${server.id}`));
  const resp = await stub.fetch(
    new Request("https://rcon.local/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: server.host,
        port: server.port,
        password: server.password,
        command,
      }),
    }),
  );
  const data = (await resp.json()) as { ok?: boolean; output?: string; message?: string };

  await c.env.DB.prepare(
    `INSERT INTO op_logs (operator_id, action, target, detail, ip)
     VALUES (?, 'rcon_command', ?, ?, ?)`,
  )
    .bind(admin.id, server.server_name, command.slice(0, 200), "rcon")
    .run();

  if (!data.ok) return fail(data.message || "RCON 执行失败", 502);
  return ok({ output: data.output || "" });
});

export default app;