"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { motion } from "motion/react";
import type { ChatLimits } from "@/components/ChatPanel";

// 聊天室按需加载：不进论坛首屏包体
const ChatPanel = dynamic(() => import("@/components/ChatPanel"), {
  ssr: false,
  loading: () => <div className="py-16 text-center font-mono text-[0.8rem] text-zinc-500">LOADING CHAT…</div>,
});

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
type ViewKey = "board" | "chat";

const PAGE_SIZE = 15;

const TABS: { key: BoardKey; name: string; code: string }[] = [
  { key: "all", name: "全部", code: "ALL" },
  { key: "general", name: "综合讨论", code: "GEN" },
  { key: "announcement", name: "官方公告", code: "ANN" },
  { key: "qa", name: "问答求助", code: "QA" },
  { key: "share", name: "作品分享", code: "SHR" },
  { key: "guide", name: "攻略教程", code: "GDE" },
];

const BOARD_META: Record<string, { name: string; code: string; desc: string }> = {
  general: { name: "综合讨论", code: "GEN", desc: "日常闲聊与自由讨论" },
  announcement: { name: "官方公告", code: "ANN", desc: "维护、活动与重要通知" },
  qa: { name: "问答求助", code: "QA", desc: "游戏问题与互助解答" },
  share: { name: "作品分享", code: "SHR", desc: "建筑、截图与视频创作" },
  guide: { name: "攻略教程", code: "GDE", desc: "玩法攻略与生存技巧" },
};

const COMPOSE_BOARDS = ["general", "qa", "share", "guide"];

const PANEL = "border border-zinc-800 bg-[#0b0b0d]";
const FIELD =
  "w-full rounded-[2px] border border-zinc-800 bg-[#08080a] px-3.5 py-2.5 text-[0.92rem] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-emerald-500/60 focus:outline-none";
