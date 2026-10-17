"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote } from "@/components/ui";

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

type Tab = "basic" | "forum" | "integrations";

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: "basic", label: "基础配置", desc: "站点键值配置的新增与编辑（维护模式、功能开关等）" },
  { key: "forum", label: "论坛与聊天", desc: "论坛 Tab 显隐、聊天室开关、欢迎公告与发送限制" },
  { key: "integrations", label: "三方集成", desc: "微软 OAuth 与 UPOP 统一认证的凭据配置" },
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

  const filteredList = (list ?? []).filter((s) => !keyword || `${s.key} ${s.value}`.toLowerCase().includes(keyword.toLowerCase()));

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
                      className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[#10b981]"
                    />
                    <input
                      type="password"
                      value={msForm.client_secret}
                      onChange={(e) => setMsForm((p) => ({ ...p, client_secret: e.target.value }))}
                      placeholder={integrations.microsoft.client_secret_set ? "Client Secret（已保存，留空保留）" : "Azure 应用 Client Secret"}
                      autoComplete="new-password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[#10b981]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={msBusy} className="px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.85rem] font-semibold hover:bg-[#059669] transition-colors disabled:opacity-50 cursor-pointer">
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
