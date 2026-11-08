"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Me } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  Avatar,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  COMPOSE_BOARDS,
  EmptyState,
  ForumPostDetail,
  ForumPostItem,
  ForumReply,
  INPUT,
  Modal,
  Note,
  Spinner,
  boardMeta,
  fmtTime,
  relTime,
} from "./shared";

const PAGE_SIZE = 15;

const BOARD_FILTERS = [
  { key: "all", name: "全部" },
  { key: "general", name: "综合讨论" },
  { key: "qa", name: "问答求助" },
  { key: "share", name: "作品分享" },
  { key: "guide", name: "攻略教程" },
];

interface Announcement {
  id: number;
  title: string;
  content: string;
  author_name: string;
  author_avatar?: string;
  pinned: number;
  created_at: string;
}

interface ServerInfo {
  id: number;
  server_name: string;
  status: string;
  players_online: number;
  max_players: number;
  version: string;
  motd: string;
}

export default function FeedView({ me, onNeedLogin }: { me: Me | null; onNeedLogin: () => void }) {
  const [board, setBoard] = useState("all");
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<ForumPostItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [servers, setServers] = useState<ServerInfo[] | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ post: ForumPostDetail; replies: ForumReply[]; liked: boolean } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [composing, setComposing] = useState(false);
  const [newBoard, setNewBoard] = useState("general");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const replyBoxRef = useRef<HTMLTextAreaElement | null>(null);
  const [liking, setLiking] = useState(false);

  const loadPosts = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams({ board, page: String(page) });
      if (keyword) qs.set("keyword", keyword);
      const data = await api<{ items: ForumPostItem[]; total: number }>(`/forum/posts?${qs.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "动态加载失败");
      setItems([]);
    }
  }, [board, page, keyword]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    api<Announcement[]>("/forum/announcements")
      .then((list) => setAnnouncements(Array.isArray(list) ? list.slice(0, 4) : []))
      .catch(() => undefined);
  }, []);

  // 服务器在线状态：进入社区时加载，之后每分钟刷新一次
  useEffect(() => {
    let alive = true;
    const load = () => {
      api<ServerInfo[]>("/monitor/status")
        .then((list) => {
          if (alive) setServers(Array.isArray(list) ? list : []);
        })
        .catch(() => {
          if (alive) setServers([]);
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const openDetail = useCallback(async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    setReplyTo(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("post", String(id));
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 静态托管环境下忽略 */
    }
    try {
      const data = await api<{ post: ForumPostDetail; replies: ForumReply[]; liked: boolean }>(`/forum/posts/${id}`);
      setDetail(data);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "帖子加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 支持分享直链 /forum?post=123 直接打开对应帖子
  useEffect(() => {
    const pid = Number(new URLSearchParams(window.location.search).get("post")) || 0;
    if (pid > 0) void openDetail(pid);
  }, [openDetail]);

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setReplyText("");
    setReplyTo(null);
    setDetailError("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("post");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略 */
    }
  };

  const sharePost = async () => {
    if (!detail) return;
    const link = `${window.location.origin}/forum?post=${detail.post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("复制帖子链接", link);
    }
  };

  const submitPost = async () => {
    if (!me) {
      onNeedLogin();
      return;
    }
    setActionError("");
    if (newTitle.trim().length < 5) {
      setActionError("标题至少需要 5 个字");
      return;
    }
    if (newContent.trim().length < 5) {
      setActionError("正文至少需要 5 个字");
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await api<{ id: number }>("/forum/posts", {
        method: "POST",
        body: JSON.stringify({ board: newBoard, title: newTitle.trim(), content: newContent.trim() }),
      });
      setComposing(false);
      setNewTitle("");
      setNewContent("");
      setBoard(newBoard);
      setPage(1);
      setKeyword("");
      setKeywordInput("");
      await loadPosts();
      await openDetail(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!detail) return;
    if (!me) {
      onNeedLogin();
      return;
    }
    const content = replyText.trim();
    if (content.length < 2) {
      setActionError("评论至少需要 2 个字");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const reply = await api<ForumReply>(`/forum/posts/${detail.post.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, parent_id: replyTo?.id || 0 }),
      });
      setDetail((prev) => (prev ? { ...prev, replies: [...prev.replies, reply] } : prev));
      setReplyText("");
      setReplyTo(null);
      setItems((prev) =>
        prev ? prev.map((p) => (p.id === detail.post.id ? { ...p, reply_count: p.reply_count + 1 } : p)) : prev,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "评论失败");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async () => {
    if (!detail) return;
    if (!me) {
      onNeedLogin();
      return;
    }
    setLiking(true);
    try {
      const r = await api<{ liked: boolean; count: number }>(`/forum/posts/${detail.post.id}/like`, { method: "POST" });
      setDetail((prev) =>
        prev
          ? { ...prev, liked: r.liked, post: { ...prev.post, like_count: r.count } }
          : prev,
      );
      setItems((prev) =>
        prev ? prev.map((p) => (p.id === detail.post.id ? { ...p, like_count: r.count } : p)) : prev,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLiking(false);
    }
  };

  const deletePost = async () => {
    if (!detail) return;
    if (!window.confirm("确定删除这条帖子吗？")) return;
    try {
      await api(`/forum/posts/${detail.post.id}/delete`, { method: "POST" });
      closeDetail();
      await loadPosts();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const deleteReply = async (replyId: number) => {
    if (!detail) return;
    if (!window.confirm("确定删除这条评论吗？")) return;
    try {
      await api(`/forum/replies/${replyId}/delete`, { method: "POST" });
      setDetail((prev) => {
        if (!prev) return prev;
        const removed = prev.replies.filter((r) => r.id === replyId || r.parent_id === replyId).length;
        return {
          ...prev,
          replies: prev.replies.filter((r) => r.id !== replyId && r.parent_id !== replyId),
          post: { ...prev.post, reply_count: Math.max(0, prev.post.reply_count - removed) },
        };
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canManage = (authorId: number | null) => !!me && (me.id === authorId || me.role === "admin");

  const renderReply = (r: ForumReply, isChild: boolean) => (
    <div className={`flex gap-2.5 ${isChild ? "pl-7" : ""}`}>
      <Avatar src={r.author_avatar} name={r.author_name} size={isChild ? 26 : 30} />
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-white/5 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/70">{r.author_name}</span>
          <span className="text-[10px] text-white/25">
            {relTime(r.created_at)}
            {r.ip_region ? ` · IP属地 ${r.ip_region}` : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!isChild && (
              <button
                className="text-[10px] text-white/25 transition hover:text-emerald-300"
                onClick={() => {
                  if (!me) return onNeedLogin();
                  setReplyTo({ id: r.id, name: r.author_name });
                  window.setTimeout(() => replyBoxRef.current?.focus(), 0);
                }}
              >
                回复
              </button>
            )}
            {canManage(r.author_id) && (
              <button
                className="text-[10px] text-white/25 transition hover:text-rose-300"
                onClick={() => void deleteReply(r.id)}
              >
                删除
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-white/55">
          {r.reply_to ? <span className="text-emerald-300/70">回复 @{r.reply_to}：</span> : null}
          {r.content}
        </p>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">社区动态</h2>
            <p className="mt-0.5 text-xs text-white/40">所有注册玩家都可以发帖、评论与点赞</p>
          </div>
          <button
            className={BTN_PRIMARY}
            onClick={() => {
              if (!me) return onNeedLogin();
              setActionError("");
              setComposing(true);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            发布帖子
          </button>
        </div>

        <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 p-2.5`}>
          {BOARD_FILTERS.map((b) => (
            <button
              key={b.key}
              onClick={() => {
                setBoard(b.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                board === b.key
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-white/45 hover:bg-white/5 hover:text-white/75"
              }`}
            >
              {b.name}
            </button>
          ))}
          <form
            className="ml-auto flex min-w-[180px] flex-1 items-center gap-2 sm:max-w-[260px]"
            onSubmit={(e) => {
              e.preventDefault();
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
          >
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="搜索帖子"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40"
            />
            <button type="submit" className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/60 transition hover:bg-white/10">
              搜索
            </button>
          </form>
        </div>

        <Note text={error} />

        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title="这里还没有帖子"
            desc="发一条动态，和社区里的伙伴打个招呼吧。"
            action={
              <button
                className={BTN_PRIMARY}
                onClick={() => {
                  if (!me) return onNeedLogin();
                  setComposing(true);
                }}
              >
                发布第一条
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((post) => {
              const meta = boardMeta(post.board);
              return (
                <button
                  key={post.id}
                  onClick={() => void openDetail(post.id)}
                  className={`${CARD} group flex w-full gap-3 p-4 text-left transition hover:border-emerald-400/25 hover:bg-white/[0.06]`}
                >
                  <Avatar src={post.author_avatar} name={post.author_name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.pinned ? (
                        <span className="rounded-md border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          置顶
                        </span>
                      ) : null}
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.name}</span>
                      <span className="text-xs text-white/35">{post.author_name}</span>
                      {post.ip_region ? (
                        <span className="text-[10px] text-white/20">IP属地 {post.ip_region}</span>
                      ) : null}
                      <span className="text-xs text-white/25">{relTime(post.created_at)}</span>
                    </div>
                    <h3 className="mt-1.5 truncate text-[15px] font-bold text-white group-hover:text-emerald-200">
                      {post.title || "无标题"}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">{post.content}</p>
                    <div className="mt-2.5 flex items-center gap-4 text-[11px] text-white/30">
                      <span>{post.reply_count} 评论</span>
                      <span>{post.like_count} 点赞</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-white/45">
            <button
              className={BTN_GHOST}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              className={BTN_GHOST}
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <h3 className="text-sm font-bold text-white">服务器状态</h3>
          </div>
          {servers === null ? (
            <p className="text-xs text-white/30">获取中…</p>
          ) : servers.length === 0 ? (
            <p className="text-xs text-white/35">暂无服务器数据</p>
          ) : (
            <div className="flex flex-col gap-3">
              {servers.map((s) => {
                const online = s.status === "online";
                return (
                  <div key={s.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-white/25"}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/75">{s.server_name}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          online ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-white/35"
                        }`}
                      >
                        {online ? "在线" : "离线"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-white/40">
                      <span>
                        玩家 <span className="font-bold text-emerald-300">{s.players_online}</span>
                        {s.max_players > 0 ? ` / ${s.max_players}` : ""}
                      </span>
                      {s.version ? <span className="truncate">{s.version}</span> : null}
                    </div>
                    {s.motd ? <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-white/25">{s.motd}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-sm font-bold text-white">官方公告</h3>
          </div>
          {announcements.length === 0 ? (
            <p className="text-xs text-white/35">暂无公告</p>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {announcements.map((a) => (
                <div key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="line-clamp-1 text-xs font-semibold text-white/75">{a.title || "公告"}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/35">{a.content}</p>
                  <p className="mt-1 text-[10px] text-white/25">{fmtTime(a.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${CARD} p-4`}>
          <h3 className="mb-2 text-sm font-bold text-white">社区公约</h3>
          <ul className="flex flex-col gap-2 text-[11px] leading-relaxed text-white/40">
            <li>尊重每一位玩家，友善交流。</li>
            <li>禁止刷屏、广告与人身攻击。</li>
            <li>分享作品与攻略时请注明来源。</li>
            <li>违规内容将由管理员处理。</li>
          </ul>
        </div>
      </aside>

      {/* 发帖 */}
      <Modal open={composing} title="发布社区动态" onClose={() => setComposing(false)} width="max-w-2xl">
        <div className="flex flex-col gap-3">
          <Note text={actionError} />
          <div className="flex flex-wrap gap-2">
            {COMPOSE_BOARDS.map((key) => {
              const meta = boardMeta(key);
              return (
                <button
                  key={key}
                  onClick={() => setNewBoard(key)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    newBoard === key ? meta.cls : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70"
                  }`}
                >
                  {meta.name}
                </button>
              );
            })}
          </div>
          <input
            className={INPUT}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={120}
            placeholder="标题（5-120 字）"
          />
          <textarea
            className={`${INPUT} min-h-[180px] resize-y`}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={10000}
            placeholder="分享你的想法、作品或问题…"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/30">{newContent.length} / 10000</span>
            <div className="flex gap-2">
              <button className={BTN_GHOST} onClick={() => setComposing(false)}>
                取消
              </button>
              <button className={BTN_PRIMARY} disabled={submitting} onClick={() => void submitPost()}>
                {submitting ? "发布中…" : "发布"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 帖子详情 */}
      <Modal open={detailId !== null} title="帖子详情" onClose={closeDetail} width="max-w-2xl">
        {detailLoading ? (
          <Spinner />
        ) : detailError ? (
          <Note text={detailError} />
        ) : detail ? (
          <div className="flex max-h-[72vh] flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center gap-3">
                <Avatar src={detail.post.author_avatar} name={detail.post.author_name} size={40} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{detail.post.author_name}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${boardMeta(detail.post.board).cls}`}>
                      {boardMeta(detail.post.board).name}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/30">
                    {fmtTime(detail.post.created_at)}
                    {detail.post.ip_region ? ` · IP属地 ${detail.post.ip_region}` : ""}
                  </p>
                </div>
                {canManage(detail.post.author_id) && (
                  <button className={`${BTN_GHOST} ml-auto`} onClick={() => void deletePost()}>
                    删除
                  </button>
                )}
              </div>

              <h3 className="mt-4 text-lg font-bold leading-snug text-white">{detail.post.title || "无标题"}</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">
                {detail.post.content}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <button
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    detail.liked
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                      : "border-white/10 bg-white/[0.04] text-white/50 hover:text-white/80"
                  }`}
                  disabled={liking}
                  onClick={() => void toggleLike()}
                >
                  {detail.liked ? "已点赞" : "点赞"} · {detail.post.like_count}
                </button>
                <span className="text-xs text-white/30">{detail.post.reply_count} 条评论</span>
                <button className={`${BTN_GHOST} ml-auto py-1`} onClick={() => void sharePost()}>
                  {copied ? "已复制链接" : "分享"}
                </button>
              </div>

              <div className="mt-5 border-t border-white/5 pt-4">
                <h4 className="mb-3 text-xs font-bold tracking-wide text-white/50">全部评论</h4>
                {detail.replies.length === 0 ? (
                  <p className="pb-2 text-xs text-white/30">还没有评论，来说两句吧。</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {detail.replies
                      .filter((r) => !r.parent_id)
                      .map((r) => (
                        <div key={r.id} className="flex flex-col gap-2">
                          {renderReply(r, false)}
                          {detail.replies
                            .filter((c) => c.parent_id === r.id)
                            .map((c) => (
                              <div key={c.id}>{renderReply(c, true)}</div>
                            ))}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-white/5 pt-4">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 text-[11px] text-white/40">
                  正在回复 <span className="font-semibold text-emerald-300">@{replyTo.name}</span>
                  <button className="text-white/30 transition hover:text-white/70" onClick={() => setReplyTo(null)}>
                    取消
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={replyBoxRef}
                  className={`${INPUT} min-h-[44px] flex-1 resize-none`}
                  rows={1}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={
                    me
                      ? replyTo
                        ? `回复 @${replyTo.name}…（Enter 发送）`
                        : "写下你的评论…（Enter 发送）"
                      : "登录后参与评论"
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitReply();
                    }
                  }}
                />
                <button
                  className={BTN_PRIMARY}
                  disabled={submitting || !replyText.trim()}
                  onClick={() => void submitReply()}
                >
                  {submitting ? "发送中…" : replyTo ? "回复" : "评论"}
                </button>
              </div>
            </div>
            {actionError && <div className="mt-2"><Note text={actionError} /></div>}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
