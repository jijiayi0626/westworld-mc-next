import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";
import { logOp } from "../lib/log";

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

// —— 多场景 AI ——

export interface AiScenario {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
}

/** 内置场景：提示词与参数均可在后台修改，未保存时使用这里的默认值 */
export const DEFAULT_AI_SCENARIOS: AiScenario[] = [
  {
    id: "chat",
    name: "玩家助手",
    description: "用户中心 AI 助手的多轮对话，回答玩法、申请、规则等问题。",
    enabled: true,
    system_prompt:
      "你是西域之光 Minecraft 服务器的人工智能助手，回答服务器的玩法、申请、规则、商城等问题。保持简洁友好；不确定的信息不要编造，建议用户提交工单。",
    temperature: 0.7,
    max_tokens: 900,
  },
  {
    id: "ticket_summary",
    name: "工单摘要",
    description: "把较长的工单对话压缩成管理员可快速浏览的处理摘要。",
    enabled: true,
    system_prompt:
      "你是客服工单摘要助手。阅读工单标题、分类和对话，用中文输出 3-5 条要点：用户诉求、已提供的信息、已尝试的操作、待办事项、潜在风险。只依据原文，不要编造；不要输出客套话。",
    temperature: 0.2,
    max_tokens: 700,
  },
  {
    id: "application_review",
    name: "入服预审",
    description: "对入服申请做辅助预审，给出建议与风险点，最终决定仍由管理员做出。",
    enabled: true,
    system_prompt:
      "你是 Minecraft 服务器入服审核助手。根据申请人的游戏名、版本、来源渠道和自我介绍，用中文输出：1) 建议（通过/拒绝/需补充）；2) 理由与风险点；3) 一段可直接发给申请人的礼貌备注。不要替管理员做最终决定，不要编造申请中没有的信息。",
    temperature: 0.3,
    max_tokens: 700,
  },
  {
    id: "reply_draft",
    name: "回复草稿",
    description: "根据工单对话为管理员起草一条可直接发送的回复。",
    enabled: true,
    system_prompt:
      "你是西域之光服务器的客服。根据工单对话写一条中文回复草稿：先回应用户的核心问题，再给出清晰可执行的下一步；语气友好、简洁，不要承诺无法确认的时间或补偿。只输出回复正文。",
    temperature: 0.5,
    max_tokens: 800,
  },
];

/**
 * 部分第三方模型会自带人格名/署名（例如 MacDonald）。
 * 统一追加身份约束，并在输出与历史回灌时清洗，保证前台只出现站点自己的助手身份。
 */
const AI_IDENTITY_GUARD = [
  "",
  "【身份约束】",
  "你只以“西域之光 AI 助手”的身份回答，禁止扮演、自称或提及其他任何角色、模型、人格或厂商（包括但不限于 MacDonald、Claude、ChatGPT、GPT、Qwen、DeepSeek、Gemini、Llama）。",
  "不要在回复开头或结尾添加任何署名、落款、模型名，也不要写“我是 xxx”式的自我介绍。",
].join("\n");

const PERSONA_ALIASES = [
  "MacDonald", "Macdonald", "macdonald", "McDonald", "McDonalds",
  "Claude", "ChatGPT", "GPT-4o", "GPT-4", "GPT-3.5", "OpenAI",
  "Qwen", "DeepSeek", "Gemini", "Llama", "Copilot", "Gemma", "Mistral", "Grok",
  "麦当劳", "麦当劳叔叔", "麦当当", "通义千问", "文心一言", "豆包", "Kimi", "智谱清言",
];
const PERSONA_ALT = PERSONA_ALIASES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const PERSONA_ONLY_RE = new RegExp(
  `^(?:[\\s>*_\\-—–|【】\\[\\]()（）]+)?(?:${PERSONA_ALT})(?:[\\s>*_\\-—–|【】\\[\\]()（）]+)?$`,
  "i",
);
const PERSONA_TRAIL_RE = new RegExp(`\\s*(?:——|--|—|–|\\|)\\s*(?:${PERSONA_ALT})\\s*$`, "i");
const PERSONA_LEAD_RE = new RegExp(`^\\s*(?:【\\s*)?(?:${PERSONA_ALT})(?:\\s*】)?\\s*[:：]\\s*`, "i");
const PERSONA_SELF_RE = new RegExp(`(?:我是|我叫|这里是)\\s*(?:${PERSONA_ALT})\\s*[，,。.!！:：]?`, "gi");
const PERSONA_PAREN_RE = new RegExp(`[（(]\\s*(?:${PERSONA_ALT})\\s*[）)]`, "gi");

