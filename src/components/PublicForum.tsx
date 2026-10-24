"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { motion } from "motion/react";

interface HomeAnnouncement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

interface ForumAnnouncement {
  id: number;
  title: string;
  content: string;
  author_name: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface MergedItem {
  key: string;
  tag: "home" | "forum";
  title: string;
  content: string;
  author: string;
  pinned: number;
  created_at: string;
}

interface ForumPostItem {
  id: number;
  board: string;
  title: string;
  content: string;
  author_name: string;
  pinned: number;
  reply_count: number;
  like_count: number;
  views: number;
  created_at: string;
}

interface ForumPostDetail extends ForumPostItem {
  author_id: number | null;
  updated_at: string;
}

interface ForumReply {
  id: number;
  post_id: number;
  author_id: number | null;
  author_name: string;
  content: string;
  created_at: string;
}

type BoardKey = "all" | "general" | "announcement" | "qa" | "share" | "guide";

const PAGE_SIZE = 15;

const TABS: { key: BoardKey; name: string }[] = [
  { key: "general", name: "综合讨论" },
  { key: "announcement", name: "官方公告" },
  { key: "qa", name: "问答求助" },
  { key: "share", name: "作品分享" },
  { key: "guide", name: "攻略教程" },
  { key: "all", name: "全部" },
];

const BOARD_META: Record<string, { name: string; cls: string }> = {
  general: { name: "综合讨论", cls: "bg-sky-500/15 border-sky-400/40 text-sky-300" },
  announcement: { name: "官方公告", cls: "bg-amber-500/15 border-amber-400/40 text-amber-300" },
  qa: { name: "问答求助", cls: "bg-violet-500/15 border-violet-400/40 text-violet-300" },
  share: { name: "作品分享", cls: "bg-pink-500/15 border-pink-400/40 text-pink-300" },
  guide: { name: "攻略教程", cls: "bg-accent-emerald/15 border-accent-emerald/40 text-accent-emerald" },
};

const COMPOSE_BOARDS = ["general", "qa", "share", "guide"];

function ts(s: string): number {
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function boardMeta(board: string): { name: string; cls: string } {
  return BOARD_META[board] || { name: board || "其他", cls: "bg-white/10 border-white/20 text-white/70" };
}

/** 官网公开论坛页：分区浏览、帖子详情、登录后发帖 / 回帖 / 点赞 */
export default function PublicForum() {
  const { user } = useAuth();

  const [board, setBoard] = useState<BoardKey>("all");
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<ForumPostItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [announcements, setAnnouncements] = useState<MergedItem[] | null>(null);
  const [focusKey, setFocusKey] = useState("");

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ post: ForumPostDetail; replies: ForumReply[]; liked: boolean } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [composing, setComposing] = useState(false);
  const [newBoard, setNewBoard] = useState("general");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liking, setLiking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 公告：官网公告 + 论坛公告合并（保留原来的两个数据源）
  const loadAnnouncements = useCallback(async () => {
    const [homeRes, forumRes] = await Promise.allSettled([
      fetch("/api/announce").then((r) => r.json()) as Promise<{ code: number; data: HomeAnnouncement[] | null }>,
      api<ForumAnnouncement[]>("/forum/announcements"),
    ]);
    const home: MergedItem[] =
      homeRes.status === "fulfilled" && homeRes.value.code === 0 && Array.isArray(homeRes.value.data)
        ? homeRes.value.data.map((a) => ({
            key: `home-${a.id}`,
            tag: "home" as const,
            title: a.title,
            content: a.content,
            author: "管理团队",
            pinned: 0,
            created_at: a.created_at,
          }))
        : [];
    const forum: MergedItem[] =
      forumRes.status === "fulfilled" && Array.isArray(forumRes.value)
        ? forumRes.value.map((a) => ({
            key: `forum-${a.id}`,
            tag: "forum" as const,
            title: a.title,
            content: a.content,
            author: a.author_name || "管理团队",
            pinned: a.pinned,
            created_at: a.created_at,
          }))
        : [];
    setAnnouncements([...home, ...forum].sort((a, b) => b.pinned - a.pinned || ts(b.created_at) - ts(a.created_at)));
  }, []);

  // 首次进入：解析 ?post= / ?focus=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = Number(params.get("post")) || 0;
    const focus = params.get("focus") || "";
    if (postId > 0) setDetailId(postId);
    if (focus) {
      setFocusKey(focus);
      setBoard("announcement");
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements, reloadKey]);

