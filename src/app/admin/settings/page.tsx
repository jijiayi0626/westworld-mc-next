"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote } from "@/components/ui";

interface Setting {
  key: string;
  value: string;
}

export default function AdminSettingsPage() {
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);

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

  return (
    <AdminShell>
      <PageHeader title="站点设置" desc="键值对形式的站点配置" />

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
          <ErrorNote message={error} />
          <SuccessNote message={success} />
          <div className="flex gap-2">
            <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
            {editingKey && <Btn type="button" variant="ghost" onClick={startNew}>取消</Btn>}
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">现有设置</h3>
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无设置" />
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {list.map((s) => (
              <div key={s.key} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[0.85rem] text-accent-emerald">{s.key}</div>
                  <div className="mt-1 text-[0.85rem] text-slate-600 truncate">{s.value}</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => startEdit(s)}>编辑</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
