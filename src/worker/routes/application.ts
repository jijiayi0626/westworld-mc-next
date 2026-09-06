import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { isValidPlayerName, str } from "../lib/validate";
import { getClientIp, getUa } from "../lib/net";
import { logOp } from "../lib/log";
import { getSecret } from "../lib/auth";
import { decryptSecret } from "../lib/cipher";
import { loadRconConfig } from "./rcon";

const app = new Hono<AppEnv>();

/** 渲染命令模板占位符 */
function renderTemplate(template: string, ctx: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(ctx)) {
    out = out.split(`{${k}}`).join(String(v ?? ""));
  }
  return out;
}

/** 通过 RconDO 执行命令（复用 rcon 路由的连接口径） */
async function execRcon(
  c: { env: AppEnv["Bindings"] },
  host: string,
  port: number,
  password: string,
  command: string,
  timeout: number,
): Promise<{ ok: boolean; output?: string; message?: string }> {
  const ns = c.env.RCON;
  if (!ns) return { ok: false, message: "RCON Durable Object 未绑定" };
  const stub = ns.get(ns.idFromName(`whitelist-${host}-${port}`));
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

// —— 用户端 ——

app.use("/submit", requireAuth);

// 提交入服申请
app.post("/submit", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const mcName = str(body.mc_name, 16).trim();
  const type = ["java", "bedrock"].includes(body.type) ? body.type : "java";
  const intro = str(body.intro, 2000).trim();
  const channel = str(body.channel, 50).trim();

  if (!isValidPlayerName(mcName)) return fail("游戏名需 3-16 位（字母/数字/下划线）");
  if (!intro) return fail("请填写自我介绍");

  const existing = await c.env.DB.prepare(
    `SELECT id FROM whitelist_applications
     WHERE mc_name = ? COLLATE NOCASE AND status IN ('pending','approved')`,
  ).bind(mcName).first();
  if (existing) return fail("该游戏名已存在待审核或已通过的申请", 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO whitelist_applications (user_id, mc_name, type, intro, channel, ip, ua)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(user.id, mcName, type, intro, channel, getClientIp(c), getUa(c))
    .run();

  const id = Number(result.meta.last_row_id);
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'whitelist', ?, ?)",
  ).bind(user.id, "入服申请已提交", `申请 #${id} 正在审核中`).run();

  return ok({ id });
});

// 我的申请列表
app.get("/mine", requireAuth, async (c) => {
  const user = c.get("user")!;
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.mc_name, w.type, w.status, w.created_at, w.reviewed_at,
            w.review_note, u.username AS reviewer
     FROM whitelist_applications w LEFT JOIN users u ON u.id = w.reviewed_by
     WHERE w.user_id = ? ORDER BY w.id DESC LIMIT 20`,
  ).bind(user.id).all();
  return ok(results);
});

// —— 管理端 ——

app.use("/admin/*", requireAuth, requireAdmin);

app.get("/admin/list", async (c) => {
  const status = c.req.query("status") || "pending";
  const allowed = ["pending", "approved", "rejected"];
  const cond = allowed.includes(status) ? `WHERE w.status = '${status}'` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.mc_name, w.type, w.intro, w.channel, w.status, w.created_at,
            w.review_note, w.sync_status, w.sync_log, w.ip, u.id AS user_id, u.username
     FROM whitelist_applications w JOIN users u ON u.id = w.user_id ${cond}
     ORDER BY w.id DESC LIMIT 100`,
  ).all();
  return ok(results);
});

// 审核：approved / rejected（启用 RCON 自动同步时下发命令）
app.post("/admin/:id/review", async (c) => {
  const admin = c.get("user")!;
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const status = body.status === "approved" ? "approved" : "rejected";
  const note = str(body.note, 1000).trim();

  const appRow = await c.env.DB.prepare(
    `SELECT w.user_id, w.mc_name, w.type, w.channel, w.status AS app_status,
            u.username, u.email
     FROM whitelist_applications w
     LEFT JOIN users u ON u.id = w.user_id
     WHERE w.id = ?`,
  ).bind(id).first<{
    user_id: number;
    mc_name: string;
    type: string;
    channel: string;
    app_status: string;
    username: string | null;
    email: string | null;
  }>();
  if (!appRow) return fail("申请不存在", 404);

  await c.env.DB.prepare(
    `UPDATE whitelist_applications SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(status, note, admin.id, id)
    .run();

  // 通知用户
  const title = status === "approved" ? "入服申请已通过" : "入服申请被拒绝";
  const content = status === "approved"
    ? `游戏名 ${appRow.mc_name} 已通过审核，欢迎加入西域之光！`
    : `游戏名 ${appRow.mc_name} 未通过审核${note ? `：${note}` : ""}`;
  await c.env.DB.prepare(
    "INSERT INTO notifications (user_id, type, title, content) VALUES (?, 'whitelist', ?, ?)",
  ).bind(appRow.user_id, title, content).run();

  await logOp(c.env.DB, c, admin.id, "whitelist_review", appRow.mc_name, status);

  // —— RCON 白名单自动同步 ——
  let sync = "off";
  if (c.env.RCON_ENABLED === "true") {
    const cfg = await loadRconConfig(c.env.DB);
    if (cfg.enabled && cfg.host) {
      const template = status === "approved" ? cfg.approve_template : cfg.reject_template;
      const ctx: Record<string, string | number> = {
        mc_name: appRow.mc_name,
        reason: note || (status === "rejected" ? "未通过审核" : ""),
        username: appRow.username ?? "",
        email: appRow.email ?? "",
        app_id: id,
        user_id: appRow.user_id,
        source: appRow.channel || "web",
      };
      const command = renderTemplate(template, ctx);
      const password = cfg.password_enc ? await decryptSecret(cfg.password_enc, getSecret(c)) : "";
      if (command && password) {
        const res = await execRcon(c, cfg.host, cfg.port, password, command, cfg.timeout);
        sync = res.ok ? "synced" : "failed";
        await c.env.DB.prepare(
          `UPDATE whitelist_applications SET sync_status = ?, sync_log = ? WHERE id = ?`,
        )
          .bind(sync, (res.ok ? `命令已执行：${command}` : `执行失败：${res.message || ""}`).slice(0, 500), id)
          .run();
        await logOp(c.env.DB, c, admin.id, "rcon_whitelist", appRow.mc_name, sync === "synced" ? command : res.message || "");
      } else {
        await c.env.DB.prepare(
          `UPDATE whitelist_applications SET sync_status = 'skipped', sync_log = ? WHERE id = ?`,
        ).bind("未配置密码或命令模板为空，跳过自动同步", id).run();
      }
    }
  }

  return ok({ updated: true, sync });
});

export default app;