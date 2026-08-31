import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { str } from "../lib/validate";

const app = new Hono<AppEnv>();

// 会话限额（AI_ENABLED=false 时每用户每日 5 条；启用后由真实计费控制）
const DAILY_LIMIT_DISABLED = 5;

// 发送消息（OpenAI 兼容；未配置时返回固定占位回复）
app.post("/chat", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 4000).trim();
  if (!content) return fail("消息不能为空");

  // 未启用 AI 时按日限额限制；启用后由真实计费控制
  if (c.env.AI_ENABLED !== "true") {
    const usage = await c.env.DB.prepare(
      "SELECT COALESCE(count, 0) AS used FROM ai_usage WHERE user_id = ? AND date = date('now')",
    ).bind(user.id).first<{ used: number }>();
    if ((usage?.used ?? 0) >= DAILY_LIMIT_DISABLED) {
      return fail(`演示模式下每日最多 ${DAILY_LIMIT_DISABLED} 条，明天再来吧`, 429);
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
  if (c.env.AI_ENABLED === "true") {
    const apiKey = c.env.AI_API_KEY;
    const baseUrl = c.env.AI_BASE_URL || "https://api.openai.com/v1";
    const model = c.env.AI_MODEL || "gpt-4o-mini";
    if (!apiKey) return fail("AI 服务未配置 API Key", 503);

    // 拉取该会话历史作为上下文
    const { results: history } = await c.env.DB.prepare(
      "SELECT role, content FROM ai_conversation_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 20",
    ).bind(convoId).all();

    const resp = await fetch(`${baseUrl}/chat/completions`, {
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
    });

    if (!resp.ok) {
      return fail(`AI 服务错误: ${resp.status}`, 502);
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
  await c.env.DB.prepare("DELETE FROM ai_conversation_messages WHERE conversation_id = ? AND user_id = ?")
    .bind(id, user.id)
    .run();
  // 级联删除会话（简化：仅当为本人）
  const convo = await c.env.DB.prepare("SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?")
    .bind(id, user.id).first();
  if (convo) {
    await c.env.DB.prepare("UPDATE ai_conversations SET status = 'deleted' WHERE id = ?").bind(id).run();
  }
  return ok({ deleted: true });
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

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