"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote, TextArea } from "@/components/ui";

interface Announcement {
  id: number;
  title: string;
  content: string;
  author_name: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 论坛管理：公告发布 / 编辑 / 置顶 / 删除（存论坛独立 D1，用户中心论坛页展示） */
export default function AdminForumPage() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Announcement[]>("/forum/announcements"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setPinned(false);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setPinned(a.pinned === 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (editingId) {
        await api(`/forum/admin/announcements/${editingId}`, { method: "PUT", body: JSON.stringify({ title, content, pinned }) });
        setSuccess("公告已更新");
      } else {
        await api("/forum/admin/announcements", { method: "POST", body: JSON.stringify({ title, content, pinned }) });
        setSuccess("公告已发布");
      }
      startNew();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Announcement) => {
    if (!confirm(`确定删除公告「${a.title}」？`)) return;
    try {
      await api(`/forum/admin/announcements/${a.id}`, { method: "DELETE" });
      setSuccess("已删除");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <PageHeader title="论坛管理" desc="用户中心「论坛」页公告的发布与管理；公告存储于论坛独立数据库" />

        <ErrorNote message={error} />
        <SuccessNote message={success} />

        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingId ? `编辑公告 #${editingId}` : "发布公告"}</h3>
          <form onSubmit={save} className="flex flex-col gap-4">
            <Field label="标题">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="公告标题" required />
            </Field>
            <Field label="内容">
              <TextArea value={content} onChange={(e) => setContent(e.target.value)} maxLength={10000} rows={6} placeholder="公告正文，支持换行" required />
            </Field>
            <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
              置顶显示
            </label>
            <div className="flex gap-2">
              <Btn type="submit" disabled={busy}>{busy ? "保存中..." : editingId ? "保存修改" : "发布公告"}</Btn>
              {editingId && <Btn type="button" variant="ghost" onClick={startNew}>取消编辑</Btn>}
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">已发布公告</h3>
          {list === null ? (
            <Empty text="加载中..." />
          ) : list.length === 0 ? (
            <Empty text="暂无公告，发布第一条吧" />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {list.map((a) => (
                <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.pinned === 1 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[0.66rem] font-semibold flex-shrink-0">置顶</span>
                      )}
                      <span className="text-[0.92rem] font-semibold text-slate-800 truncate">{a.title}</span>
                    </div>
                    <div className="mt-1 text-[0.82rem] text-slate-500 line-clamp-2 whitespace-pre-wrap">{a.content}</div>
                    <div className="mt-1 text-[0.72rem] text-slate-400">{a.author_name} · {fmtTime(a.created_at)}{a.updated_at !== a.created_at ? `（编辑于 ${fmtTime(a.updated_at)}）` : ""}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                    <Btn size="sm" variant="ghost" onClick={() => startEdit(a)}>编辑</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => remove(a)}>
                      <span className="text-red-600">删除</span>
                    </Btn>
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
