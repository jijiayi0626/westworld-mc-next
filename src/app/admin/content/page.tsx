"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, SuccessNote, TextArea } from "@/components/ui";

interface ContentRow {
  page: string;
  field: string;
  value: string;
}

const pageOptions = [
  "home",
  "about",
  "features",
  "specs",
  "gallery",
  "team",
  "help",
  "contact",
  "community",
  "site",
];

export default function AdminContentPage() {
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 编辑态
  const [page, setPage] = useState("home");
  const [field, setField] = useState("");
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await api<ContentRow[]>("/content/"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped: Record<string, ContentRow[]> = {};
  if (rows) {
    for (const r of rows) {
      (grouped[r.page] ||= []).push(r);
    }
  }

  const startEdit = (r: ContentRow) => {
    setPage(r.page);
    setField(r.field);
    setValue(r.value);
    setError("");
    setSuccess("");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/content/admin/set", { method: "POST", body: JSON.stringify({ page, field: field.trim(), value }) });
      setSuccess(`已保存 ${page}.${field}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: ContentRow) => {
    setError("");
    setSuccess("");
    try {
      await api("/content/admin/delete", { method: "POST", body: JSON.stringify({ page: r.page, field: r.field }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <AdminShell>
      <PageHeader title="内容管理" desc="站点各页面动态内容（前台内容取自静态数据，此表供 CMS 备用）" />

      <Card className="mb-5">
        <h3 className="text-[1.05rem] font-bold text-white mb-4">新增 / 编辑内容</h3>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
            <Field label="页面">
              <Select value={page} onChange={(e) => setPage(e.target.value)}>
                {pageOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="字段名" hint="如 title、subtitle、ip、qq_group 等">
              <Input value={field} onChange={(e) => setField(e.target.value)} placeholder="field" maxLength={50} required />
            </Field>
          </div>
          <Field label="内容">
            <TextArea value={value} onChange={(e) => setValue(e.target.value)} placeholder="内容" maxLength={50000} />
          </Field>
          <ErrorNote message={error} />
          <SuccessNote message={success} />
          <div>
            <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
          </div>
        </form>
      </Card>

      {rows === null ? (
        <Empty text="加载中..." />
      ) : Object.keys(grouped).length === 0 ? (
        <Empty text="暂无内容" />
      ) : (
        <div className="flex flex-col gap-5">
          {Object.entries(grouped).map(([p, list]) => (
            <Card key={p}>
              <h3 className="text-[1rem] font-bold text-white mb-3 font-mono">{p}</h3>
              <div className="flex flex-col divide-y divide-white/10">
                {list.map((r) => (
                  <div key={`${r.page}.${r.field}`} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[0.82rem] text-accent-emerald">{r.field}</div>
                      <div className="mt-1 text-[0.85rem] text-slate-300 truncate">{r.value}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Btn size="sm" variant="ghost" onClick={() => startEdit(r)}>编辑</Btn>
                      <Btn size="sm" variant="danger" onClick={() => remove(r)}>删除</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
