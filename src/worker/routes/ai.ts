import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";

const app = new Hono<AppEnv>();

export interface AiConfig {
  enabled: boolean;
  api_key: string;
  base_url: string;
  model: string;
  daily_limit: number;
}

const DEFAULT_AI: AiConfig = {
  enabled: false,
  api_key: "",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  daily_limit: 5,
};

/** 归一化 OpenAI 兼容端点：base_url 已含 /chat/completions 时直接用，否则追加 */
function chatUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  return b.endsWith("/chat/completions") ? b : `${b}/chat/completions`;
}

/** 提取上游错误摘要，便于排查密钥/模型/额度问题 */
async function upstreamError(resp: Response): Promise<string> {
  let detail = "";
  try {
    detail = (await resp.text()).slice(0, 180);
  } catch {
    /* ignore */
  }
  const map: Record<number, string> = {
    401: "API 密钥无效或未授权（401）",
    403: "无权访问该模型（403）",
    404: "端点或模型不存在（404），请检查 Base URL 与模型名",
    429: "额度用尽或请求过于频繁（429）",
    500: "供应商服务异常（500）",
    502: "供应商网关异常（502）",
    503: "供应商服务不可用（503）",
  };
  const hint = map[resp.status] ? `${map[resp.status]}：` : `HTTP ${resp.status}：`;
  return hint + detail;
}

/** 读取 AI 配置：优先数据库 site_settings.ai_config，回退环境变量；
 *  若配置了多接口模板（ai_providers）且选中了当前模板（ai_active_provider），则用模板的端点/模型/密钥覆盖。 */
export async function loadAiConfig(db: D1Database, env: AppEnv["Bindings"]): Promise<AiConfig> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'ai_config'").first<{ value: string }>();
  let cfg: AiConfig = { ...DEFAULT_AI };
  if (row) {
    try {
      cfg = { ...DEFAULT_AI, ...(JSON.parse(row.value) as Partial<AiConfig>) };
    } catch {
      /* 忽略损坏配置 */
    }
  }
  // 环境变量作为回退：DB 未显式配置 enabled 时用 env 开关
  if (env.AI_ENABLED === "true" && !row) cfg.enabled = true;
  const envKey = env.AI_API_KEY ? String(env.AI_API_KEY) : "";
  const envBase = env.AI_BASE_URL ? String(env.AI_BASE_URL) : "";
  const envModel = env.AI_MODEL ? String(env.AI_MODEL) : "";
  if (envKey) cfg.api_key = cfg.api_key || envKey;
  if (envBase) cfg.base_url = cfg.base_url || envBase;
  if (envModel) cfg.model = cfg.model || envModel;

  // 多接口模板：当前选中的模板优先级最高
  try {
    const [activeRow, listRow] = await Promise.all([
      db.prepare("SELECT value FROM site_settings WHERE key = 'ai_active_provider'").first<{ value: string }>(),
      db.prepare("SELECT value FROM site_settings WHERE key = 'ai_providers'").first<{ value: string }>(),
    ]);
    if (activeRow?.value && listRow?.value) {
      const providers = JSON.parse(listRow.value) as AiProvider[];
      const p = providers.find((x) => x.id === activeRow.value);
      if (p) {
        if (p.base_url) cfg.base_url = p.base_url;
        if (p.model) cfg.model = p.model;
        if (p.api_key) cfg.api_key = p.api_key;
      }
    }
  } catch {
    /* 模板配置损坏时按通用配置走 */
  }
  return cfg;
}

// —— AI 接口模板（多供应商一键切换） ——

