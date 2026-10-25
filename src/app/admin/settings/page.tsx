"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote, TextArea } from "@/components/ui";

interface Setting {
  key: string;
  value: string;
}

interface Integrations {
  microsoft: {
    enabled: boolean;
    client_id: string;
    client_secret_set: boolean;
    callback_url: string;
  };
  upop: {
    enabled: boolean;
    client_id: string;
    client_secret_set: boolean;
    authorize_url: string;
    token_url: string;
    userinfo_url: string;
    scope: string;
    callback_url: string;
  };
}

const UPOP_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "upop_enabled", label: "启用 UPOP 绑定", hint: "true / false" },
  { key: "upop_client_id", label: "Client ID" },
  { key: "upop_client_secret", label: "Client Secret" },
  { key: "upop_authorize_url", label: "授权端点", hint: "https://.../oauth2/authorize" },
  { key: "upop_token_url", label: "令牌端点", hint: "https://.../oauth2/token" },
  { key: "upop_userinfo_url", label: "用户信息端点", hint: "https://.../oauth2/userinfo" },
  { key: "upop_scope", label: "授权 Scope", hint: "默认 openid profile" },
  { key: "upop_user_id_field", label: "用户 ID 字段", hint: "userinfo 中的唯一 ID 字段，默认 id" },
  { key: "upop_username_field", label: "用户名字段", hint: "默认 username" },
];

type Tab = "basic" | "appearance" | "forum" | "mail" | "payment" | "integrations";

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: "basic", label: "基础配置", desc: "站点键值配置的新增与编辑（维护模式、功能开关等）" },
  { key: "appearance", label: "外观模板", desc: "切换前台页面模板，保存后前台即时生效，无需重新部署" },
  { key: "forum", label: "论坛与聊天", desc: "论坛 Tab 显隐、聊天室开关、欢迎公告与发送限制" },
  { key: "mail", label: "邮件服务", desc: "接入 Resend 或 SMTP，用于找回密码验证码与批量通知投递" },
  { key: "payment", label: "支付配置", desc: "接入易支付（Epay 通用协议），支持支付宝 / 微信 / QQ 钱包" },
  { key: "integrations", label: "三方集成", desc: "微软 OAuth 与 UPOP 统一认证的凭据配置" },
];

// 前台可选模板（取值写入 site_settings.frontend_theme）
const FRONT_THEMES: { key: "v1" | "v2"; name: string; desc: string; swatch: string[] }[] = [
  {
    key: "v1",
    name: "模板一 · 经典",
    desc: "深色玻璃质感 + 翠绿点缀，全屏 Hero 大图与卡片式区块，信息密度高、氛围浓厚。",
    swatch: ["#0f172a", "#10b981", "#ffffff"],
  },
  {
    key: "v2",
    name: "模板二 · 暗夜绿光",
    desc: "极夜底色 + 网格霓虹绿光，序号化窄栏排版、数据化状态条，更克制现代的科技风。",
    swatch: ["#05080a", "#2ce88a", "#35d6d0"],
  },
];

