import { connect } from "cloudflare:sockets";

// ============================================================
// 邮件投递：Resend API / 原生 SMTP（cloudflare:sockets）
// 配置存储在 site_settings（mail_* 键），后台「网站设置 → 邮件服务」维护
// ============================================================

export interface MailConfig {
  provider: "none" | "resend" | "smtp";
  from: string;
  resend_key: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_ssl: boolean;
}

export const MAIL_SENSITIVE_KEYS = new Set(["mail_resend_key", "mail_smtp_pass"]);

export async function loadMailConfig(db: D1Database): Promise<MailConfig> {
  const rows = await db
    .prepare("SELECT key, value FROM site_settings WHERE key LIKE 'mail_%'")
    .all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
  const provider = map.mail_provider === "resend" || map.mail_provider === "smtp" ? map.mail_provider : "none";
  return {
    provider,
    from: map.mail_from || "",
    resend_key: map.mail_resend_key || "",
    smtp_host: map.mail_smtp_host || "",
    smtp_port: Number(map.mail_smtp_port) || 587,
    smtp_user: map.mail_smtp_user || "",
    smtp_pass: map.mail_smtp_pass || "",
    smtp_ssl: map.mail_smtp_ssl === "true",
  };
}

export function mailEnabled(cfg: MailConfig): boolean {
  if (cfg.provider === "resend") return !!(cfg.from && cfg.resend_key);
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
export function renderEmail(title: string, bodyHtml: string, siteName = "Westworld西域之光"): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif;">
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
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resend_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: cfg.from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 300);
    throw new Error(`Resend 发送失败 (${resp.status})：${detail}`);
  }
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
