import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";
import { rateLimit } from "../lib/ratelimit";

const app = new Hono<AppEnv>();

const DEFAULT_BASE = "https://api.v2.rainyun.com";

export interface RainyunConfig {
  enabled: boolean;
  api_key: string;
  base_url: string;
  server_id: string;
}

const DEFAULT_CONFIG: RainyunConfig = {
  enabled: false,
  api_key: "",
  base_url: DEFAULT_BASE,
  server_id: "",
};

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/** 只允许 https，且拒绝明显的回环/内网地址，避免配置被滥用为 SSRF 跳板 */
function safeBaseUrl(raw: string): string {
  const fallback = DEFAULT_BASE;
  const value = raw.trim().replace(/\/+$/, "") || fallback;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return fallback;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith("169.254.")
    ) {
      return fallback;
    }
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return fallback;
  }
}

async function loadConfig(db: D1Database): Promise<RainyunConfig> {
  const row = await db
    .prepare("SELECT value FROM site_settings WHERE key = 'rainyun_config'")
    .first<{ value: string }>();
  if (!row?.value) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(row.value) as Partial<RainyunConfig>;
    return {
      enabled: parsed.enabled === true,
      api_key: typeof parsed.api_key === "string" ? parsed.api_key : "",
      base_url: safeBaseUrl(typeof parsed.base_url === "string" ? parsed.base_url : DEFAULT_BASE),
      server_id: typeof parsed.server_id === "string" ? parsed.server_id.slice(0, 30) : "",
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(db: D1Database, cfg: RainyunConfig): Promise<void> {
  await db
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ('rainyun_config', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .bind(JSON.stringify(cfg))
    .run();
}

interface RainyunRecord {
  ID?: number;
  UID?: number;
  Status?: string;
  StatusData?: string;
  StopReason?: string;
  Tag?: string;
  OsName?: string;
  HostName?: string;
  MainIPv4?: string;
  NatPublicIP?: string;
  NatPublicDomain?: string;
  Zone?: string;
  ExpDate?: number;
  CreateDate?: number;
  CPU?: number;
  Memory?: number;
  BaseDisk?: number;
  DataDisk?: number;
  UsageData?: {
    CPU?: number;
    Mem?: number;
    MemUsage?: number;
    Disk?: number;
    DiskRead?: number;
    DiskWrite?: number;
    NetIn?: number;
    NetOut?: number;
    UpdateTime?: number;
  };
  Plan?: { PlanName?: string; Chinese?: string; Machine?: string; bandwidth?: number };
}

function normalizeStatus(raw: string): { label: string; tone: "green" | "gray" | "amber" | "red" } {
  const s = String(raw || "").toLowerCase();
  if (/error|fail|异常|故障/.test(s)) return { label: "异常", tone: "red" };
  if (/pending|creating|installing|deploy|starting|stopping|rebooting|处理中|部署|安装|启动中|停止中|重启中/.test(s)) {
    return { label: "部署中", tone: "amber" };
  }
  if (/running|run|on|active|正常|运行/.test(s)) return { label: "运行中", tone: "green" };
  if (/stop|off|shutdown|关机|已停/.test(s)) return { label: "已关机", tone: "gray" };
  return { label: raw || "未知", tone: "gray" };
}

async function ryFetch(
  cfg: RainyunConfig,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  if (!cfg.api_key) throw new Error("未配置雨云 API Key");
  const resp = await fetch(`${cfg.base_url}${path}`, {
    ...init,
    headers: {
      "x-api-key": cfg.api_key,
      "Content-Type": "application/json",
      "User-Agent": "westworld-mc-next/2.7",
      ...(init?.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(20_000),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`雨云接口返回非 JSON（HTTP ${resp.status}）`);
  }
  const code = Number(data.code);
  if (!resp.ok || (Number.isFinite(code) && code !== 200 && code !== 0)) {
    const message = String(data.message || data.msg || `HTTP ${resp.status}`);
    if (code === 30002) throw new Error("雨云 API Key 无效或已过期，请重新生成");
    throw new Error(`雨云接口错误：${message}`);
  }
  return data;
}

function pickRecords(payload: Record<string, unknown>): RainyunRecord[] {
  const data = payload.data as Record<string, unknown> | RainyunRecord[] | undefined;
  if (Array.isArray(data)) return data as RainyunRecord[];
  if (!data || typeof data !== "object") return [];
  const inner = data.Records ?? data.records ?? data.Data ?? data.data ?? data.List ?? data.list;
  if (Array.isArray(inner)) return inner as RainyunRecord[];
  return [];
}

async function fetchInstances(cfg: RainyunConfig): Promise<RainyunRecord[]> {
  const options = encodeURIComponent(JSON.stringify({ page: 1, perPage: 50 }));
  let payload = await ryFetch(cfg, `/product/rgs/?options=${options}`);
  let records = pickRecords(payload);
  // 少数账号的 options 参数格式不同，退回不带参数的列表接口
  if (records.length === 0) {
    payload = await ryFetch(cfg, "/product/rgs/");
    records = pickRecords(payload);
  }
  if (cfg.server_id) {
    records = records.filter((r) => String(r.ID ?? "") === cfg.server_id);
  }
  return records;
}

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/config", async (c) => {
  const cfg = await loadConfig(c.env.DB);
  return ok({
    enabled: cfg.enabled,
    base_url: cfg.base_url,
    server_id: cfg.server_id,
    api_key_set: !!cfg.api_key,
    api_key_preview: maskKey(cfg.api_key),
  });
});

app.post("/admin/config", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const current = await loadConfig(c.env.DB);
  const rawKey = str(body.api_key, 300).trim();
  const next: RainyunConfig = {
    enabled: body.enabled === true,
    api_key: body.clear_key === true ? "" : rawKey && !rawKey.includes("••••") ? rawKey : current.api_key,
    base_url: safeBaseUrl(str(body.base_url, 300)),
    server_id: str(body.server_id, 30).trim(),
  };
  await saveConfig(c.env.DB, next);
  await logOp(c.env.DB, c, admin.id, "rainyun_config_update", next.enabled ? "enabled" : "disabled");
  return ok({
    enabled: next.enabled,
    base_url: next.base_url,
    server_id: next.server_id,
    api_key_set: !!next.api_key,
    api_key_preview: maskKey(next.api_key),
  });
});

app.get("/admin/overview", async (c) => {
  const cfg = await loadConfig(c.env.DB);
  if (!cfg.enabled) {
    return ok({ configured: false, enabled: false, instances: [], error: "" });
  }
  if (!cfg.api_key) {
    return ok({ configured: false, enabled: true, instances: [], error: "尚未配置 API Key" });
  }
  try {
    const records = await fetchInstances(cfg);
    const now = Math.floor(Date.now() / 1000);
    const instances = records.slice(0, 50).map((r) => {
      const status = normalizeStatus(String(r.Status ?? ""));
      const exp = Number(r.ExpDate) || 0;
      return {
        id: Number(r.ID) || 0,
        name: r.Tag || r.HostName || r.OsName || `游戏云 #${r.ID ?? "?"}`,
        status: status.label,
        status_tone: status.tone,
        raw_status: r.Status ?? "",
        stop_reason: r.StopReason ?? "",
        ip: r.MainIPv4 || r.NatPublicIP || "",
        domain: r.NatPublicDomain || "",
        zone: r.Zone || "",
        plan: r.Plan?.Chinese || r.Plan?.PlanName || r.OsName || "",
        cpu: Number(r.CPU) || Number(r.UsageData?.CPU) || 0,
        memory: Number(r.Memory) || 0,
        mem_usage: Number(r.UsageData?.MemUsage) || 0,
        disk: Number(r.BaseDisk) || Number(r.DataDisk) || 0,
        net_in: Number(r.UsageData?.NetIn) || 0,
        net_out: Number(r.UsageData?.NetOut) || 0,
        expires_at: exp,
        expires_in_days: exp > 0 ? Math.ceil((exp - now) / 86400) : null,
        created_at: Number(r.CreateDate) || 0,
      };
    });
    return ok({
      configured: true,
      enabled: true,
      base_url: cfg.base_url,
      server_id: cfg.server_id,
      instances,
      error: "",
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return ok({
      configured: true,
      enabled: true,
      instances: [],
      error: e instanceof Error ? e.message : "读取雨云实例失败",
      fetched_at: new Date().toISOString(),
    });
  }
});

app.post("/admin/action", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const id = Number(body.id);
  const action = String(body.action || "");
  if (!Number.isInteger(id) || id <= 0) return fail("实例 ID 无效");
  if (!["start", "stop", "reboot"].includes(action)) return fail("无效的操作");
  if (!(await rateLimit(c.env.DB, `rainyun:action:${admin.id}`, 20, 300))) {
    return fail("操作过于频繁，请 5 分钟后再试", 429);
  }

  const cfg = await loadConfig(c.env.DB);
  if (!cfg.enabled) return fail("雨云面板功能未启用");
  if (!cfg.api_key) return fail("尚未配置雨云 API Key");
  if (cfg.server_id && cfg.server_id !== String(id)) {
    return fail("只允许操作已绑定实例");
  }

  const labels: Record<string, string> = { start: "开机", stop: "关机", reboot: "重启" };
  try {
    const payload = await ryFetch(cfg, `/product/rgs/${id}/${action}`, { method: "POST", body: "{}" });
    await logOp(c.env.DB, c, admin.id, "rainyun_action", String(id), action);
    const message =
      typeof payload.data === "string" && payload.data
        ? String(payload.data)
        : String(payload.message || `${labels[action]}指令已提交`);
    return ok({ action, id, message });
  } catch (e) {
    return fail(e instanceof Error ? e.message : `${labels[action]}失败`, 502);
  }
});

export default app;