/** 清理整行署名、行尾落款、行首名字、括号署名与“我是 xxx” */
export function sanitizeAiText(input: string): string {
  if (!input) return input;
  const kept: string[] = [];
  for (const line of input.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && PERSONA_ONLY_RE.test(trimmed)) continue;
    kept.push(
      line
        .replace(PERSONA_TRAIL_RE, "")
        .replace(PERSONA_LEAD_RE, "")
        .replace(PERSONA_PAREN_RE, "")
        .replace(PERSONA_SELF_RE, ""),
    );
  }
  return kept.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** 读取场景配置：以默认场景为骨架，合并数据库中的自定义提示词与参数 */
export async function loadAiScenarios(db: D1Database): Promise<AiScenario[]> {
  let stored: Partial<AiScenario>[] = [];
  try {
    const row = await db
      .prepare("SELECT value FROM site_settings WHERE key = 'ai_scenarios'")
      .first<{ value: string }>();
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) stored = parsed as Partial<AiScenario>[];
    }
  } catch {
    /* 配置损坏时回退默认值 */
  }
  return DEFAULT_AI_SCENARIOS.map((def) => {
    const s = stored.find((x) => x && x.id === def.id);
    if (!s) return { ...def };
    return {
      ...def,
      enabled: typeof s.enabled === "boolean" ? s.enabled : def.enabled,
      system_prompt:
        typeof s.system_prompt === "string" && s.system_prompt.trim()
          ? s.system_prompt.trim().slice(0, 4000)
          : def.system_prompt,
      temperature: clamp(s.temperature, 0, 2, def.temperature),
      max_tokens: Math.round(clamp(s.max_tokens, 64, 4096, def.max_tokens)),
    };
  });
}

export interface AiCompleteResult {
  ok: boolean;
  text: string;
  message?: string;
  model?: string;
}

/**
 * 通用补全：读取全局配置 + 场景提示词，调用 OpenAI 兼容接口。
 * 不处理每日限额（由调用方决定），失败时返回可读错误而不是抛异常。
 */
