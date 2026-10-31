"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import type { Setting } from "./shared";

export default function BasicTab() {
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Setting[]>("/admin/settings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
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

  const filteredList = (list ?? []).filter(
    (s) => !keyword || `${s.key} ${s.value}`.toLowerCase().includes(keyword.toLowerCase()),
  );

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card className="mb-5">
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">
          {editingKey ? `编辑设置 ${editingKey}` : "新增 / 编辑设置"}
        </h3>
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
    </>
  );
}
