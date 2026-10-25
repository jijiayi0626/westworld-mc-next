import { connect } from "cloudflare:sockets";

// ============================================================
// 邮件投递：Resend API / 原生 SMTP（cloudflare:sockets）
// 配置存储在 site_settings（mail_* 键），后台「网站设置 → 邮件服务」维护
// ============================================================

export interface MailConfig {
  provider: "none" | "resend" | "smtp";
  from: string;
  resend_key: string;
  /** 多 Key 轮换：任一 Key 失败自动切换下一个 */
  resend_keys: string[];
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_ssl: boolean;
}

export const MAIL_SENSITIVE_KEYS = new Set(["mail_resend_key", "mail_resend_keys", "mail_smtp_pass"]);

export async function loadMailConfig(db: D1Database): Promise<MailConfig> {
  const rows = await db
    .prepare("SELECT key, value FROM site_settings WHERE key LIKE 'mail_%'")
    .all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  const provider = map.mail_provider === "resend" || map.mail_provider === "smtp" ? map.mail_provider : "none";
  let resendKeys: string[] = [];
  if (map.mail_resend_keys) {
    try {
      const parsed = JSON.parse(map.mail_resend_keys);
      if (Array.isArray(parsed)) resendKeys = parsed.filter((k): k is string => typeof k === "string" && k.trim() !== "");
    } catch {
      /* 兼容旧格式：按换行拆分 */
      resendKeys = map.mail_resend_keys.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  if (resendKeys.length === 0 && map.mail_resend_key) resendKeys = [map.mail_resend_key];
  return {
    provider,
    from: map.mail_from || "",
    resend_key: resendKeys[0] || "",
    resend_keys: resendKeys,
    smtp_host: map.mail_smtp_host || "",
    smtp_port: Number(map.mail_smtp_port) || 587,
    smtp_user: map.mail_smtp_user || "",
    smtp_pass: map.mail_smtp_pass || "",
    smtp_ssl: map.mail_smtp_ssl === "true",
  };
}

export function mailEnabled(cfg: MailConfig): boolean {
  if (cfg.provider === "resend") return !!(cfg.from && cfg.resend_keys.length > 0);
  if (cfg.provider === "smtp") return !!(cfg.from && cfg.smtp_host);
  return false;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

/** 发送邮件（按配置路由到 Resend 或 SMTP），失败抛错 */
export async function sendMail(cfg: MailConfig, opts: MailOptions): Promise<void> {
  if (!mailEnabled(cfg)) throw new Error("邮件服务未配置");
  if (cfg.provider === "resend") await sendViaResend(cfg, opts);
  else await sendViaSmtp(cfg, opts);
}

/** 品牌邮件模板（绿白风格，深浅邮箱客户端均兼容的内联样式） */
export function renderEmail(title: string, bodyHtml: string, siteName = "Westworld西域之光"): string {  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:linear-gradient(135deg,#059669,#10b981);padding:22px 28px;">
  <span style="color:#ffffff;font-size:17px;font-weight:700;">${siteName}</span>
</td></tr>
<tr><td style="padding:28px;">
  <h2 style="margin:0 0 14px;color:#0f172a;font-size:18px;">${title}</h2>
  <div style="color:#475569;font-size:14px;line-height:1.75;">${bodyHtml}</div>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;">
  本邮件由服务器系统自动发送，请勿直接回复。
</td></tr>
</table>
</td></tr></table></body></html>`;
}

// ---------------- Resend ----------------

async function sendViaResend(cfg: MailConfig, opts: MailOptions): Promise<void> {
  const keys = cfg.resend_keys.length > 0 ? cfg.resend_keys : [cfg.resend_key];
  let lastError = "";
  // 多 Key 轮换：当前 Key 失败（额度用尽 / 无效）自动尝试下一个
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) continue;
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: cfg.from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (resp.ok) return;
    const detail = (await resp.text()).slice(0, 200);
    lastError = `Resend 发送失败 (${resp.status})：${detail}`;
    // 4xx（除限流 429）通常为内容/参数问题，换 Key 也无效，直接抛出
    if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) break;
  }
  throw new Error(lastError || "Resend 发送失败");
}

// ---------------- 原生 SMTP ----------------

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function encodeHeader(s: string): string {
  return `=?UTF-8?B?${utf8ToB64(s)}?=`;
}

/** 极简 SMTP 客户端：支持 465 直连 TLS 与 587 STARTTLS，AUTH LOGIN 明文凭据 */
async function sendViaSmtp(cfg: MailConfig, opts: MailOptions): Promise<void> {
  const useImplicitTls = cfg.smtp_ssl || cfg.smtp_port === 465;
  let socket = connect(
    { hostname: cfg.smtp_host, port: cfg.smtp_port },
    { secureTransport: useImplicitTls ? "on" : "starttls", allowHalfOpen: false },
  );
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";

  async function readReply(): Promise<string[]> {
    const lines: string[] = [];
    for (;;) {
      const idx = buf.indexOf("\r\n");
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        lines.push(line);
        // 多行应答形如 "250-..."，末行 "250 ..."
        if (/^\d{3}-/.test(line)) continue;
        return lines;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`SMTP 连接中断：${buf || "服务器提前关闭"}`);
      buf += dec.decode(value, { stream: true });
    }
  }

  function check(lines: string[], expects: number[], step: string): void {
    const code = parseInt(lines[lines.length - 1].slice(0, 3), 10);
    if (!expects.includes(code)) throw new Error(`SMTP ${step} 失败（${code}）：${lines.join(" / ")}`);
  }

  async function cmd(line: string, expects: number[], step: string): Promise<void> {
    await writer.write(enc.encode(line + "\r\n"));
    check(await readReply(), expects, step);
  }

  try {
    check(await readReply(), [220], "连接");

    const domain = cfg.from.split("@")[1] || "localhost";
    await cmd(`EHLO ${domain}`, [250], "EHLO");

    if (!useImplicitTls) {
      await cmd("STARTTLS", [220], "STARTTLS");
      socket = socket.startTls();
      reader = socket.readable.getReader();
      writer = socket.writable.getWriter();
      buf = "";
      await cmd(`EHLO ${domain}`, [250], "TLS 后 EHLO");
    }

    if (cfg.smtp_user && cfg.smtp_pass) {
      await cmd("AUTH LOGIN", [334], "AUTH LOGIN");
      await cmd(btoa(cfg.smtp_user), [334], "用户名");
      await cmd(btoa(cfg.smtp_pass), [235], "认证");
    }

    await cmd(`MAIL FROM:<${cfg.from}>`, [250], "MAIL FROM");
    await cmd(`RCPT TO:<${opts.to}>`, [250, 251], "RCPT TO");
    await cmd("DATA", [354], "DATA");

    const headers = [
      `From: ${encodeHeader("服务器通知")} <${cfg.from}>`,
      `To: <${opts.to}>`,
      `Subject: ${encodeHeader(opts.subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ].join("\r\n");
    const body = utf8ToB64(opts.html).replace(/(.{76})/g, "$1\r\n");
    await writer.write(enc.encode(`${headers}\r\n\r\n${body}\r\n.\r\n`));
    check(await readReply(), [250], "投递");

    await writer.write(enc.encode("QUIT\r\n"));
  } finally {
    try {
      await socket.close();
    } catch {
      /* 忽略关闭错误 */
    }
  }
}

// ---------------- 管理员事件通知 ----------------

export type MailEvent = "ticket" | "application" | "order" | "contact";

const MAIL_EVENT_DEFAULTS: Record<MailEvent, boolean> = {
  ticket: true,
  application: true,
  order: true,
  contact: true,
};

export interface MailNotifySettings {
  events: Record<MailEvent, boolean>;
  recipients: string[];
}

/** 读取事件开关与收件人；未配置收件人时回退为所有管理员账号邮箱 */
export async function loadMailNotifySettings(db: D1Database): Promise<MailNotifySettings> {
  const rows = await db
    .prepare("SELECT key, value FROM site_settings WHERE key IN ('mail_events','mail_notify_emails')")
    .all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));

  const events = { ...MAIL_EVENT_DEFAULTS };
  if (map.mail_events) {
    try {
      const parsed = JSON.parse(map.mail_events) as Record<string, unknown>;
      for (const key of Object.keys(events) as MailEvent[]) {
        if (typeof parsed[key] === "boolean") events[key] = parsed[key] as boolean;
      }
    } catch {
      // 配置损坏时使用默认全开
    }
  }

  let recipients = String(map.mail_notify_emails || "")
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  if (recipients.length === 0) {
    try {
      const admins = await db
        .prepare("SELECT email FROM users WHERE role = 'admin' AND email != '' AND email IS NOT NULL LIMIT 10")
        .all<{ email: string }>();
      recipients = admins.results.map((r) => r.email).filter(Boolean);
    } catch {
      recipients = [];
    }
  }
  return { events, recipients: Array.from(new Set(recipients)).slice(0, 10) };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 向管理员发送事件通知邮件。邮件服务未配置、事件关闭或没有收件人时静默跳过。
 * 永不抛错，调用方可直接 waitUntil。
 */
export async function notifyAdmins(db: D1Database, event: MailEvent, title: string, bodyHtml: string): Promise<void> {
  try {
    const cfg = await loadMailConfig(db);
    if (!mailEnabled(cfg)) return;
    const settings = await loadMailNotifySettings(db);
    if (!settings.events[event] || settings.recipients.length === 0) return;
    const html = renderEmail(title, bodyHtml);
    await Promise.allSettled(settings.recipients.map((to) => sendMail(cfg, { to, subject: title, html })));
  } catch {
    // 通知失败不影响主流程
  }
}