function StatusDot({ ok: good, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.85rem]">
      <span className={`w-2 h-2 rounded-full ${good ? "bg-emerald-500" : "bg-slate-300"}`} />
      <span className={good ? "text-slate-800" : "text-slate-400"}>{label}</span>
    </span>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("basic");
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [upopForm, setUpopForm] = useState<Record<string, string>>({});
  const [upopBusy, setUpopBusy] = useState(false);
  const [msForm, setMsForm] = useState<{ enabled: boolean; client_id: string; client_secret: string }>({
    enabled: false,
    client_id: "",
    client_secret: "",
  });
  const [msBusy, setMsBusy] = useState(false);

  const [chatCfg, setChatCfg] = useState<{ enabled: boolean; welcome: string; max_text: number; max_image_mb: number; show_announcements: boolean; show_chat: boolean } | null>(null);
  const [chatForm, setChatForm] = useState({ enabled: true, welcome: "", max_text: 400, max_image_mb: 4, show_announcements: true, show_chat: true });
  const [chatBusy, setChatBusy] = useState(false);

  // 邮件服务配置
  interface MailConfigView {
    provider: string;
    from: string;
    resend_key_set: boolean;
    resend_key_count: number;
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass_set: boolean;
    smtp_ssl: boolean;
    events?: Record<string, boolean>;
    notify_emails?: string;
  }
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

  // 易支付配置
  interface PayConfigView {
    enabled: boolean;
    api_url: string;
    pid: string;
    key_set: boolean;
    types: string[];
    sitename: string;
    configured: boolean;
    types_available: { key: string; label: string }[];
    notify_url: string;
    return_url: string;
  }
  const [payCfg, setPayCfg] = useState<PayConfigView | null>(null);
  const [payForm, setPayForm] = useState({
    enabled: false,
    api_url: "",
    pid: "",
    key: "",
    sitename: "",
    types: ["alipay", "wxpay", "qqpay"],
  });
  const [payBusy, setPayBusy] = useState(false);
  const [payTest, setPayTest] = useState<{ err: string; ok: string }>({ err: "", ok: "" });

  // 前台外观模板（frontend_theme：v1 / v2）
  const [themeBusy, setThemeBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Setting[]>("/admin/settings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
    try {
      const data = await api<Integrations>("/admin/integrations");
      setIntegrations(data);
      setUpopForm((prev) => ({
        ...prev,
        upop_enabled: data.upop.enabled ? "true" : "false",
        upop_scope: data.upop.scope || "openid profile",
      }));
      setMsForm((prev) => ({ ...prev, enabled: data.microsoft.enabled }));
    } catch {
      /* 接口预留状态加载失败不阻塞页面 */
    }
    try {
      const chat = await api<{ enabled: boolean; welcome: string; max_text: number; max_image_mb: number; show_announcements: boolean; show_chat: boolean }>("/admin/chat-config");
      setChatCfg(chat);
      setChatForm({
        enabled: chat.enabled,
        welcome: chat.welcome,
        max_text: chat.max_text,
        max_image_mb: chat.max_image_mb,
        show_announcements: chat.show_announcements !== false,
        show_chat: chat.show_chat !== false,
      });
    } catch {
      /* 聊天室配置加载失败不阻塞页面 */
    }
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
    } catch {
      /* 邮件配置加载失败不阻塞页面 */
    }
    try {
      const pay = await api<PayConfigView>("/admin/pay-config");
      setPayCfg(pay);
      setPayForm((prev) => ({
        ...prev,
        enabled: pay.enabled,
        api_url: pay.api_url,
        pid: pay.pid,
        sitename: pay.sitename,
        types: pay.types.length > 0 ? pay.types : pay.types_available.map((t) => t.key),
      }));
    } catch {
      /* 支付配置加载失败不阻塞页面 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingKey(null);
    setKey("");
    setValue("");
  };

  const startEdit = (s: Setting) => {
    setEditingKey(s.key);
    setKey(s.key);
    setValue(s.value);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/settings", { method: "POST", body: JSON.stringify({ key: key.trim(), value }) });
      setSuccess(`已保存 ${key}`);
      startNew();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveMs = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setMsBusy(true);
    try {
      await api("/admin/integrations/microsoft", {
        method: "POST",
        body: JSON.stringify({ enabled: msForm.enabled, client_id: msForm.client_id, client_secret: msForm.client_secret }),
      });
      setSuccess("微软 OAuth 配置已保存");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "微软配置保存失败");
    } finally {
      setMsBusy(false);
    }
  };

  const saveChat = async () => {
    setError("");
    setSuccess("");
    setChatBusy(true);
    try {
      const saved = await api<{ enabled: boolean; welcome: string; max_text: number; max_image_mb: number; show_announcements: boolean; show_chat: boolean }>("/admin/chat-config", {
        method: "POST",
        body: JSON.stringify(chatForm),
      });
      setChatCfg(saved);
      setSuccess("聊天室配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "聊天室配置保存失败");
    } finally {
      setChatBusy(false);
    }
  };

  const saveUpop = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const entries = Object.entries(upopForm).filter(([, v]) => v !== "" && v !== undefined);
    if (entries.length === 0) return;
    setUpopBusy(true);
    try {
      for (const [k, v] of entries) {
        await api("/admin/settings", { method: "POST", body: JSON.stringify({ key: k, value: v }) });
      }
      setSuccess("UPOP 配置已保存");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "UPOP 配置保存失败");
    } finally {
      setUpopBusy(false);
    }
  };

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

  const savePay = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setPayTest({ err: "", ok: "" });
    setPayBusy(true);
    try {
      const saved = await api<PayConfigView>("/admin/pay-config", {
        method: "POST",
        body: JSON.stringify({
          enabled: payForm.enabled,
          api_url: payForm.api_url.trim(),
          pid: payForm.pid.trim(),
          key: payForm.key.trim(),
          sitename: payForm.sitename.trim(),
          types: payForm.types,
        }),
      });
      setPayCfg(saved);
      setPayForm((p) => ({ ...p, key: "" }));
      setSuccess("支付配置已保存");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付配置保存失败");
    } finally {
      setPayBusy(false);
    }
  };

  const testPay = async () => {
    setPayTest({ err: "", ok: "" });
    setPayBusy(true);
    try {
      const r = await api<{ reachable: boolean; status: number }>("/admin/pay-config/test", { method: "POST" });
      setPayTest({ err: "", ok: `接口可达（HTTP ${r.status}），可以正常发起支付` });
    } catch (err) {
      setPayTest({ err: err instanceof Error ? err.message : "连通性测试失败", ok: "" });
    } finally {
      setPayBusy(false);
    }
  };

  const filteredList = (list ?? []).filter((s) => !keyword || `${s.key} ${s.value}`.toLowerCase().includes(keyword.toLowerCase()));

  const currentTheme = list?.find((s) => s.key === "frontend_theme")?.value === "v2" ? "v2" : "v1";

  const saveTheme = async (next: "v1" | "v2") => {
    if (next === currentTheme || themeBusy) return;
    setError("");
    setSuccess("");
    setThemeBusy(true);
    try {
      await api("/admin/settings", {
        method: "POST",
        body: JSON.stringify({ key: "frontend_theme", value: next }),
      });
      setSuccess(`前台模板已切换到「${next === "v2" ? "模板二 · 暗夜绿光" : "模板一 · 经典"}」，前台刷新后即刻生效`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换失败");
    } finally {
      setThemeBusy(false);
    }
  };

  return (
    <AdminShell>
      <PageHeader title="网站设置" desc="站点键值配置、论坛聊天与三方集成" />

      <div className="flex gap-2 mb-5 p-1 bg-slate-50 rounded-[10px] w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all cursor-pointer ${
              tab === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-[0.82rem] text-slate-500 -mt-2 mb-4">{TABS.find((t) => t.key === tab)?.desc}</p>

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      {tab === "basic" ? (
        <>
          <Card className="mb-5">
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingKey ? `编辑设置 ${editingKey}` : "新增 / 编辑设置"}</h3>
            <form onSubmit={save} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <Field label="Key" hint="不能以 reset_code: 开头">
                  <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="如 site_title / maintenance" maxLength={100} required />
                </Field>
                <Field label="Value">
                  <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="值" maxLength={10000} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
                {editingKey && <Btn type="button" variant="ghost" onClick={startNew}>取消编辑</Btn>}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-[1.05rem] font-bold text-slate-800">现有设置</h3>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索 Key / 值..."
                className="w-full sm:w-[260px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
              />
            </div>
            {list === null ? (
              <Empty text="加载中..." />
            ) : filteredList.length === 0 ? (
              <Empty text={list.length === 0 ? "暂无设置" : "没有匹配的设置"} />
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {filteredList.map((s) => (
                  <div key={s.key} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[0.85rem] text-emerald-700 break-all">{s.key}</div>
                      <div className="mt-1 text-[0.85rem] text-slate-600 break-all">{s.value}</div>
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => startEdit(s)}>编辑</Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : tab === "appearance" ? (
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">前台页面模板</h3>
          <p className="text-[0.85rem] text-slate-500 mb-5">
            选择前台展示使用的页面模板，保存后前台刷新即可切换，无需重新部署。已访问过的访客会缓存上次模板以避免首屏闪烁。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FRONT_THEMES.map((t) => {
              const isCurrent = currentTheme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={themeBusy}
                  onClick={() => saveTheme(t.key)}
                  className={`text-left rounded-[14px] border-2 p-5 transition-all ${
                    isCurrent ? "border-accent-emerald bg-emerald-50/60" : "border-slate-200 hover:border-slate-300"
                  } ${themeBusy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[1rem] font-bold text-slate-800">{t.name}</span>
                    {isCurrent && <Badge color="green">使用中</Badge>}
                  </div>
                  <p className="text-[0.85rem] text-slate-500 leading-relaxed">{t.desc}</p>
                  <div className="mt-4 flex gap-2">
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        className="w-6 h-6 rounded-full border border-black/10"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      ) : tab === "forum" ? (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[1.05rem] font-bold text-slate-800">论坛与聊天室</h3>
            {chatCfg && <Badge color={chatCfg.enabled ? "green" : "gray"}>{chatCfg.enabled ? "已启用" : "已关闭"}</Badge>}
          </div>
          <p className="text-[0.82rem] text-slate-500 mb-4">
            用户中心「论坛」包含公告与聊天两个 Tab；此处控制整体开关、Tab 显隐与发送限制，保存后即时生效。
          </p>
          {chatCfg === null ? (
            <Empty text="加载中..." />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveChat();
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatForm.enabled}
                    onChange={(e) => setChatForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  启用聊天室（关闭后用户只能浏览）
                </label>
                <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatForm.show_announcements}
                    onChange={(e) => setChatForm((p) => ({ ...p, show_announcements: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  显示「公告」Tab
                </label>
                <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatForm.show_chat}
                    onChange={(e) => setChatForm((p) => ({ ...p, show_chat: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  显示「聊天」Tab
                </label>
              </div>
              <Field label="欢迎公告" hint="显示在聊天消息区顶部，留空不显示，最长 200 字">
                <Input
                  value={chatForm.welcome}
                  onChange={(e) => setChatForm((p) => ({ ...p, welcome: e.target.value }))}
                  maxLength={200}
                  placeholder="如：欢迎来到聊天室！文明发言，禁止刷屏与广告。"
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="单条消息字数上限" hint="20 - 1000 字">
                  <Input
                    type="number"
                    min={20}
                    max={1000}
                    value={chatForm.max_text}
                    onChange={(e) => setChatForm((p) => ({ ...p, max_text: Number(e.target.value) || 400 }))}
                  />
                </Field>
                <Field label="单张图片大小上限（MB）" hint="1 - 8 MB">
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={chatForm.max_image_mb}
                    onChange={(e) => setChatForm((p) => ({ ...p, max_image_mb: Number(e.target.value) || 4 }))}
                  />
                </Field>
              </div>
              <div>
                <Btn type="submit" disabled={chatBusy}>{chatBusy ? "保存中..." : "保存设置"}</Btn>
              </div>
            </form>
          )}
        </Card>
      ) : tab === "mail" ? (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[1.05rem] font-bold text-slate-800">邮件服务</h3>
            {mailCfg && <Badge color={mailCfg.provider !== "none" ? "green" : "gray"}>{mailCfg.provider === "none" ? "未启用" : mailCfg.provider === "resend" ? "Resend API" : "SMTP"}</Badge>}
          </div>
          <p className="text-[0.82rem] text-slate-500 mb-4">
            用于找回密码验证码与后台批量通知的邮件投递。支持 Resend API（推荐，无需开端口）或自有 SMTP 邮箱（587 STARTTLS / 465 SSL）。
          </p>
          {mailCfg === null ? (
            <Empty text="加载中..." />
          ) : (
            <>
              <form onSubmit={saveMail} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="投递方式">
                    <select
                      value={mailForm.provider}
                      onChange={(e) => setMailForm((p) => ({ ...p, provider: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.88rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                    >
                      <option value="none">关闭（不发送邮件）</option>
                      <option value="resend">Resend API</option>
                      <option value="smtp">SMTP 邮箱</option>
                    </select>
                  </Field>
                  <Field label="发件人地址" hint="如 noreply@yourdomain.com，需与邮箱服务商已验证域名一致">
                    <Input value={mailForm.from} onChange={(e) => setMailForm((p) => ({ ...p, from: e.target.value }))} placeholder="noreply@yourdomain.com" />
                  </Field>
                </div>

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
                    <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={mailForm.smtp_ssl} onChange={(e) => setMailForm((p) => ({ ...p, smtp_ssl: e.target.checked }))} className="w-4 h-4 accent-emerald-500" />
                      使用 SSL 直连（465 端口勾选）
                    </label>
                  </>
                )}

                <div className="border-t border-slate-100 pt-4 flex flex-col gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-800 text-[0.95rem]">事件通知</h4>
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

              {/* 测试发送 */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 mb-3 text-[0.95rem]">发送测试邮件</h4>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="你的收件邮箱"
                    className="flex-1 min-w-[220px] max-w-[320px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-[color:var(--green,#10b981)]"
                  />
                  <button
                    type="button"
                    onClick={() => void sendTest()}
                    disabled={mailBusy}
                    className="px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.85rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {mailBusy ? "发送中..." : "发送测试"}
                  </button>
                </div>
                {testMsg.err && <div className="mt-3 px-3.5 py-2.5 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[0.85rem] break-all">{testMsg.err}</div>}
                {testMsg.ok && <div className="mt-3 px-3.5 py-2.5 rounded-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.85rem]">{testMsg.ok}</div>}
              </div>
            </>
          )}
        </Card>
      ) : tab === "payment" ? (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[1.05rem] font-bold text-slate-800">易支付（Epay）</h3>
            {payCfg && (
              <Badge color={payCfg.configured ? "green" : payCfg.enabled ? "yellow" : "gray"}>
                {payCfg.configured ? "已配置可用" : payCfg.enabled ? "已启用（配置不完整）" : "未启用"}
              </Badge>
            )}
          </div>
          <p className="text-[0.82rem] text-slate-500 mb-4">
            兼容主流易支付服务商的通用协议。用户在商城下单后可直接跳转支付宝 / 微信 / QQ 钱包收银台，支付成功由服务端异步通知自动更新订单状态。
          </p>
          {payCfg === null ? (
            <Empty text="加载中..." />
          ) : (
            <form onSubmit={savePay} className="flex flex-col gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={payForm.enabled}
                  onChange={(e) => setPayForm((p) => ({ ...p, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-[0.9rem] font-medium text-slate-700">启用在线支付</span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="接口地址" hint="易支付站点根地址，如 https://pay.example.com（不要带 submit.php）">
                  <Input
                    value={payForm.api_url}
                    onChange={(e) => setPayForm((p) => ({ ...p, api_url: e.target.value }))}
                    placeholder="https://pay.example.com"
                  />
                </Field>
                <Field label="商户 PID" hint="易支付后台的商户 ID">
                  <Input
                    value={payForm.pid}
                    onChange={(e) => setPayForm((p) => ({ ...p, pid: e.target.value }))}
                    placeholder="1001"
                  />
                </Field>
                <Field label="商户密钥" hint={payCfg.key_set ? "已保存，留空保留原值" : "用于 MD5 签名校验，务必与服务端一致"}>
                  <Input
                    type="password"
                    value={payForm.key}
                    onChange={(e) => setPayForm((p) => ({ ...p, key: e.target.value }))}
                    placeholder={payCfg.key_set ? "••••••（留空保留）" : "商户密钥"}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="站点名称" hint="显示在收银台">
                  <Input
                    value={payForm.sitename}
                    onChange={(e) => setPayForm((p) => ({ ...p, sitename: e.target.value }))}
                    placeholder="Westworld西域之光"
                    maxLength={60}
                  />
                </Field>
              </div>

              <Field label="启用的支付方式" hint="至少选择一种">
                <div className="flex flex-wrap gap-4 pt-1">
                  {payCfg.types_available.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={payForm.types.includes(t.key)}
                        onChange={(e) =>
                          setPayForm((p) => ({
                            ...p,
                            types: e.target.checked ? [...p.types, t.key] : p.types.filter((x) => x !== t.key),
                          }))
                        }
                        className="w-4 h-4 accent-emerald-600"
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </Field>

              <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3.5 text-[0.8rem] text-slate-600 leading-relaxed">
                <div className="font-semibold text-slate-700 mb-1.5">回调地址（无需手动填写，已自动生成）</div>
                <div className="font-mono text-[0.75rem] break-all text-slate-700">{payCfg.notify_url}</div>
                <div className="font-mono text-[0.75rem] break-all text-slate-700 mt-1">{payCfg.return_url}</div>
                <p className="mt-2 text-slate-500">
                  若服务商要求单独填写通知地址，请填写上面的 notify 地址；接口地址只填根域名。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Btn type="submit" disabled={payBusy}>{payBusy ? "保存中..." : "保存支付配置"}</Btn>
                <Btn type="button" variant="ghost" onClick={() => void testPay()} disabled={payBusy}>
                  测试接口连通性
                </Btn>
              </div>
              {payTest.err && <div className="px-3.5 py-2.5 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[0.85rem] break-all">{payTest.err}</div>}
              {payTest.ok && <div className="px-3.5 py-2.5 rounded-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.85rem]">{payTest.ok}</div>}
            </form>
          )}
        </Card>
      ) : (
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">三方接口预留</h3>
          <p className="text-[0.82rem] text-slate-500 mb-4">微软 OAuth 与 UPOP 统一认证的绑定接口已预留完成，配置好凭据即可启用。</p>
          {integrations === null ? (
            <Empty text="加载中..." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* 微软 OAuth */}
              <div className="border border-slate-100 rounded-xl p-4 flex flex-col gap-2.5">
                <div className="font-semibold text-slate-800 flex items-center gap-2">
                  <StatusDot ok={integrations.microsoft.enabled} label="微软 OAuth" />
                </div>
                <div className="text-[0.82rem] text-slate-500">
                  当前状态：Client ID {integrations.microsoft.client_id || "未配置"}
                  {integrations.microsoft.client_id && integrations.microsoft.client_secret_set ? " · Secret 已配置" : ""}
                </div>
                <form onSubmit={saveMs} className="flex flex-col gap-3 mt-1">
                  <label className="flex items-center gap-2 text-[0.85rem] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={msForm.enabled}
                      onChange={(e) => setMsForm((p) => ({ ...p, enabled: e.target.checked }))}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    启用微软账号绑定
                  </label>
                  <div className="grid grid-cols-1 gap-2.5">
                    <input
                      value={msForm.client_id}
                      onChange={(e) => setMsForm((p) => ({ ...p, client_id: e.target.value }))}
                      placeholder={integrations.microsoft.client_id ? `Client ID（已保存 ${integrations.microsoft.client_id}，留空保留）` : "Azure 应用 Client ID"}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                    />
                    <input
                      type="password"
                      value={msForm.client_secret}
                      onChange={(e) => setMsForm((p) => ({ ...p, client_secret: e.target.value }))}
                      placeholder={integrations.microsoft.client_secret_set ? "Client Secret（已保存，留空保留）" : "Azure 应用 Client Secret"}
                      autoComplete="new-password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={msBusy} className="px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.85rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors disabled:opacity-50 cursor-pointer">
                      {msBusy ? "保存中..." : "保存微软配置"}
                    </button>
                  </div>
                </form>
                <div className="text-[0.8rem] text-slate-500 mt-1">
                  回调地址（填入 Azure 应用注册）：
                  <code className="block mt-1 font-mono text-[0.75rem] bg-slate-50 border border-slate-100 rounded px-2 py-1 break-all text-slate-700">
                    {integrations.microsoft.callback_url}
                  </code>
                </div>
              </div>

              {/* UPOP */}
              <div className="border border-slate-100 rounded-xl p-4 flex flex-col gap-2">
                <div className="font-semibold text-slate-800 flex items-center gap-2">
                  <StatusDot ok={integrations.upop.enabled} label="UPOP 统一认证" />
                </div>
                <div className="text-[0.8rem] text-slate-500">
                  回调地址：
                  <code className="block mt-1 font-mono text-[0.75rem] bg-slate-50 border border-slate-100 rounded px-2 py-1 break-all text-slate-700">
                    {integrations.upop.callback_url}
                  </code>
                </div>
                <p className="text-[0.78rem] text-slate-400">
                  下方配置保存到站点设置中，即时生效、无需重新部署。全部填好后将「启用」设为 true。
                </p>
              </div>
            </div>
          )}

          {/* UPOP 快速配置 */}
          <form onSubmit={saveUpop} className="mt-5 pt-4 border-t border-slate-100">
            <h4 className="font-semibold text-slate-800 mb-3 text-[0.95rem]">UPOP 快速配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {UPOP_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input
                    value={upopForm[f.key] ?? ""}
                    onChange={(e) => setUpopForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.key}
                  />
                </Field>
              ))}
            </div>
            <div className="mt-4">
              <Btn type="submit" disabled={upopBusy}>{upopBusy ? "保存中..." : "保存 UPOP 配置"}</Btn>
            </div>
          </form>
        </Card>
      )}

      {/* 高级设置说明 */}
      <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mt-5">
        <details className="group">
          <summary className="cursor-pointer flex items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 list-none [&::-webkit-details-marker]:hidden">
            高级设置
            <span className="text-[0.82rem] text-slate-400 font-normal">可信反代 / CDN 出口段、图标与横幅等</span>
          </summary>
          <div className="px-5 pb-4 text-[0.85rem] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
            <p>· 网站标题、描述、服务器 IP、LOGO、ICO 图标等站点信息在「内容管理」中编辑。</p>
            <p>· 站点键值配置可在「基础配置」中新增 / 编辑（如维护模式、功能开关），不能以 <code className="font-mono bg-slate-100 px-1 rounded">reset_code:</code> 开头。</p>
            <p>· 若站点部署在反向代理 / CDN 之后，相关出口 IP 段需在部署层（Cloudflare / Nginx）配置，本站不额外存储。</p>
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
