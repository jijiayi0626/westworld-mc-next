"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import { StatusDot, UPOP_FIELDS, type Integrations } from "./shared";

export default function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [upopForm, setUpopForm] = useState<Record<string, string>>({});
  const [upopBusy, setUpopBusy] = useState(false);
  const [msForm, setMsForm] = useState<{ enabled: boolean; client_id: string; client_secret: string }>({
    enabled: false,
    client_id: "",
    client_secret: "",
  });
  const [msBusy, setMsBusy] = useState(false);
  const [inuForm, setInuForm] = useState({ enabled: false, client_id: "", client_secret: "", scopes: "profile email", redirect_uri: "" });
  const [inuBusy, setInuBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<Integrations>("/admin/integrations");
      setIntegrations(data);
      setUpopForm((prev) => ({
        ...prev,
        upop_enabled: data.upop.enabled ? "true" : "false",
        upop_scope: data.upop.scope || "openid profile",
      }));
      setMsForm((prev) => ({ ...prev, enabled: data.microsoft.enabled }));
      setInuForm((prev) => ({
        ...prev,
        enabled: data.inu.enabled,
        scopes: data.inu.scopes || "profile email",
        redirect_uri: data.inu.redirect_uri || "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const saveInu = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInuBusy(true);
    try {
      await api("/admin/integrations/inu", {
        method: "POST",
        body: JSON.stringify({
          enabled: inuForm.enabled,
          client_id: inuForm.client_id,
          client_secret: inuForm.client_secret,
          scopes: inuForm.scopes,
          redirect_uri: inuForm.redirect_uri,
        }),
      });
      setSuccess("INU OAuth 配置已保存");
      setInuForm((p) => ({ ...p, client_id: "", client_secret: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "INU 配置保存失败");
    } finally {
      setInuBusy(false);
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

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">三方接口预留</h3>
        <p className="text-[0.82rem] text-slate-500 mb-4">微软 OAuth、UPOP 统一认证与 INU 星际通行证的绑定接口已预留完成，配置好凭据即可启用。</p>
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

            {/* INU OAuth */}
            <div className="border border-slate-100 rounded-xl p-4 flex flex-col gap-2.5 lg:col-span-2">
              <div className="font-semibold text-slate-800 flex items-center gap-2">
                <StatusDot ok={integrations.inu.enabled} label="INU 星际通行证" />
              </div>
              <div className="text-[0.82rem] text-slate-500">
                当前状态：Client ID {integrations.inu.client_id || "未配置"} · Secret{" "}
                {integrations.inu.client_secret_set ? "已配置" : "未配置"} · 已绑定 {integrations.inu.bound_users} 人
              </div>
              <form onSubmit={saveInu} className="flex flex-col gap-3 mt-1">
                <label className="flex items-center gap-2 text-[0.85rem] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inuForm.enabled}
                    onChange={(e) => setInuForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  启用 INU 账号登录（登录页显示「使用 INU 账号登录」）
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <input
                    value={inuForm.client_id}
                    onChange={(e) => setInuForm((p) => ({ ...p, client_id: e.target.value }))}
                    placeholder={integrations.inu.client_id ? `Client ID（已保存 ${integrations.inu.client_id}，留空保留）` : "INU 应用 Client ID"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                  />
                  <input
                    type="password"
                    value={inuForm.client_secret}
                    onChange={(e) => setInuForm((p) => ({ ...p, client_secret: e.target.value }))}
                    placeholder={integrations.inu.client_secret_set ? "Client Secret（已保存，留空保留）" : "Client Secret（公开客户端可留空）"}
                    autoComplete="new-password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                  />
                  <input
                    value={inuForm.scopes}
                    onChange={(e) => setInuForm((p) => ({ ...p, scopes: e.target.value }))}
                    placeholder="授权范围，默认 profile email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                  />
                  <input
                    value={inuForm.redirect_uri}
                    onChange={(e) => setInuForm((p) => ({ ...p, redirect_uri: e.target.value }))}
                    placeholder="回调地址，例如 https://站点域名/api/inu/callback"
                    className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] focus:outline-none focus:border-[color:var(--green,#10b981)]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button type="submit" disabled={inuBusy} className="px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.85rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors disabled:opacity-50 cursor-pointer">
                    {inuBusy ? "保存中..." : "保存 INU 配置"}
                  </button>
                </div>
              </form>
              <div className="text-[0.8rem] text-slate-500 mt-1">
                回调地址（填入 INU 后台）：
                <code className="block mt-1 font-mono text-[0.75rem] bg-slate-50 border border-slate-100 rounded px-2 py-1 break-all text-slate-700">
                  {integrations.inu.redirect_uri}
                </code>
              </div>
              <p className="text-[0.78rem] text-slate-400">
                保存到站点设置并即时生效，无需重新部署；Secret 仅保存在服务端，不会回传到浏览器，环境变量仍可作为回退。
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
    </>
  );
}
