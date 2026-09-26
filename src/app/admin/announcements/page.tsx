"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, Select, StatusBadge, SuccessNote, TextArea, fmtTime } from "@/components/ui";

interface Announcement {
  id: number;
  title: string;
  status: string;
  created_at: string;
  published_at: string | null;
}

export default function AdminAnnouncementsPage() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 编辑态：editingId 为空表示新建
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");

  const load = useCallback(async () => {
    try {
      setList(await api<Announcement[]>("/announce/admin/list"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setStatus("draft");
  };

  const startEdit = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      const a = await api<{ id: number; title: string; content: string; status: string }>(`/announce/admin/${id}`);
      setEditingId(id);
      setTitle(a.title);
      setContent(a.content);
      setStatus(a.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const body = { title: title.trim(), content: content.trim(), status };
      if (editingId) {
        await api(`/announce/admin/update`, { method: "POST", body: JSON.stringify({ ...body, id: editingId }) });
        setSuccess("公告已更新");
      } else {
        await api("/announce/admin/create", { method: "POST", body: JSON.stringify(body) });
        setSuccess("公告已创建");
        startCreate();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api("/announce/admin/delete", { method: "POST", body: JSON.stringify({ id }) });
      if (editingId === id) startCreate();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[1.35rem] font-bold text-slate-900">公告管理</h1>
          <Btn variant="ghost" onClick={startCreate}>{editingId ? "取消编辑" : "发布 / 编辑公告"}</Btn>
        </div>

        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingId ? `编辑公告 #${editingId}` : "新建公告"}</h3>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
            <Field label="标题">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="公告标题" maxLength={100} required />
            </Field>
            <Field label="状态">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">草稿</option>
                <option value="published">发布</option>
                {editingId && <option value="archived">归档</option>}
              </Select>
            </Field>
          </div>
          <Field label="内容">
            <TextArea value={content} onChange={(e) => setContent(e.target.value)} placeholder="公告正文" maxLength={20000} required />
          </Field>
          <ErrorNote message={error} />
          <SuccessNote message={success} />
          <div className="flex gap-2">
            <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
            {editingId && <Btn type="button" variant="ghost" onClick={startCreate}>取消编辑</Btn>}
          </div>
        </form>
      </Card>

        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">公告列表
            <span className="ml-2 text-[0.82rem] font-normal text-slate-400">{list === null ? "" : `共 ${list.length} 条`}</span>
          </h3>
          {list === null ? (
            <Empty text="加载中..." />
          ) : list.length === 0 ? (
            <Empty text="暂无公告，点击右上角发布" />
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {list.map((a) => (
              <div key={a.id} className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-slate-800 font-medium truncate">{a.title}</div>
                  <div className="mt-1 text-[0.78rem] text-slate-500">
                    {fmtTime(a.created_at)}
                    {a.published_at && <span className="ml-3">发布于 {fmtTime(a.published_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={a.status} />
                  <Btn size="sm" variant="ghost" onClick={() => startEdit(a.id)}>编辑</Btn>
                  <Btn size="sm" variant="danger" onClick={() => remove(a.id)}>删除</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      </div>
    </AdminShell>
  );
}
