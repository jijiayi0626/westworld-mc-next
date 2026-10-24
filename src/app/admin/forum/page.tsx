"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, Select, StatusBadge, SuccessNote, TextArea, fmtTime } from "@/components/ui";
import { motion } from "@/components/motion";

/** 官网公告（主库 announcements：首页公告区展示） */
interface HomeAnnouncement {
  id: number;
  title: string;
  status: string;
  created_at: string;
  published_at: string | null;
}

/** 论坛公告（论坛库 forum_posts：公开论坛页 + 用户中心展示） */
interface ForumAnnouncement {
  id: number;
  title: string;
  content: string;
  author_name: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

type Tag = "home" | "forum";

/** 公告与论坛合并管理：通过标签切换管理「官网公告」与「论坛公告」 */
export default function AdminForumPage() {
  const [tag, setTag] = useState<Tag>("home");
  const [homeList, setHomeList] = useState<HomeAnnouncement[] | null>(null);
  const [forumList, setForumList] = useState<ForumAnnouncement[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 编辑态（编辑哪个标签的哪条内容）
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft"); // 官网公告：draft / published / archived
  const [pinned, setPinned] = useState(false);   // 论坛公告：置顶

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        api<HomeAnnouncement[]>("/announce/admin/list").catch(() => []),
        api<ForumAnnouncement[]>("/forum/announcements").catch(() => []),
      ]);
      setHomeList(h);
      setForumList(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingTag(tag);
    setEditingId(null);
    setTitle("");
    setContent("");
    setStatus("draft");
    setPinned(false);
  };

  const startEditHome = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      const a = await api<{ id: number; title: string; content: string; status: string }>(`/announce/admin/${id}`);
      setEditingTag("home");
      setEditingId(id);
      setTitle(a.title);
      setContent(a.content);
      setStatus(a.status);
      setPinned(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const startEditForum = (a: ForumAnnouncement) => {
    setEditingTag("forum");
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setStatus("published");
    setPinned(a.pinned === 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setEditingId(null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingTag) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (editingTag === "home") {
        const body = { title: title.trim(), content: content.trim(), status };
        if (editingId) {
          await api(`/announce/admin/update`, { method: "POST", body: JSON.stringify({ ...body, id: editingId }) });
          setSuccess("官网公告已更新");
        } else {
          await api("/announce/admin/create", { method: "POST", body: JSON.stringify(body) });
          setSuccess("官网公告已创建");
        }
      } else {
        const body = { title: title.trim(), content: content.trim(), pinned };
        if (editingId) {
          await api(`/forum/admin/announcements/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
          setSuccess("论坛公告已更新");
        } else {
          await api("/forum/admin/announcements", { method: "POST", body: JSON.stringify(body) });
          setSuccess("论坛公告已发布");
        }
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const removeHome = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api("/announce/admin/delete", { method: "POST", body: JSON.stringify({ id }) });
      if (editingTag === "home" && editingId === id) cancelEdit();
      setSuccess("已删除");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const removeForum = async (a: ForumAnnouncement) => {
    if (!confirm(`确定删除公告「${a.title}」？`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/forum/admin/announcements/${a.id}`, { method: "DELETE" });
      if (editingTag === "forum" && editingId === a.id) cancelEdit();
      setSuccess("已删除");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const editing = editingTag !== null;

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h1 className="text-[1.35rem] font-bold text-slate-900">公告与论坛</h1>
          <Btn variant="ghost" onClick={editing ? cancelEdit : startNew}>{editing ? "取消编辑" : "发布公告"}</Btn>
        </div>

        {/* 标签切换 */}
        <div className="flex gap-1 mb-5 bg-slate-100 rounded-[12px] p-1 w-fit">
          {([
            { value: "home" as Tag, label: `官网公告${homeList ? `（${homeList.length}）` : ""}` },
            { value: "forum" as Tag, label: `论坛公告${forumList ? `（${forumList.length}）` : ""}` },
          ]).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => { setTag(t.value); if (editing && editingTag !== t.value) cancelEdit(); }}
              className={`px-4 py-2 rounded-[9px] text-[0.88rem] font-medium transition-colors cursor-pointer ${
                tag === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ErrorNote message={error} />
        <SuccessNote message={success} />

        {tag === "home" ? (
          <>
            <p className="text-[0.85rem] text-slate-500 mb-4">官网首页「官方公告」区展示的内容；状态设为「发布」后对外可见。</p>
            {editing && editingTag === "home" && (
              <Card className="mb-5">
                <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingId ? `编辑官网公告 #${editingId}` : "新建官网公告"}</h3>
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
                  <div className="flex gap-2">
                    <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
                    <Btn type="button" variant="ghost" onClick={cancelEdit}>取消编辑</Btn>
                  </div>
                </form>
              </Card>
            )}

            <Card>
              <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">官网公告列表
                <span className="ml-2 text-[0.82rem] font-normal text-slate-400">{homeList === null ? "" : `共 ${homeList.length} 条`}</span>
              </h3>
              {homeList === null ? (
                <Empty text="加载中..." />
              ) : homeList.length === 0 ? (
                <Empty text="暂无官网公告，点击右上角发布" />
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {homeList.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                      className="py-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-slate-800 font-medium truncate">{a.title}</div>
                        <div className="mt-1 text-[0.78rem] text-slate-500">
                          {fmtTime(a.created_at)}
                          {a.published_at && <span className="ml-3">发布于 {fmtTime(a.published_at)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={a.status} />
                        <Btn size="sm" variant="ghost" onClick={() => startEditHome(a.id)}>编辑</Btn>
                        <Btn size="sm" variant="danger" onClick={() => removeHome(a.id)}>删除</Btn>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : (
          <>
            <p className="text-[0.85rem] text-slate-500 mb-4">官网「论坛」页（无需登录即可查看）与用户中心论坛页展示的内容；置顶的公告排在最前。</p>
            {editing && editingTag === "forum" && (
              <Card className="mb-5">
                <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingId ? `编辑论坛公告 #${editingId}` : "发布论坛公告"}</h3>
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
                    <Btn type="button" variant="ghost" onClick={cancelEdit}>取消编辑</Btn>
                  </div>
                </form>
              </Card>
            )}

            <Card>
              <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">论坛公告列表
                <span className="ml-2 text-[0.82rem] font-normal text-slate-400">{forumList === null ? "" : `共 ${forumList.length} 条`}</span>
              </h3>
              {forumList === null ? (
                <Empty text="加载中..." />
              ) : forumList.length === 0 ? (
                <Empty text="暂无论坛公告，点击右上角发布" />
              ) : (
                <div className="flex flex-col divide-y divide-slate-100">
                  {forumList.map((a, i) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                      className="py-3 flex items-start justify-between gap-3"
                    >
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
                        <Btn size="sm" variant="ghost" onClick={() => startEditForum(a)}>编辑</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => removeForum(a)}>
                          <span className="text-red-600">删除</span>
                        </Btn>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}