  // 帖子列表（官方公告分区走公告数据源）
  useEffect(() => {
    if (board === "announcement") {
      setListLoading(false);
      return;
    }
    let stop = false;
    setListLoading(true);
    setListError("");
    const qs = new URLSearchParams({ board, page: String(page) });
    if (keyword) qs.set("keyword", keyword);
    api<{ items: ForumPostItem[]; total: number }>(`/forum/posts?${qs.toString()}`)
      .then((d) => {
        if (stop) return;
        setItems(d.items);
        setTotal(d.total);
      })
      .catch((e) => {
        if (stop) return;
        setItems([]);
        setTotal(0);
        setListError(e instanceof Error ? e.message : "帖子加载失败");
      })
      .finally(() => {
        if (!stop) setListLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [board, page, keyword, reloadKey]);

  // 帖子详情
  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let stop = false;
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setReplyText("");
    setActionError("");
    api<{ post: ForumPostDetail; replies: ForumReply[]; liked: boolean }>(`/forum/posts/${detailId}`)
      .then((d) => {
        if (!stop) setDetail(d);
      })
      .catch((e) => {
        if (!stop) setDetailError(e instanceof Error ? e.message : "帖子加载失败");
      })
      .finally(() => {
        if (!stop) setDetailLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [detailId]);

  // 从首页跳转来的公告：自动展开并滚动定位
  useEffect(() => {
    if (!focusKey || board !== "announcement" || announcements === null) return;
    const el = document.getElementById(`ann-${focusKey}`);
    if (!el) return;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [focusKey, board, announcements]);

  const shownAnnouncements = useMemo(() => announcements ?? [], [announcements]);

  const changeBoard = (key: BoardKey) => {
    setBoard(key);
    setPage(1);
    setFocusKey("");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/forum");
  };

  const openDetail = (id: number) => {
    setComposing(false);
    setDetailId(id);
    setActionError("");
    setNotice("");
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/forum?post=${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setActionError("");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/forum");
  };

  const openCompose = () => {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setDetailId(null);
    setDetail(null);
    setComposing(true);
    setActionError("");
    setNotice("");
    if (COMPOSE_BOARDS.includes(board)) setNewBoard(board);
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/forum");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitPost = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setActionError("");
    try {
      const { id } = await api<{ id: number }>("/forum/posts", {
        method: "POST",
        body: JSON.stringify({ board: newBoard, title: newTitle, content: newContent }),
      });
      setComposing(false);
      setNewTitle("");
      setNewContent("");
      setBoard(newBoard as BoardKey);
      setPage(1);
      setReloadKey((k) => k + 1);
      setNotice(`发布成功（#${id}）`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!detail || !user || submitting) return;
    const content = replyText.trim();
    if (content.length < 2) {
      setActionError("回复至少需要 2 个字符");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const reply = await api<ForumReply>(`/forum/posts/${detail.post.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setDetail((d) =>
        d ? { ...d, replies: [...d.replies, reply], post: { ...d.post, reply_count: d.post.reply_count + 1 } } : d,
      );
      setReplyText("");
      setNotice("回复成功");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "回复失败");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLike = async () => {
    if (!detail || liking) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setLiking(true);
    setActionError("");
    try {
      const r = await api<{ liked: boolean; count: number }>(`/forum/posts/${detail.post.id}/like`, { method: "POST" });
      setDetail((d) => (d ? { ...d, liked: r.liked, post: { ...d.post, like_count: r.count } } : d));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLiking(false);
    }
  };

  const removePost = async () => {
    if (!detail) return;
    if (!window.confirm("确定删除这篇帖子？帖子下的回复也会一并删除。")) return;
    setActionError("");
    try {
      await api(`/forum/posts/${detail.post.id}/delete`, { method: "POST" });
      closeDetail();
      setReloadKey((k) => k + 1);
      setNotice("帖子已删除");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const removeReply = async (replyId: number) => {
    if (!window.confirm("确定删除这条回复？")) return;
    setActionError("");
    try {
      await api(`/forum/replies/${replyId}/delete`, { method: "POST" });
      setDetail((d) =>
        d
          ? {
              ...d,
              replies: d.replies.filter((r) => r.id !== replyId),
              post: { ...d.post, reply_count: Math.max(0, d.post.reply_count - 1) },
            }
          : d,
      );
      setNotice("回复已删除");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const doSearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const canDeletePost = !!detail && !!user && (user.role === "admin" || user.id === detail.post.author_id);

  return (
    <main className="forum-public-page relative bg-bg-dark min-h-screen overflow-hidden">
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none rules-glow" aria-hidden="true" />
      <div className="relative z-[2] container-mc py-14">
        <div className="section-header mb-8 text-center">
          <h1 className="section-title text-[clamp(2rem,5vw,3rem)] font-extrabold text-white mb-4 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
            社区论坛
          </h1>
          <p className="text-[1.1rem] text-white/80 max-w-[660px] mx-auto">
            分区讨论、玩家发帖、问答互助与作品分享；登录后可发帖、回帖与点赞
          </p>
        </div>

        {notice && (
          <div className="max-w-[860px] mx-auto mb-4 px-4 py-3 rounded-[12px] bg-accent-emerald/10 border border-accent-emerald/30 text-accent-emerald text-[0.88rem]">
            {notice}
          </div>
        )}

        {detailId ? (
          <motion.section
            className="max-w-[860px] mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26 }}
          >
            <button
              type="button"
              onClick={closeDetail}
              className="mb-5 inline-flex items-center gap-1.5 text-[0.88rem] text-white/60 hover:text-accent-emerald transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
              返回列表
            </button>

            {detailLoading ? (
              <div className="text-center text-white/60 py-12">加载中...</div>
            ) : detailError ? (
              <div className="px-4 py-3 rounded-[10px] bg-red-500/10 border border-red-400/30 text-red-300 text-[0.88rem]">
                {detailError}
              </div>
            ) : detail ? (
              <>
                <article className="bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {detail.post.pinned === 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-[0.68rem] font-semibold">
                        置顶
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded-full border text-[0.68rem] font-semibold ${boardMeta(detail.post.board).cls}`}>
                      {boardMeta(detail.post.board).name}
                    </span>
                  </div>
                  <h2 className="text-[1.4rem] font-bold text-white mb-3 break-words">{detail.post.title}</h2>
                  <div className="text-[0.78rem] text-white/45 mb-5">
                    {detail.post.author_name || "匿名"} · {fmtTime(detail.post.created_at)}
                  </div>
                  <p className="text-[0.95rem] text-white/80 whitespace-pre-wrap leading-relaxed break-words">
                    {detail.post.content}
                  </p>
                  <div className="mt-6 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => void toggleLike()}
                      disabled={liking}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-[0.85rem] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                        detail.liked
                          ? "bg-accent-emerald/20 border-accent-emerald/50 text-accent-emerald"
                          : "bg-white/5 border-white/15 text-white/70 hover:text-white hover:border-accent-emerald/40"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill={detail.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                      </svg>
                      {detail.liked ? "已点赞" : "点赞"} {detail.post.like_count}
                    </button>
                    <span className="text-white/40 text-[0.8rem]">
                      回复 {detail.post.reply_count} · 浏览 {detail.post.views ?? 0}
                    </span>
                    {!user && (
                      <a href="/login" className="text-[0.8rem] text-white/50 hover:text-accent-emerald transition-colors">
                        登录后可点赞
                      </a>
                    )}
                    {canDeletePost && (
                      <button
                        type="button"
                        onClick={() => void removePost()}
                        className="ml-auto text-[0.82rem] text-red-300/80 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        删除帖子
                      </button>
                    )}
                  </div>
                </article>

                <section className="mt-6">
                  <h3 className="text-white/80 font-semibold mb-3 text-[0.95rem]">
                    全部回复（{detail.replies.length}）
                  </h3>
                  {detail.replies.length === 0 ? (
                    <div className="text-center text-white/50 py-8 text-[0.85rem] bg-white/5 border border-white/10 rounded-xl">
                      还没有回复，来抢沙发吧～
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {detail.replies.map((r) => (
                        <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between gap-2 text-[0.75rem] text-white/45 mb-1">
                            <span>
                              {r.author_name || "匿名"} · {fmtTime(r.created_at)}
                            </span>
                            {user && (user.role === "admin" || user.id === r.author_id) && (
                              <button
                                type="button"
                                onClick={() => void removeReply(r.id)}
                                className="text-red-300/70 hover:text-red-300 transition-colors cursor-pointer"
                              >
                                删除
                              </button>
                            )}
                          </div>
                          <p className="text-[0.9rem] text-white/80 whitespace-pre-wrap break-words">{r.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="mt-5 bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-4">
                  {user ? (
                    <>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value.slice(0, 5000))}
                        rows={4}
                        placeholder="写下你的回复…（2-5000 字）"
                        className="w-full resize-y bg-white/5 border border-white/10 rounded-[10px] px-3.5 py-2.5 text-white text-[0.92rem] placeholder:text-white/35 focus:outline-none focus:border-accent-emerald/60 transition-colors"
                      />
                      <div className="flex items-center justify-end mt-2">
                        <button
                          type="button"
                          onClick={() => void submitReply()}
                          disabled={submitting}
                          className="h-9 px-5 rounded-[10px] bg-accent-emerald text-white font-semibold text-[0.86rem] disabled:opacity-40 transition-colors hover:bg-emerald-600 cursor-pointer"
                        >
                          {submitting ? "提交中" : "发表回复"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-2 text-white/60 text-[0.88rem]">
                      <a href="/login" className="text-accent-emerald hover:underline">
                        登录
                      </a>{" "}
                      后参与回复
                    </div>
                  )}
                </div>

                {actionError && (
                  <div className="mt-4 px-4 py-3 rounded-[10px] bg-red-500/10 border border-red-400/30 text-red-300 text-[0.88rem]">
                    {actionError}
                  </div>
                )}
              </>
            ) : null}
          </motion.section>
        ) : composing ? (
          <section className="max-w-[720px] mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-[1.1rem]">发布新帖</h2>
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="text-[0.85rem] text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
            <div className="bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-white/70 text-[0.85rem] font-medium">分区</span>
                <select
                  value={newBoard}
                  onChange={(e) => setNewBoard(e.target.value)}
                  className="w-full bg-[#0f172a] border border-white/15 rounded-[10px] px-3.5 py-2.5 text-white text-[0.92rem] focus:outline-none focus:border-accent-emerald/60"
                >
                  {COMPOSE_BOARDS.map((b) => (
                    <option key={b} value={b} className="bg-[#0f172a]">
                      {boardMeta(b).name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-white/70 text-[0.85rem] font-medium">标题（5-120 字）</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value.slice(0, 120))}
                  placeholder="一句话说明你的帖子主题"
                  className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3.5 py-2.5 text-white text-[0.95rem] placeholder:text-white/35 focus:outline-none focus:border-accent-emerald/60 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-white/70 text-[0.85rem] font-medium">内容（5-10000 字）</span>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value.slice(0, 10000))}
                  rows={10}
                  placeholder="详细描述你想讨论的内容…"
                  className="w-full resize-y bg-white/5 border border-white/10 rounded-[10px] px-3.5 py-2.5 text-white text-[0.92rem] placeholder:text-white/35 focus:outline-none focus:border-accent-emerald/60 transition-colors"
                />
              </label>
              {actionError && (
                <div className="px-4 py-3 rounded-[10px] bg-red-500/10 border border-red-400/30 text-red-300 text-[0.88rem]">
                  {actionError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="h-9 px-4 rounded-[10px] bg-white/5 border border-white/15 text-white/70 text-[0.86rem] hover:text-white transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void submitPost()}
                  disabled={submitting}
                  className="h-9 px-5 rounded-[10px] bg-accent-emerald text-white font-semibold text-[0.86rem] disabled:opacity-40 transition-colors hover:bg-emerald-600 cursor-pointer"
                >
                  {submitting ? "发布中" : "发布"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="max-w-[860px] mx-auto">
            {/* 分区 Tab */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex gap-1 bg-white/5 border border-white/10 rounded-[12px] p-1 backdrop-blur-glass max-w-full overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => changeBoard(t.key)}
                    className={`px-4 py-2 rounded-[9px] text-[0.86rem] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      board === t.key
                        ? "bg-accent-emerald text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)]"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="flex flex-1 min-w-[220px] items-center gap-2 bg-white/5 border border-white/10 rounded-[10px] px-3 py-1.5 backdrop-blur-glass">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 flex-shrink-0" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-3.5-3.5" />
                </svg>
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      doSearch();
                    }
                  }}
                  placeholder="搜索标题或内容…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-white text-[0.9rem] placeholder:text-white/35 py-1"
                />
                <button
                  type="button"
                  onClick={doSearch}
                  className="px-3 py-1 rounded-[7px] bg-white/10 text-white/80 text-[0.8rem] hover:bg-accent-emerald hover:text-white transition-colors cursor-pointer"
                >
                  搜索
                </button>
              </div>
              {user ? (
                <span className="text-[0.82rem] text-white/50 px-1">
                  以 <span className="text-accent-emerald">{user.username}</span> 的身份参与
                </span>
              ) : (
                <a
                  href="/login"
                  className="h-9 px-4 inline-flex items-center rounded-[10px] bg-white/5 border border-white/15 text-[0.84rem] text-white/70 hover:text-white hover:border-accent-emerald/40 transition-colors"
                >
                  登录后可发帖
                </a>
              )}
              <button
                type="button"
                onClick={openCompose}
                className="h-9 px-4 inline-flex items-center gap-1.5 rounded-[10px] bg-accent-emerald text-white font-semibold text-[0.84rem] hover:bg-emerald-600 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                发布新帖
              </button>
            </div>

            {/* 官方公告：合并官网公告 + 论坛公告，内联展开 */}
            {board === "announcement" ? (
              <div className="flex flex-col gap-3.5">
                {announcements === null ? (
                  <div className="text-center text-white/60 py-12">加载中...</div>
                ) : shownAnnouncements.length === 0 ? (
                  <div className="text-center text-white/60 py-12">暂无公告</div>
                ) : (
                  shownAnnouncements.map((a) => (
                    <details
                      key={a.key}
                      id={`ann-${a.key}`}
                      open={focusKey === a.key ? true : undefined}
                      className={`group bg-white/5 backdrop-blur-glass border rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/[0.08] ${
                        focusKey === a.key
                          ? "border-accent-emerald/70 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                          : "border-white/10 hover:border-accent-emerald/40"
                      }`}
                    >
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-5 py-4 flex items-center gap-3">
                        {a.pinned === 1 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-[0.68rem] font-semibold flex-shrink-0">
                            置顶
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[0.68rem] font-semibold flex-shrink-0 border ${
                            a.tag === "home"
                              ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                              : "bg-accent-emerald/15 border-accent-emerald/40 text-accent-emerald"
                          }`}
                        >
                          {a.tag === "home" ? "官网公告" : "论坛公告"}
                        </span>
                        <span className="text-[1rem] font-semibold text-white truncate flex-1">{a.title}</span>
                        <span className="text-[0.75rem] text-white/50 flex-shrink-0 hidden sm:inline">{fmtTime(a.created_at)}</span>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/50 flex-shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </summary>
                      <div className="px-5 pb-5 pt-3 border-t border-white/10">
                        <p className="text-[0.95rem] text-white/80 whitespace-pre-wrap leading-relaxed mt-1">{a.content}</p>
                        <div className="mt-3 text-[0.75rem] text-white/40">
                          {a.author} · {fmtTime(a.created_at)}
                        </div>
                      </div>
                    </details>
                  ))
                )}
              </div>
            ) : (
              <motion.div
                key={`${board}-${page}-${keyword}-${items?.length ?? 0}`}
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24 }}
              >
                {listLoading ? (
                  <div className="text-center text-white/60 py-12">加载中...</div>
                ) : listError ? (
                  <div className="px-4 py-3 rounded-[10px] bg-red-500/10 border border-red-400/30 text-red-300 text-[0.88rem]">
                    {listError}
                  </div>
                ) : !items || items.length === 0 ? (
                  <div className="text-center text-white/60 py-12">
                    {keyword ? "没有找到匹配的帖子" : "这个分区还没有帖子，来发第一帖吧"}
                  </div>
                ) : (
                  items.map((p) => {
                    const meta = boardMeta(p.board);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openDetail(p.id)}
                        className="group w-full text-left bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl px-5 py-4 transition-all duration-300 hover:bg-white/[0.08] hover:border-accent-emerald/40 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {p.pinned === 1 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-[0.68rem] font-semibold flex-shrink-0">
                              置顶
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-full border text-[0.68rem] font-semibold flex-shrink-0 ${meta.cls}`}>
                            {meta.name}
                          </span>
                          <span className="text-[1rem] font-semibold text-white truncate flex-1 min-w-0 group-hover:text-accent-emerald transition-colors">
                            {p.title}
                          </span>
                        </div>
                        <p className="text-[0.86rem] text-white/60 line-clamp-2 whitespace-pre-wrap break-words">
                          {p.content}
                        </p>
                        <div className="mt-3 flex items-center gap-x-4 gap-y-1 flex-wrap text-[0.74rem] text-white/45">
                          <span>{p.author_name || "匿名"}</span>
                          <span>{fmtTime(p.created_at)}</span>
                          <span>回复 {p.reply_count}</span>
                          <span>点赞 {p.like_count}</span>
                          <span>浏览 {p.views ?? 0}</span>
                        </div>
                      </button>
                    );
                  })
                )}

                {!listLoading && !listError && total > PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 rounded-[9px] bg-white/5 border border-white/10 text-[0.85rem] text-white/70 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      上一页
                    </button>
                    <span className="text-[0.82rem] text-white/50">
                      {page} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      className="px-4 py-2 rounded-[9px] bg-white/5 border border-white/10 text-[0.85rem] text-white/70 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