export async function aiComplete(
  db: D1Database,
  env: AppEnv["Bindings"],
  scenarioId: string,
  messages: { role: string; content: string }[],
  options?: { force?: boolean },
): Promise<AiCompleteResult> {
  const cfg = await loadAiConfig(db, env);
  if (!cfg.enabled && !options?.force) {
    return { ok: false, text: "", message: "AI 功能未启用，请先在「AI 管理」中开启总开关" };
  }
  if (!cfg.api_key) {
    return { ok: false, text: "", message: "AI 服务未配置 API Key，请在「AI 管理」中填写" };
  }
  const scenarios = await loadAiScenarios(db);
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    return { ok: false, text: "", message: `未知的 AI 场景：${scenarioId}` };
  }
  if (!scenario.enabled && !options?.force) {
    return { ok: false, text: "", message: `场景「${scenario.name}」已停用，请先在「AI 管理」中开启` };
  }

  try {
    const resp = await fetch(chatUrl(cfg.base_url || "https://api.openai.com/v1"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.api_key}`,
      },
      body: JSON.stringify({
        model: cfg.model || "gpt-4o-mini",
        temperature: scenario.temperature,
        max_tokens: scenario.max_tokens,
        messages: [
          { role: "system", content: `${scenario.system_prompt}${AI_IDENTITY_GUARD}` },
          ...messages
            .filter((m) => m && typeof m.content === "string" && m.content)
            .slice(-24)
            .map((m) => ({
              role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
              content: sanitizeAiText(m.content).slice(0, 8000),
            }))
            .filter((m) => m.content),
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      return { ok: false, text: "", message: `AI 服务异常：${await upstreamError(resp)}` };
    }
    const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
    const text = sanitizeAiText(data.choices?.[0]?.message?.content || "");
    if (!text) return { ok: false, text: "", message: "AI 响应为空，请稍后重试" };
    return { ok: true, text, model: cfg.model };
  } catch (e) {
    const message = e instanceof Error && e.name === "TimeoutError" ? "AI 请求超时" : e instanceof Error ? e.message : "AI 请求失败";
    return { ok: false, text: "", message };
  }
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

// 每用户每日默认限额（可在后台调整，启用 AI 后同样生效）
const DAILY_LIMIT_DISABLED = 5;

// 发送消息（OpenAI 兼容；未配置时返回固定占位回复）
app.post("/chat", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 4000).trim();
  if (!content) return fail("消息不能为空");

  const aiCfg = await loadAiConfig(c.env.DB, c.env);

  // 每用户每日限额（启用 AI 后同样生效，避免单个账号刷爆上游额度）
  const dailyLimit = aiCfg.daily_limit || DAILY_LIMIT_DISABLED;
  const usage = await c.env.DB.prepare(
    "SELECT COALESCE(count, 0) AS used FROM ai_usage WHERE user_id = ? AND date = date('now')",
  ).bind(user.id).first<{ used: number }>();
  if ((usage?.used ?? 0) >= dailyLimit) {
    return fail(`每日最多 ${dailyLimit} 条，明天再来吧`, 429);
  }

  // 会话：显式传入 conversation_id 时续聊并校验归属；否则新建（修复「新对话」无效）
  const requestedConvoId = Number(body.conversation_id) || 0;
  let convoId = 0;
  if (requestedConvoId > 0) {
    const owned = await c.env.DB.prepare(
      "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ? AND status = 'active'",
    )
      .bind(requestedConvoId, user.id)
      .first<{ id: number }>();
    if (!owned) return fail("会话不存在或已结束", 404);
    convoId = owned.id;
  } else {
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
    // 拉取该会话最近 20 条作为上下文（先倒序截断，再正序喂给模型）
    const { results: history } = await c.env.DB.prepare(
      `SELECT role, content FROM (
         SELECT id, role, content FROM ai_conversation_messages
         WHERE conversation_id = ? ORDER BY id DESC LIMIT 20
       ) ORDER BY id ASC`,
    ).bind(convoId).all<{ role: string; content: string }>();

    const result = await aiComplete(
      c.env.DB,
      c.env,
      "chat",
      history.map((m) => ({ role: m.role, content: m.content })),
    );
    if (!result.ok) return fail(result.message || "AI 服务异常", 502);
    reply = sanitizeAiText(result.text);
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
     FROM ai_conversations c
     WHERE c.user_id = ? AND (c.status IS NULL OR c.status <> 'deleted')
     ORDER BY c.id DESC LIMIT 20`,
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
  ).bind(id).all<{ id: number; role: string; content: string; created_at: string }>();
  // 历史数据里可能残留模型人格名，返回前统一清洗
  return ok(results.map((m) => ({ ...m, content: sanitizeAiText(m.content) })));
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

// —— 多场景配置 ——

app.get("/admin/scenarios", async (c) => {
  const [scenarios, cfg] = await Promise.all([
    loadAiScenarios(c.env.DB),
    loadAiConfig(c.env.DB, c.env),
  ]);
  return ok({ scenarios, defaults: DEFAULT_AI_SCENARIOS, ai_enabled: cfg.enabled });
});

app.post("/admin/scenarios", async (c) => {
  const admin = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const incoming = Array.isArray(body.scenarios) ? (body.scenarios as Record<string, unknown>[]) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of incoming) {
    if (item && typeof item.id === "string") byId.set(item.id, item);
  }
  const next = DEFAULT_AI_SCENARIOS.map((def) => {
    const s = byId.get(def.id);
    if (!s) return { ...def };
    return {
      ...def,
      enabled: s.enabled === true,
      system_prompt:
        typeof s.system_prompt === "string" && s.system_prompt.trim()
          ? s.system_prompt.trim().slice(0, 4000)
          : def.system_prompt,
      temperature: clamp(s.temperature, 0, 2, def.temperature),
      max_tokens: Math.round(clamp(s.max_tokens, 64, 4096, def.max_tokens)),
    };
  });
  await writeSetting(c.env.DB, "ai_scenarios", JSON.stringify(next));
  await logOp(c.env.DB, c, admin.id, "ai_scenarios_update", String(next.filter((s) => s.enabled).length));
  return ok({ scenarios: next });
});

app.post("/admin/scenarios/test", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = str(body.id, 64);
  const sample = str(body.sample, 2000).trim() || "请用一句话回复：你好，我想了解服务器的玩法。";
  const scenario = (await loadAiScenarios(c.env.DB)).find((s) => s.id === id);
  if (!scenario) return fail("场景不存在", 404);
  const r = await aiComplete(c.env.DB, c.env, id, [{ role: "user", content: sample }], { force: true });
  return ok({
    ok: r.ok,
    text: r.text,
    model: r.model,
    message: r.ok ? `场景「${scenario.name}」调用成功` : r.message || "测试失败",
  });
});

export default app;