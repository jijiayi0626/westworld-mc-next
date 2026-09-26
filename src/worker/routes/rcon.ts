import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { encryptSecret, decryptSecret } from "../lib/cipher";
import { getSecret } from "../lib/auth";

const app = new Hono<AppEnv>();

// —— 白名单自动同步（RCON）配置 ——

export interface RconWhitelistConfig {
  enabled: boolean;
  host: string;
  port: number;
  password_enc: string; // 加密存储，接口不回传明文
  approve_template: string;
  reject_template: string;
  timeout: number;
}

const DEFAULT_CONFIG: RconWhitelistConfig = {
  enabled: false,
  host: "",
  port: 25575,
  password_enc: "",
  approve_template: "/whitelist add {mc_name}",
  reject_template: "/whitelist remove {mc_name}",
  timeout: 5,
};

/** 读取完整配置（含加密密码，仅内部使用） */
export async function loadRconConfig(db: D1Database): Promise<RconWhitelistConfig> {
  const row = await db.prepare(
    "SELECT value FROM site_settings WHERE key = 'rcon_whitelist'",
  ).first<{ value: string }>();
  if (!row) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<RconWhitelistConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function publicConfig(cfg: RconWhitelistConfig) {
  return {
    enabled: cfg.enabled,
    host: cfg.host,
    port: cfg.port,
    has_password: Boolean(cfg.password_enc),
    approve_template: cfg.approve_template,
    reject_template: cfg.reject_template,
    timeout: cfg.timeout,
  };
}

/** 通过 RconDO 执行命令：host/port/password/command/timeout */
async function runRconCommand(
  c: { env: AppEnv["Bindings"] },
  host: string,
  port: number,
  password: string,
  command: string,
  timeout: number,
): Promise<{ ok: boolean; output?: string; message?: string }> {
  const ns = c.env.RCON;
  if (!ns) return { ok: false, message: "RCON Durable Object 未绑定" };
  const stub = ns.get(ns.idFromName(`server-${host}-${port}`));
  try {
    const resp = await stub.fetch(
      new Request("https://rcon.local/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, password, command, timeout }),
      }),
    );
    const data = (await resp.json()) as { ok?: boolean; output?: string; message?: string };
    return { ok: data.ok === true, output: data.output, message: data.message };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

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

// 通过 RCON Durable Object 执行命令（监控页 / 手动执行用）
app.post("/command", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const serverId = Number(body.server_id) || 1;
  const command = String(body.command || "").trim().slice(0, 500);
  if (!command) return fail("命令不能为空");

  const server = await c.env.DB.prepare(
    "SELECT id, server_name, host, port, password FROM game_servers WHERE id = ?",
  ).bind(serverId).first<{ id: number; server_name: string; host: string; port: number; password: string }>();
  if (!server) return fail("服务器不存在", 404);

  const data = await runRconCommand(c, server.host, server.port, server.password, command, 5);

  await c.env.DB.prepare(
    `INSERT INTO op_logs (operator_id, action, target, detail, ip)
     VALUES (?, 'rcon_command', ?, ?, 'rcon')`,
  )
    .bind(admin.id, server.server_name, command.slice(0, 200))
    .run();

  if (!data.ok) return fail(data.message || "RCON 执行失败", 502);
  return ok({ output: data.output || "" });
});

// 读取白名单同步配置（不含密码明文）
app.get("/whitelist-config", async (c) => {
  const cfg = await loadRconConfig(c.env.DB);
  return ok(publicConfig(cfg));
});

// 保存配置：password_present=false 时保留原密码；password_present=true 且 password 空=清空
app.post("/whitelist-config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = await loadRconConfig(c.env.DB);
  const appSecret = getSecret(c);

  const next: RconWhitelistConfig = {
    ...current,
    enabled: body.enabled === true,
    host: str(body.host, 200).trim(),
    port: Math.min(65535, Math.max(1, Number(body.port) || 25575)),
    approve_template: str(body.approve_template, 500).trim() || DEFAULT_CONFIG.approve_template,
    reject_template: str(body.reject_template, 500).trim() || DEFAULT_CONFIG.reject_template,
    timeout: Math.min(60, Math.max(1, Number(body.timeout) || 5)),
  };

  if (body.password_present) {
    const pwd = String(body.password ?? "");
    if (pwd) {
      next.password_enc = await encryptSecret(pwd.trim(), appSecret);
    } else {
      next.password_enc = "";
    }
  } else {
    next.password_enc = current.password_enc; // 保留原密码
  }

  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('rcon_whitelist', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(JSON.stringify({ ...next, password_enc: next.password_enc }))
    .run();

  await logOp(c.env.DB, c, c.get("user")!.id, "rcon_config_update", next.host);
  return ok(publicConfig(next));
});

// 测试连接：用当前表单输入（未保存状态）或已保存密码测试
app.post("/whitelist-test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = await loadRconConfig(c.env.DB);
  const appSecret = getSecret(c);

  const host = str(body.host, 200).trim();
  const port = Math.min(65535, Math.max(1, Number(body.port) || 25575));
  let password = String(body.password ?? "");
  if (!password && body.use_saved) {
    password = current.password_enc ? await decryptSecret(current.password_enc, appSecret) : "";
  }

  if (!host) return fail("请填写服务器地址");
  if (!password) return fail("请填写 RCON 密码");

  const data = await runRconCommand(c, host, port, password, "list", Number(body.timeout) || 5);
  if (!data.ok) return fail(data.message || "连接失败", 502);
  return ok({ connected: true, output: data.output || "" });
});

export default app;