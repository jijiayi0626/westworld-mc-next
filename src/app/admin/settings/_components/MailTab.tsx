"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Badge, Btn, Empty, ErrorNote, Field, Input, SuccessNote, TextArea } from "@/components/ui";
import { SettingsGroup, SettingsStack, SettingRow, type MailConfigView } from "./shared";

export default function MailTab() {
  const [mailCfg, setMailCfg] = useState<MailConfigView | null>(null);
  const [mailForm, setMailForm] = useState({
    provider: "none",
    from: "",
    resend_keys: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_pass: "",
    smtp_ssl: false,
  });
  const [mailBusy, setMailBusy] = useState(false);
  const [mailEvents, setMailEvents] = useState<Record<string, boolean>>({
    ticket: true,
    application: true,
    order: true,
    contact: true,
  });
  const [notifyEmails, setNotifyEmails] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<{ err: string; ok: string }>({ err: "", ok: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const mail = await api<MailConfigView>("/admin/mail-config");
      setMailCfg(mail);
      setMailForm((prev) => ({
        ...prev,
        provider: mail.provider,
        from: mail.from,
        smtp_host: mail.smtp_host,
        smtp_port: mail.smtp_port,
        smtp_user: mail.smtp_user,
        smtp_ssl: mail.smtp_ssl,
      }));
      if (mail.events) {
        setMailEvents({ ticket: true, application: true, order: true, contact: true, ...mail.events });
      }
      setNotifyEmails(mail.notify_emails || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveMail = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setMailBusy(true);
    try {
      await api("/admin/mail-config", {
        method: "POST",
        body: JSON.stringify({
          provider: mailForm.provider,
          from: mailForm.from.trim(),
          resend_keys: mailForm.resend_keys,
          smtp_host: mailForm.smtp_host.trim(),
          smtp_port: mailForm.smtp_port,
          smtp_user: mailForm.smtp_user.trim(),
          smtp_pass: mailForm.smtp_pass.trim(),
          smtp_ssl: mailForm.smtp_ssl,
          events: mailEvents,
          notify_emails: notifyEmails,
        }),
      });
      // 清空密钥输入，避免下次误覆盖
      setMailForm((p) => ({ ...p, resend_keys: "", smtp_pass: "" }));
      setSuccess("邮件服务配置已保存");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "邮件配置保存失败");
    } finally {
      setMailBusy(false);
    }
  };

  const sendTest = async () => {
    setTestMsg({ err: "", ok: "" });
    if (!testTo.trim()) {
      setTestMsg({ err: "请填写收件邮箱", ok: "" });
      return;
    }
    setMailBusy(true);
    try {
      await api("/admin/mail-test", { method: "POST", body: JSON.stringify({ to: testTo.trim() }) });
      setTestMsg({ err: "", ok: "测试邮件已发送，请查收（若未收到请检查垃圾箱）" });
    } catch (err) {
      setTestMsg({ err: err instanceof Error ? err.message : "发送失败", ok: "" });
    } finally {
      setMailBusy(false);
    }
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <SettingsStack>
        <SettingsGroup
          title="邮件服务"
          desc="用于找回密码验证码与后台批量通知的邮件投递。支持 Resend API（推荐，无需开端口）或自有 SMTP 邮箱（587 STARTTLS / 465 SSL）。"
          aside={
            mailCfg ? (
              <Badge color={mailCfg.provider !== "none" ? "green" : "gray"}>
                {mailCfg.provider === "none" ? "未启用" : mailCfg.provider === "resend" ? "Resend API" : "SMTP"}
              </Badge>
            ) : undefined
          }
        >
        {mailCfg === null ? (
          <Empty text="加载中..." />
        ) : (
          <>
            <form onSubmit={saveMail} className="settings-form">
              <SettingRow label="投递方式" wide>
                <select
                  value={mailForm.provider}
                  onChange={(e) => setMailForm((p) => ({ ...p, provider: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2 text-[0.88rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                >
                  <option value="none">关闭（不发送邮件）</option>
                  <option value="resend">Resend API</option>
                  <option value="smtp">SMTP 邮箱</option>
                </select>
              </SettingRow>
              <Field label="发件人地址" hint="如 noreply@yourdomain.com，需与邮箱服务商已验证域名一致">
                <Input value={mailForm.from} onChange={(e) => setMailForm((p) => ({ ...p, from: e.target.value }))} placeholder="noreply@yourdomain.com" />
              </Field>

              {mailForm.provider === "resend" && (
                <Field
                  label="Resend API Keys（多 Key 轮换）"
                  hint={
                    mailCfg.resend_key_set
                      ? `已保存 ${mailCfg.resend_key_count} 个 Key，留空保留原值；追加时会把新 Key 放到最前`
                      : "在 resend.com/api-keys 创建，re_ 开头。每行一个，当前 Key 失败自动切换下一个"
                  }
                >
                  <TextArea
                    value={mailForm.resend_keys}
                    onChange={(e) => setMailForm((p) => ({ ...p, resend_keys: e.target.value }))}
                    placeholder={mailCfg.resend_key_set ? "••••••（留空保留，可粘贴新 Key 追加）" : "re_xxxx\nre_yyyy"}
                    rows={3}
                  />
                </Field>
              )}

              {mailForm.provider === "smtp" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="SMTP 服务器" hint="如 smtp.qq.com / smtp.163.com">
                      <Input value={mailForm.smtp_host} onChange={(e) => setMailForm((p) => ({ ...p, smtp_host: e.target.value }))} placeholder="smtp.qq.com" />
                    </Field>
                    <Field label="端口" hint="465 = SSL 直连；587 = STARTTLS">
                      <Input type="number" min={1} max={65535} value={mailForm.smtp_port} onChange={(e) => setMailForm((p) => ({ ...p, smtp_port: Number(e.target.value) || 587 }))} />
                    </Field>
                    <Field label="SMTP 用户名" hint="通常为邮箱地址">
                      <Input value={mailForm.smtp_user} onChange={(e) => setMailForm((p) => ({ ...p, smtp_user: e.target.value }))} placeholder="you@qq.com" />
                    </Field>
                    <Field label="SMTP 密码 / 授权码" hint={mailCfg.smtp_pass_set ? "已保存，留空保留原值" : "QQ/163 等需使用授权码，非登录密码"}>
                      <Input type="password" value={mailForm.smtp_pass} onChange={(e) => setMailForm((p) => ({ ...p, smtp_pass: e.target.value }))} placeholder={mailCfg.smtp_pass_set ? "••••••（留空保留）" : "授权码"} autoComplete="new-password" />
                    </Field>
                  </div>
                  <SettingRow label="使用 SSL 直连" hint="465 端口勾选；587 端口保持关闭">
                    <input type="checkbox" checked={mailForm.smtp_ssl} onChange={(e) => setMailForm((p) => ({ ...p, smtp_ssl: e.target.checked }))} className="w-4 h-4 accent-emerald-500" />
                  </SettingRow>
                </>
              )}

              <div className="settings-subgroup">
                <div>
                  <h4 className="settings-subgroup__title">事件通知</h4>
                  <p className="text-[0.78rem] text-slate-500 mt-1">开启后，对应事件发生时会自动发送邮件提醒；未填写收件人时默认发送给所有管理员账号邮箱。</p>
                </div>
                <Field label="通知收件人" hint="每行一个邮箱，也可用逗号分隔，最多 10 个">
                  <TextArea
                    value={notifyEmails}
                    onChange={(e) => setNotifyEmails(e.target.value)}
                    placeholder="admin@example.com"
                    rows={2}
                  />
                </Field>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {([
                    { key: "ticket", label: "新工单" },
                    { key: "application", label: "入服申请" },
                    { key: "order", label: "新订单" },
                    { key: "contact", label: "联系留言" },
                  ] as const).map((ev) => (
                    <label key={ev.key} className="flex items-center gap-2 text-[0.86rem] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mailEvents[ev.key] !== false}
                        onChange={(e) => setMailEvents((p) => ({ ...p, [ev.key]: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      {ev.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Btn type="submit" disabled={mailBusy}>{mailBusy ? "保存中..." : "保存邮件配置"}</Btn>
              </div>
            </form>
          </>
        )}
        </SettingsGroup>

        <SettingsGroup title="发送测试邮件" desc="保存配置后可发送一封测试邮件，确认投递是否正常。">
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="你的收件邮箱"
                  className="flex-1 min-w-[220px] max-w-[320px] bg-slate-50 border border-slate-200 rounded-[12px] px-4 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-[color:var(--green,#10b981)]"
                />
                <button
                  type="button"
                  onClick={() => void sendTest()}
                  disabled={mailBusy}
                  className="px-4 py-2 rounded-[12px] bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[0.85rem] font-semibold hover:from-emerald-600 hover:to-green-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {mailBusy ? "发送中..." : "发送测试"}
                </button>
              </div>
              {testMsg.err && <div className="settings-error break-all">{testMsg.err}</div>}
              {testMsg.ok && <div className="mt-3 px-4 py-2.5 rounded-[12px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.85rem]">{testMsg.ok}</div>}
        </SettingsGroup>
      </SettingsStack>
    </>
  );
}