const BTN_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[2px] bg-emerald-500 px-4 text-[0.82rem] font-semibold text-[#04120c] transition-colors hover:bg-emerald-400 disabled:opacity-40 cursor-pointer";
const BTN_GHOST =
  "inline-flex h-9 items-center justify-center rounded-[2px] border border-zinc-800 bg-transparent px-4 text-[0.82rem] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 cursor-pointer";

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

function boardMeta(board: string): { name: string; code: string; desc: string } {
  return BOARD_META[board] || { name: board || "其他", code: "ETC", desc: "其他讨论" };
}

/** 分区标签：工业风描边小标签 */
function BoardTag({ board, className = "" }: { board: string; className?: string }) {
  const meta = boardMeta(board);
  const active = board === "announcement";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] ${
        active ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-400"
      } ${className}`}
    >
      <span className={`h-1 w-1 ${active ? "bg-emerald-400" : "bg-zinc-500"}`} />
      {meta.code}
      <span className="font-sans tracking-normal">{meta.name}</span>
    </span>
  );
}

/** 官网公开论坛页：分区浏览、帖子详情、登录后发帖 / 回帖 / 点赞；含聊天室 */
export default function PublicForum() {
  const { user } = useAuth();

  const [view, setView] = useState<ViewKey>("board");
  const [showChat, setShowChat] = useState(true);

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

  // 首次进入：解析 ?post= / ?focus= / ?tab=chat
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = Number(params.get("post")) || 0;
    const focus = params.get("focus") || "";
    if (params.get("tab") === "chat") setView("chat");
    if (postId > 0) setDetailId(postId);
    if (focus) {
      setFocusKey(focus);
      setBoard("announcement");
    }
  }, []);

  // 论坛开关（后台可关聊天室）
  useEffect(() => {
    api<ChatLimits>("/chat/limits")
      .then((l) => setShowChat(l.show_chat !== false))
      .catch(() => undefined);
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
  const latestAnnouncements = useMemo(() => shownAnnouncements.slice(0, 4), [shownAnnouncements]);

  const switchView = (v: ViewKey) => {
    setView(v);
    if (v === "chat") {
      setDetailId(null);
      setDetail(null);
      setComposing(false);
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", v === "chat" ? "/forum?tab=chat" : "/forum");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeBoard = (key: BoardKey) => {
    setBoard(key);
    setPage(1);
    setFocusKey("");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/forum");
  };

  const openDetail = (id: number) => {
    setView("board");
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
    setView("board");
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
    <main className="relative min-h-screen overflow-hidden bg-[#08080a] text-zinc-300">
      <div className="h-nav" />

      {/* 背景：技术网格 + 顶部光源 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.032) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.032) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse at 50% 0%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, #000 30%, transparent 78%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px]"
      />

      <div className="relative z-[2] container-mc py-10 sm:py-14">
        {/* 头部 */}
        <header className="mb-8 flex flex-col gap-6 border-b border-zinc-800 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3 font-mono text-[0.64rem] uppercase tracking-[0.32em] text-emerald-400/90">
              <span className="inline-block h-px w-8 bg-emerald-500/60" />
              Westworld / Community
            </div>
            <h1 className="text-[clamp(2rem,5.4vw,3.3rem)] font-black leading-[0.95] tracking-tight text-white">
              社区论坛
            </h1>
            <p className="mt-3 max-w-[560px] text-[0.92rem] leading-relaxed text-zinc-500">
              分区讨论、玩家发帖、问答互助与作品分享；登录后可发帖、回帖、点赞，也可进入聊天室实时交流。
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-px overflow-hidden border border-zinc-800 bg-zinc-800 text-center md:min-w-[300px]">
            <div className="bg-[#0b0b0d] px-4 py-3">
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-zinc-500">Boards</dt>
              <dd className="mt-1 font-mono text-[1.15rem] font-semibold text-zinc-100">05</dd>
            </div>
            <div className="bg-[#0b0b0d] px-4 py-3">
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-zinc-500">Threads</dt>
              <dd className="mt-1 font-mono text-[1.15rem] font-semibold text-zinc-100">
                {board === "announcement" ? shownAnnouncements.length : total || 0}
              </dd>
            </div>
            <div className="bg-[#0b0b0d] px-4 py-3">
              <dt className="font-mono text-[0.6rem] uppercase tracking-[0.24em] text-zinc-500">Access</dt>
              <dd className="mt-1 font-mono text-[1.15rem] font-semibold text-emerald-400">PUBLIC</dd>
            </div>
          </dl>
        </header>

        {/* 一级视图：讨论区 / 聊天室 */}
        <div className="mb-7 flex flex-wrap items-center gap-2">
          {([
            { key: "board" as ViewKey, label: "讨论区" },
            { key: "chat" as ViewKey, label: "聊天室" },
          ]).filter((v) => v.key !== "chat" || showChat).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => switchView(v.key)}
              className={`border px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] transition-colors cursor-pointer ${
                view === v.key
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {v.label}
            </button>
          ))}
          <span className="ml-auto hidden font-mono text-[0.62rem] uppercase tracking-[0.22em] text-zinc-600 sm:inline">
            Forum / v1.0
          </span>
        </div>

        {notice && (
          <div className="mb-5 border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 font-mono text-[0.78rem] text-emerald-300">
            {notice}
          </div>
        )}

        {view === "chat" ? (
          <motion.section
            key="chat"
            className="mx-auto max-w-[880px]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
          >
            <div className={PANEL}>
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.26em] text-zinc-500">Chat / 聊天室</span>
                <span className="font-mono text-[0.62rem] text-zinc-600">polling 4s</span>
              </div>
              <div className="bg-[#f4f4f5] p-3 sm:p-4">
                <ChatPanel />
              </div>
            </div>
          </motion.section>
        ) : detailId ? (
          <motion.section
            className="mx-auto max-w-[860px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26 }}
          >
            <button
              type="button"
              onClick={closeDetail}
              className="mb-5 inline-flex items-center gap-1.5 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-emerald-400 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
              Back / 返回列表
            </button>

            {detailLoading ? (
              <div className={`${PANEL} py-14 text-center font-mono text-[0.8rem] text-zinc-500`}>LOADING…</div>
            ) : detailError ? (
              <div className="border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[0.86rem] text-red-300">
                {detailError}
              </div>
            ) : detail ? (
              <>
                <article className={`${PANEL} p-6 sm:p-8`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {detail.post.pinned === 1 && (
                      <span className="border border-red-500/40 px-1.5 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-red-400">
                        PINNED / 置顶
                      </span>
                    )}
                    <BoardTag board={detail.post.board} />
                  </div>
                  <h2 className="mb-3 break-words text-[1.45rem] font-bold leading-snug text-white">{detail.post.title}</h2>
                  <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-800 pb-4 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-zinc-500">
                    <span>{detail.post.author_name || "匿名"}</span>
                    <span>{fmtTime(detail.post.created_at)}</span>
                    <span>VIEW {detail.post.views ?? 0}</span>
                    <span>REPLY {detail.post.reply_count}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[0.94rem] leading-[1.8] text-zinc-300">
                    {detail.post.content}
                  </p>
                  <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-5">
                    <button
                      type="button"
                      onClick={() => void toggleLike()}
                      disabled={liking}
                      className={`inline-flex items-center gap-1.5 border px-3.5 py-2 text-[0.82rem] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                        detail.liked
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-800 text-zinc-400 hover:border-emerald-500/40 hover:text-zinc-100"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill={detail.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                      </svg>
                      {detail.liked ? "已点赞" : "点赞"} {detail.post.like_count}
                    </button>
                    {!user && (
                      <a href="/login" className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:text-emerald-400">
                        登录后可点赞
                      </a>
                    )}
                    {canDeletePost && (
                      <button
                        type="button"
                        onClick={() => void removePost()}
                        className="ml-auto text-[0.8rem] text-red-400/80 transition-colors hover:text-red-400 cursor-pointer"
                      >
                        删除帖子
                      </button>
                    )}
                  </div>
                </article>

                <section className="mt-7">
                  <h3 className="mb-3 font-mono text-[0.66rem] uppercase tracking-[0.26em] text-zinc-500">
                    Replies / 全部回复（{detail.replies.length}）
                  </h3>
                  {detail.replies.length === 0 ? (
                    <div className={`${PANEL} py-9 text-center text-[0.84rem] text-zinc-500`}>还没有回复，来抢沙发吧</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {detail.replies.map((r, i) => (
                        <div key={r.id} className="border border-zinc-800 bg-[#0b0b0d] px-4 py-3 transition-colors hover:border-zinc-700">
                          <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[0.66rem] uppercase tracking-[0.1em] text-zinc-500">
                            <span className="flex items-center gap-2">
                              <span className="text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                              <span className="text-zinc-400">{r.author_name || "匿名"}</span>
                              <span>{fmtTime(r.created_at)}</span>
                            </span>
                            {user && (user.role === "admin" || user.id === r.author_id) && (
                              <button
                                type="button"
                                onClick={() => void removeReply(r.id)}
                                className="text-red-400/70 transition-colors hover:text-red-400 cursor-pointer"
                              >
                                删除
                              </button>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-[0.9rem] leading-relaxed text-zinc-300">{r.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className={`${PANEL} mt-6 p-4`}>
                  {user ? (
                    <>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value.slice(0, 5000))}
                        rows={4}
                        placeholder="写下你的回复…（2-5000 字）"
                        className={`${FIELD} resize-y`}
                      />
                      <div className="mt-3 flex items-center justify-end">
                        <button type="button" onClick={() => void submitReply()} disabled={submitting} className={BTN_PRIMARY}>
                          {submitting ? "提交中" : "发表回复"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-center text-[0.86rem] text-zinc-500">
                      <a href="/login" className="text-emerald-400 hover:underline">
                        登录
                      </a>{" "}
                      后参与回复
                    </div>
                  )}
                </div>

                {actionError && (
                  <div className="mt-4 border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[0.86rem] text-red-300">
                    {actionError}
                  </div>
                )}
              </>
            ) : null}
          </motion.section>
        ) : composing ? (
          <section className="mx-auto max-w-[760px]">
            <div className="mb-4 flex items-end justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="mb-1.5 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-emerald-400/80">New Thread</div>
                <h2 className="text-[1.15rem] font-bold text-white">发布新帖</h2>
              </div>
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-zinc-200 cursor-pointer"
              >
                Cancel / 取消
              </button>
            </div>

            <div className={`${PANEL} flex flex-col gap-4 p-5 sm:p-6`}>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-zinc-500">Board / 分区</span>
                <select value={newBoard} onChange={(e) => setNewBoard(e.target.value)} className={FIELD}>
                  {COMPOSE_BOARDS.map((b) => (
                    <option key={b} value={b} className="bg-[#08080a]">
                      {boardMeta(b).code} · {boardMeta(b).name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-zinc-500">Title / 标题（5-120 字）</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value.slice(0, 120))}
                  placeholder="一句话说明你的帖子主题"
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.2em] text-zinc-500">Content / 内容（5-10000 字）</span>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value.slice(0, 10000))}
                  rows={10}
                  placeholder="详细描述你想讨论的内容…"
                  className={`${FIELD} resize-y`}
                />
              </label>
              {actionError && (
                <div className="border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[0.86rem] text-red-300">
                  {actionError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
                <button type="button" onClick={() => setComposing(false)} className={BTN_GHOST}>
                  取消
                </button>
                <button type="button" onClick={() => void submitPost()} disabled={submitting} className={BTN_PRIMARY}>
                  {submitting ? "发布中" : "发布"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
            <section className="min-w-0">
              {/* 分区 Tab */}
              <div className="mb-5 flex gap-px overflow-x-auto border border-zinc-800 bg-zinc-800">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => changeBoard(t.key)}
                    className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 font-mono text-[0.72rem] uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                      board === t.key
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-[#0b0b0d] text-zinc-500 hover:bg-[#101012] hover:text-zinc-200"
                    }`}
                  >
                    <span className={board === t.key ? "text-emerald-500/70" : "text-zinc-600"}>{t.code}</span>
                    <span className="font-sans tracking-normal">{t.name}</span>
                  </button>
                ))}
              </div>

              {/* 工具栏 */}
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 items-center gap-2 border border-zinc-800 bg-[#0b0b0d] px-3 py-1.5">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-500" aria-hidden="true">
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
                    className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[0.88rem] text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={doSearch}
                    className="border border-zinc-800 px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 cursor-pointer"
                  >
                    Search
                  </button>
                </div>
                {user ? (
                  <span className="px-1 font-mono text-[0.66rem] uppercase tracking-[0.1em] text-zinc-500">
                    AS <span className="text-emerald-400">{user.username}</span>
                  </span>
                ) : (
                  <a href="/login" className={`${BTN_GHOST} text-[0.8rem]`}>
                    登录后可发帖
                  </a>
                )}
                <button type="button" onClick={openCompose} className={BTN_PRIMARY}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  发布新帖
                </button>
              </div>

              {/* 官方公告 */}
              {board === "announcement" ? (
                <div className={`${PANEL} divide-y divide-zinc-800`}>
                  {announcements === null ? (
                    <div className="py-14 text-center font-mono text-[0.8rem] text-zinc-500">LOADING…</div>
                  ) : shownAnnouncements.length === 0 ? (
                    <div className="py-14 text-center text-[0.84rem] text-zinc-500">暂无公告</div>
                  ) : (
                    shownAnnouncements.map((a, i) => (
                      <details
                        key={a.key}
                        id={`ann-${a.key}`}
                        open={focusKey === a.key ? true : undefined}
                        className={`group transition-colors ${
                          focusKey === a.key ? "bg-emerald-500/[0.05]" : "hover:bg-[#101012]"
                        }`}
                      >
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
                          <span className="w-6 flex-shrink-0 font-mono text-[0.66rem] text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
                          {a.pinned === 1 && (
                            <span className="flex-shrink-0 border border-red-500/40 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-red-400">
                              TOP
                            </span>
                          )}
                          <span className="flex-shrink-0 border border-zinc-700 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-zinc-400">
                            {a.tag === "home" ? "SITE" : "FORUM"}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[0.98rem] font-semibold text-zinc-100">{a.title}</span>
                          <span className="hidden flex-shrink-0 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-zinc-500 sm:inline">
                            {fmtTime(a.created_at)}
                          </span>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </summary>
                        <div className="border-t border-zinc-800 px-4 pb-5 pt-4 sm:px-5">
                          <p className="whitespace-pre-wrap text-[0.93rem] leading-[1.8] text-zinc-300">{a.content}</p>
                          <div className="mt-3 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-zinc-500">
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <div className={`${PANEL} divide-y divide-zinc-800`}>
                    {listLoading ? (
                      <div className="py-14 text-center font-mono text-[0.8rem] text-zinc-500">LOADING…</div>
                    ) : listError ? (
                      <div className="px-4 py-3 text-[0.86rem] text-red-300">{listError}</div>
                    ) : !items || items.length === 0 ? (
                      <div className="py-14 text-center text-[0.84rem] text-zinc-500">
                        {keyword ? "没有找到匹配的帖子" : "这个分区还没有帖子，来发第一帖吧"}
                      </div>
                    ) : (
                      items.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openDetail(p.id)}
                          className="group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[#101012] sm:gap-4 sm:px-5 cursor-pointer"
                        >
                          <span className="w-6 flex-shrink-0 pt-1 font-mono text-[0.66rem] text-zinc-600">
                            {String((page - 1) * PAGE_SIZE + i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              {p.pinned === 1 && (
                                <span className="flex-shrink-0 border border-red-500/40 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-red-400">
                                  TOP
                                </span>
                              )}
                              <BoardTag board={p.board} />
                              <span className="min-w-0 flex-1 truncate text-[0.98rem] font-semibold text-zinc-100 transition-colors group-hover:text-emerald-300">
                                {p.title}
                              </span>
                            </div>
                            <p className="line-clamp-2 whitespace-pre-wrap break-words text-[0.85rem] leading-relaxed text-zinc-500">
                              {p.content}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-zinc-500">
                              <span>{p.author_name || "匿名"}</span>
                              <span>{fmtTime(p.created_at)}</span>
                              <span>RE {p.reply_count}</span>
                              <span>LIKE {p.like_count}</span>
                              <span>VIEW {p.views ?? 0}</span>
                            </div>
                          </div>
                          <svg
                            viewBox="0 0 24 24"
                            width="15"
                            height="15"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="mt-1 flex-shrink-0 text-zinc-600 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-400 group-hover:opacity-100"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                        </button>
                      ))
                    )}
                  </div>

                  {!listLoading && !listError && total > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className={`${BTN_GHOST} font-mono text-[0.7rem] uppercase tracking-[0.12em]`}
                      >
                        Prev
                      </button>
                      <span className="px-2 font-mono text-[0.7rem] text-zinc-500">
                        {String(page).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        disabled={page >= pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                        className={`${BTN_GHOST} font-mono text-[0.7rem] uppercase tracking-[0.12em]`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </section>

            {/* 侧栏 */}
            <aside className="hidden flex-col gap-4 lg:flex">
              <div className={PANEL}>
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-zinc-500">Notices</span>
                  <span className="font-mono text-[0.62rem] text-zinc-600">{shownAnnouncements.length}</span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {latestAnnouncements.length === 0 ? (
                    <div className="px-4 py-6 text-[0.8rem] text-zinc-500">暂无公告</div>
                  ) : (
                    latestAnnouncements.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => {
                          changeBoard("announcement");
                          setFocusKey(a.key);
                        }}
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-[#101012] cursor-pointer"
                      >
                        <div className="flex items-start gap-2">
                          {a.pinned === 1 && <span className="mt-0.5 h-1 w-1 flex-shrink-0 bg-red-400" />}
                          <span className="line-clamp-2 text-[0.85rem] font-medium leading-snug text-zinc-300">{a.title}</span>
                        </div>
                        <div className="mt-1 pl-3 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-zinc-500">
                          {a.tag === "home" ? "SITE" : "FORUM"} · {fmtTime(a.created_at)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className={PANEL}>
                <div className="border-b border-zinc-800 px-4 py-2.5">
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-zinc-500">Index / 分区</span>
                </div>
                <div className="divide-y divide-zinc-800">
                  {TABS.filter((t) => t.key !== "all").map((t) => {
                    const meta = boardMeta(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => changeBoard(t.key)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#101012] cursor-pointer ${
                          board === t.key ? "text-emerald-300" : "text-zinc-400"
                        }`}
                      >
                        <span className="font-mono text-[0.62rem] text-zinc-600">{meta.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.84rem] font-medium">{meta.name}</span>
                          <span className="mt-0.5 block truncate text-[0.72rem] text-zinc-500">{meta.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {showChat && (
                <button
                  type="button"
                  onClick={() => switchView("chat")}
                  className={`${PANEL} group flex items-center justify-between px-4 py-4 text-left transition-colors hover:border-emerald-500/40 cursor-pointer`}
                >
                  <span>
                    <span className="mb-1 block font-mono text-[0.62rem] uppercase tracking-[0.22em] text-emerald-400/80">Chat Room</span>
                    <span className="block text-[0.86rem] font-medium text-zinc-200">进入聊天室</span>
                  </span>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 transition-colors group-hover:text-emerald-400" aria-hidden="true">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-8.4h.6A8.4 8.4 0 0 1 21 11.5z" />
                  </svg>
                </button>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