export interface AiProvider {
  id: string;
  name: string;
  base_url: string;
  model: string;
  api_key: string;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

async function readProviders(db: D1Database): Promise<AiProvider[]> {
  const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'ai_providers'").first<{ value: string }>();
  if (!row?.value) return [];
  try {
    const list = JSON.parse(row.value) as AiProvider[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeSetting(db: D1Database, key: string, value: string) {
  await db
    .prepare(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, value)
    .run();
}

app.use("/admin/*", requireAuth, requireAdmin);

/** 模板列表（密钥脱敏）+ 当前选中 id */
app.get("/admin/providers", async (c) => {
  const [providers, activeRow] = await Promise.all([
    readProviders(c.env.DB),
    c.env.DB.prepare("SELECT value FROM site_settings WHERE key = 'ai_active_provider'").first<{ value: string }>(),
  ]);
  return ok({
    providers: providers.map((p) => ({ ...p, api_key: maskKey(p.api_key) })),
    active_id: activeRow?.value ?? "",
  });
});

/** 保存模板列表：api_key 为空或为脱敏格式时保留原密钥 */
app.post("/admin/providers/save", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const incoming = Array.isArray(body.providers) ? body.providers : [];
  if (incoming.length > 20) return fail("模板最多 20 个");
  const old = await readProviders(c.env.DB);
  const providers: AiProvider[] = [];
  for (const p of incoming) {
    const id = str(p.id, 64);
    const name = str(p.name, 60);
    const base_url = str(p.base_url, 300).replace(/\/$/, "");
    const model = str(p.model, 120);
    const rawKey = str(p.api_key, 300);
    if (!id || !name) return fail("模板缺少 ID 或名称");
    const prev = old.find((o) => o.id === id);
    const keepKey = !rawKey || rawKey.includes("••••") ? prev?.api_key ?? "" : rawKey;
    providers.push({ id, name, base_url, model, api_key: keepKey });
  }
  await writeSetting(c.env.DB, "ai_providers", JSON.stringify(providers));
  return ok({ providers: providers.map((p) => ({ ...p, api_key: maskKey(p.api_key) })) });
});

/** 一键切换当前使用的模板 */
app.post("/admin/providers/activate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = str(body.id, 64);
  const providers = await readProviders(c.env.DB);
  if (!providers.some((p) => p.id === id)) return fail("模板不存在");
  await writeSetting(c.env.DB, "ai_active_provider", id);
  return ok({ active_id: id });
});

/** 连通性测试：向模板端点发一次最小补全请求 */
app.post("/admin/providers/test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = str(body.id, 64);
  const providers = await readProviders(c.env.DB);
  const p = providers.find((x) => x.id === id);
  if (!p) return fail("模板不存在");
  if (!p.api_key) return fail("该模板未配置 API 密钥");
  const baseUrl = p.base_url || "https://api.openai.com/v1";
  const model = p.model || "gpt-4o-mini";
  const started = Date.now();
  try {
    const resp = await fetch(chatUrl(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.api_key}` },
      body: JSON.stringify({
        model,
        max_tokens: 4,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    if (!resp.ok) {
      return ok({ ok: false, ms, message: await upstreamError(resp) });
    }
    const data = (await resp.json()) as { choices?: unknown[] };
    if (!data.choices?.length) return ok({ ok: false, ms, message: "响应异常：无 choices" });
    return ok({ ok: true, ms, message: `连接正常（${ms}ms，模型 ${model}）` });
  } catch (e) {
    const ms = Date.now() - started;
    return ok({ ok: false, ms, message: e instanceof Error ? e.message : "连接失败" });
  }
});

// 会话限额（AI_ENABLED=false 时每用户每日 5 条；启用后由真实计费控制）
const DAILY_LIMIT_DISABLED = 5;

// 发送消息（OpenAI 兼容；未配置时返回固定占位回复）
app.post("/chat", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 4000).trim();
  if (!content) return fail("消息不能为空");

  const aiCfg = await loadAiConfig(c.env.DB, c.env);

  // 未启用 AI 时按日限额限制；启用后由真实计费控制
  if (!aiCfg.enabled) {
    const usage = await c.env.DB.prepare(
      "SELECT COALESCE(count, 0) AS used FROM ai_usage WHERE user_id = ? AND date = date('now')",
    ).bind(user.id).first<{ used: number }>();
    if ((usage?.used ?? 0) >= (aiCfg.daily_limit || DAILY_LIMIT_DISABLED)) {
      return fail(`每日最多 ${aiCfg.daily_limit || DAILY_LIMIT_DISABLED} 条，明天再来吧`, 429);
    }
  }

  // 会话：取最近一个未完结会话
  const convo = await c.env.DB.prepare(
    `SELECT id FROM ai_conversations WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: number }>();

  let convoId = convo?.id ?? 0;
  if (!convoId) {
    const r = await c.env.DB.prepare(
      "INSERT INTO ai_conversations (user_id, title) VALUES (?, ?)",
    ).bind(user.id, content.slice(0, 30)).run();
    convoId = Number(r.meta.last_row_id);
  }

  await c.env.DB.prepare(
    "INSERT INTO ai_conversation_messages (conversation_id, role, content) VALUES (?, 'user', ?)",
  ).bind(convoId, content).run();

  let reply: string;
  if (aiCfg.enabled) {
    const apiKey = aiCfg.api_key;
    const baseUrl = aiCfg.base_url || "https://api.openai.com/v1";
    const model = aiCfg.model || "gpt-4o-mini";
    if (!apiKey) return fail("AI 服务未配置 API Key，请在管理后台 AI 配置中填写", 503);

    // 拉取该会话历史作为上下文
    const { results: history } = await c.env.DB.prepare(
      "SELECT role, content FROM ai_conversation_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 20",
    ).bind(convoId).all();

    const resp = await fetch(chatUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是西域之光服务器的人工智能助手，回答服务器的玩法、申请、规则等问题。保持简洁友好。" },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      return fail(`AI 服务异常：${await upstreamError(resp)}`, 502);
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    reply = data.choices?.[0]?.message?.content || "（无回复）";
  } else {
    reply =
      "你好！我是西域之光的人工智能助手（演示模式）。\n" +
      "回答常见问题：\n" +
      "· 如何入服？→ 在「入服申请」页面填写游戏名和自我介绍，等待管理员审核。\n" +
      "· 服务器地址？→ Java 与基岩版均为 sdcmc.chipzz.top:23400，版本 Java 1.7-26.2 / 基岩 26.0-26.40。\n" +
      "· 遇到问题？→ 前往「工单」提交，管理员会尽快处理。\n\n（正式 AI 接入后，这里会接入大模型自动回答。）";
  }

  await c.env.DB.prepare(
    "INSERT INTO ai_conversation_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
  ).bind(convoId, reply).run();
  // 用 upsert 累计当日用量（表有 UNIQUE(user_id, date)）
  await c.env.DB.prepare(
    `INSERT INTO ai_usage (user_id, date, count) VALUES (?, date('now'), 1)
     ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
  ).bind(user.id).run();

  return ok({ conversation_id: convoId, reply });
});

// 会话历史
app.get("/conversations", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.title, c.status, c.created_at,
            (SELECT COUNT(*) FROM ai_conversation_messages m WHERE m.conversation_id = c.id) AS messages
     FROM ai_conversations c WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 20`,
  ).bind(user.id).all();
  return ok(results);
});

// 单会话详情
app.get("/conversations/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const convo = await c.env.DB.prepare(
    "SELECT id, user_id FROM ai_conversations WHERE id = ?",
  ).bind(id).first<{ id: number; user_id: number }>();
  if (!convo || convo.user_id !== user.id) return fail("会话不存在", 404);
  const { results } = await c.env.DB.prepare(
    "SELECT id, role, content, created_at FROM ai_conversation_messages WHERE conversation_id = ? ORDER BY id ASC",
  ).bind(id).all();
  return ok(results);
});

// 删除会话
app.post("/conversations/:id/delete", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  // 仅本人可删：先确认会话归属
  const convo = await c.env.DB.prepare("SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?")
    .bind(id, user.id).first();
  if (!convo) return fail("会话不存在", 404);
  // ai_conversation_messages 无 user_id 字段，按会话删除即可（归属已在上面校验）
  await c.env.DB.prepare("DELETE FROM ai_conversation_messages WHERE conversation_id = ?")
    .bind(id)
    .run();
  await c.env.DB.prepare("UPDATE ai_conversations SET status = 'deleted' WHERE id = ?").bind(id).run();
  return ok({ deleted: true });
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/config", async (c) => {
  const cfg = await loadAiConfig(c.env.DB, c.env);
  return ok({ ...cfg, api_key: cfg.api_key ? "已配置" : "" });
});

app.post("/admin/config", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = await loadAiConfig(c.env.DB, c.env);
  const next: AiConfig = {
    ...current,
    enabled: body.enabled === true,
    base_url: str(body.base_url, 200).trim() || DEFAULT_AI.base_url,
    model: str(body.model, 100).trim() || DEFAULT_AI.model,
    daily_limit: Math.min(1000, Math.max(1, Number(body.daily_limit) || 5)),
  };
  if (typeof body.api_key === "string" && body.api_key.trim()) {
    next.api_key = body.api_key.trim();
  }
  if (body.clear_key === true) next.api_key = "";
  await c.env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('ai_config', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  )
    .bind(JSON.stringify(next))
    .run();
  return ok({ ...next, api_key: next.api_key ? "已配置" : "" });
});

app.get("/admin/usage", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.username, COALESCE(SUM(ac.count), 0) AS total_usage,
            MAX(ac.date) AS last_used
     FROM users u LEFT JOIN ai_usage ac ON ac.user_id = u.id
     GROUP BY u.id ORDER BY total_usage DESC LIMIT 50`,
  ).all();
  return ok(results);
});

export default app;