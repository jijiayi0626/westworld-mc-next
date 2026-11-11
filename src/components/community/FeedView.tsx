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
const REPORT_REASONS = ["广告 / 刷屏", "辱骂 / 人身攻击", "色情 / 违法内容", "侵犯隐私", "其他"];

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

interface CheckinStatus {
  checked_in: boolean;
  points: number;
  streak: number;
  next_points: number;
}

export default function FeedView({
  me,
  onNeedLogin,
  onOpenUser,
}: {
  me: Me | null;
  onNeedLogin: () => void;
  onOpenUser?: (id: number) => void;
}) {
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
  const postImageRef = useRef<HTMLInputElement | null>(null);
  const replyImageRef = useRef<HTMLInputElement | null>(null);
  const [liking, setLiking] = useState(false);
  const [newImage, setNewImage] = useState("");
  const [replyImage, setReplyImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [checkin, setCheckin] = useState<CheckinStatus | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "reply"; id: number } | null>(null);
  const [reportReason, setReportReason] = useState("广告 / 刷屏");
  const [reportDetail, setReportDetail] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

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

  // 每日签到状态
  useEffect(() => {
    if (!me) {
      setCheckin(null);
      return;
    }
    api<CheckinStatus>("/forum/checkin")
      .then(setCheckin)
      .catch(() => undefined);
  }, [me]);

  const doCheckin = async () => {
    if (!me) return onNeedLogin();
    if (checkingIn || checkin?.checked_in) return;
    setCheckingIn(true);
    try {
      const r = await api<{ checked_in: boolean; gained: number; streak: number; points: number }>("/forum/checkin", {
        method: "POST",
      });
      setCheckin({ checked_in: true, points: r.points, streak: r.streak, next_points: r.gained });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "签到失败");
    } finally {
      setCheckingIn(false);
    }
  };

  const uploadImage = async (file: File | undefined, setter: (url: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setActionError("请选择图片文件");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setActionError("图片不能超过 4MB");
      return;
    }
    setUploadingImage(true);
    setActionError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ url: string }>("/upload/image", { method: "POST", body: fd });
      setter(res.url || "");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "图片上传失败");
    } finally {
      setUploadingImage(false);
    }
  };

  const submitReport = async () => {
    if (!reportTarget) return;
    setReporting(true);
    try {
      await api("/forum/reports", {
        method: "POST",
        body: JSON.stringify({
          target_type: reportTarget.type,
          target_id: reportTarget.id,
          reason: reportReason,
          detail: reportDetail.trim(),
        }),
      });
      setReportDone(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "举报失败");
    } finally {
      setReporting(false);
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
    if (newContent.trim().length < 5 && !newImage) {
      setActionError("正文至少需要 5 个字，或上传一张图片");
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await api<{ id: number }>("/forum/posts", {
        method: "POST",
        body: JSON.stringify({ board: newBoard, title: newTitle.trim(), content: newContent.trim(), image_url: newImage }),
      });
      setComposing(false);
      setNewTitle("");
      setNewContent("");
      setNewImage("");
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
    if (content.length < 2 && !replyImage) {
      setActionError("评论至少需要 2 个字或一张图片");
      return;
    }
    setSubmitting(true);
    setActionError("");
    try {
      const reply = await api<ForumReply>(`/forum/posts/${detail.post.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, parent_id: replyTo?.id || 0, image_url: replyImage }),
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              replies: [...prev.replies, reply],
              post: { ...prev.post, reply_count: prev.post.reply_count + 1 },
            }
          : prev,
      );
      setReplyText("");
      setReplyImage("");
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
    <div className={`flex gap-3 ${isChild ? "pl-6" : ""}`}>
      <Avatar src={r.author_avatar} name={r.author_name} size={isChild ? 26 : 30} />
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-lg border border-white/5 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            className="text-[11px] font-semibold text-white/70 transition hover:text-emerald-300"
            onClick={() => {
              if (r.author_id) onOpenUser?.(r.author_id);
            }}
          >
            {r.author_name}
          </button>
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
            {me && !canManage(r.author_id) && (
              <button
                className="text-[10px] text-white/25 transition hover:text-amber-300"
                onClick={() => {
                  setActionError("");
                  setReportTarget({ type: "reply", id: r.id });
                  setReportReason("广告 / 刷屏");
                  setReportDetail("");
                  setReportDone(false);
                }}
              >
                举报
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
        {r.image_url ? (
          <img
            src={r.image_url}
            alt="评论图片"
            className="mt-2 max-h-48 rounded-lg border border-white/10 object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">社区动态</h2>
            <p className="mt-1 text-xs text-white/40">所有注册玩家都可以发帖、评论与点赞</p>
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

        <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 p-3`}>
          {BOARD_FILTERS.map((b) => (
            <button
              key={b.key}
              onClick={() => {
                setBoard(b.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
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
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40"
            />
            <button type="submit" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10">
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
          <div className="flex flex-col gap-3 stagger-list">
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
                        <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-2 py-1 text-[10px] font-bold text-emerald-300">
                          置顶
                        </span>
                      ) : null}
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${meta.cls}`}>{meta.name}</span>
                      <span className="text-xs text-emerald-300/80">{post.author_name}</span>
                      {post.ip_region ? (
                        <span className="text-[10px] text-white/20">IP属地 {post.ip_region}</span>
                      ) : null}
                      <span className="text-xs text-white/25">{relTime(post.created_at)}</span>
                    </div>
                    <h3 className="mt-2 truncate text-[15px] font-bold text-white group-hover:text-emerald-200">
                      {post.title || "无标题"}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">{post.content}</p>
                    {post.image_url ? (
                      <img
                        src={post.image_url}
                        alt="帖子图片"
                        className="mt-2 max-h-40 w-auto rounded-lg border border-white/10 object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="mt-3 flex items-center gap-4 text-[11px] text-white/30 tabular-nums">
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
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <h3 className="text-sm font-bold text-white">每日签到</h3>
          </div>
          {me ? (
            checkin ? (
              <>
                <p className="text-[11px] leading-relaxed text-white/40">
                  已连续签到 <span className="font-bold text-emerald-300 tabular-nums">{checkin.streak}</span> 天 · 当前积分{" "}
                  <span className="font-bold text-white/75 tabular-nums">{checkin.points}</span>
                </p>
                <button
                  className={`${BTN_PRIMARY} mt-3 w-full justify-center py-2`}
                  disabled={checkin.checked_in || checkingIn}
                  onClick={() => void doCheckin()}
                >
                  {checkin.checked_in ? "今天已签到" : checkingIn ? "签到中…" : `签到 +${checkin.next_points} 积分`}
                </button>
              </>
            ) : (
              <p className="text-xs text-white/30">签到状态加载中…</p>
            )
          ) : (
            <button className={`${BTN_GHOST} w-full justify-center`} onClick={onNeedLogin}>
              登录后每日签到领积分
            </button>
          )}
        </div>

        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
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
                      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-white/25"}`} />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/75">{s.server_name}</span>
                      <span
                        className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                          online ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-white/35"
                        }`}
                      >
                        {online ? "在线" : "离线"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-white/40 tabular-nums">
                      <span>
                        玩家 <span className="font-bold text-emerald-300">{s.players_online}</span>
                        {s.max_players > 0 ? ` / ${s.max_players}` : ""}
                      </span>
                      {s.version ? <span className="truncate">{s.version}</span> : null}
                    </div>
                    {s.motd ? <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/25">{s.motd}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${CARD} p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <h3 className="text-sm font-bold text-white">官方公告</h3>
          </div>
          {announcements.length === 0 ? (
            <p className="text-xs text-white/35">暂无公告</p>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {announcements.map((a) => (
                <div key={a.id} className="py-3 first:pt-0 last:pb-0">
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
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
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
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={postImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void uploadImage(e.target.files?.[0], setNewImage);
                e.target.value = "";
              }}
            />
            <button className={BTN_GHOST} disabled={uploadingImage} onClick={() => postImageRef.current?.click()}>
              {uploadingImage ? "上传中…" : newImage ? "更换图片" : "添加图片"}
            </button>
            {newImage && (
              <div className="relative">
                <img src={newImage} alt="帖子配图预览" className="h-16 w-auto rounded-lg border border-white/10 object-cover" />
                <button
                  className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-lg border border-white/20 bg-[#0b1220] text-white/70 transition hover:bg-white/10 hover:text-white"
                  onClick={() => setNewImage("")}
                  aria-label="移除图片"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <span className="text-[11px] text-white/25">支持 JPG / PNG / WebP，单张不超过 4MB</span>
          </div>
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
                <button
                  onClick={() => {
                    if (detail.post.author_id) onOpenUser?.(detail.post.author_id);
                  }}
                >
                  <Avatar src={detail.post.author_avatar} name={detail.post.author_name} size={40} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-sm font-semibold text-white transition hover:text-emerald-300"
                      onClick={() => {
                        if (detail.post.author_id) onOpenUser?.(detail.post.author_id);
                      }}
                    >
                      {detail.post.author_name}
                    </button>
                    <span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${boardMeta(detail.post.board).cls}`}>
                      {boardMeta(detail.post.board).name}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/30">
                    {fmtTime(detail.post.created_at)}
                    {detail.post.ip_region ? ` · IP属地 ${detail.post.ip_region}` : ""}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {me && !canManage(detail.post.author_id) && (
                    <button
                      className={`${BTN_GHOST} py-2`}
                      onClick={() => {
                        setActionError("");
                        setReportTarget({ type: "post", id: detail.post.id });
                        setReportReason("广告 / 刷屏");
                        setReportDetail("");
                        setReportDone(false);
                      }}
                    >
                      举报
                    </button>
                  )}
                  {canManage(detail.post.author_id) && (
                    <button className={BTN_GHOST} onClick={() => void deletePost()}>
                      删除
                    </button>
                  )}
                </div>
              </div>

              <h3 className="mt-4 text-lg font-bold leading-snug text-white">{detail.post.title || "无标题"}</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">
                {detail.post.content}
              </p>
              {detail.post.image_url ? (
                <img
                  src={detail.post.image_url}
                  alt="帖子图片"
                  className="mt-3 max-h-80 w-auto rounded-xl border border-white/10 object-cover"
                  loading="lazy"
                />
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <button
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    detail.liked
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 bg-white/[0.04] text-white/50 hover:text-emerald-300"
                  }`}
                  disabled={liking}
                  onClick={() => void toggleLike()}
                >
                  {detail.liked ? "已点赞" : "点赞"} · <span className="tabular-nums">{detail.post.like_count}</span>
                </button>
                <span className="text-xs text-white/30 tabular-nums">{detail.post.reply_count} 条评论</span>
                <button className={`${BTN_GHOST} ml-auto py-2`} onClick={() => void sharePost()}>
                  {copied ? "已复制链接" : "分享"}
                </button>
              </div>

              <div className="mt-6 border-t border-white/5 pt-4">
                <h4 className="mb-3 text-xs font-bold tracking-wide text-white/50">全部评论</h4>
                {detail.replies.length === 0 ? (
                  <p className="pb-2 text-xs text-white/30">还没有评论，来说两句吧。</p>
                ) : (
                  <div className="flex flex-col gap-3 stagger-list">
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
              {replyImage && (
                <div className="mb-2 flex items-center gap-2">
                  <img src={replyImage} alt="评论配图预览" className="h-14 w-auto rounded-lg border border-white/10 object-cover" />
                  <button className="text-[11px] text-white/35 transition hover:text-rose-300" onClick={() => setReplyImage("")}>
                    移除图片
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={replyImageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void uploadImage(e.target.files?.[0], setReplyImage);
                    e.target.value = "";
                  }}
                />
                <button
                  className={`${BTN_GHOST} px-3`}
                  title="添加图片"
                  disabled={uploadingImage}
                  onClick={() => replyImageRef.current?.click()}
                >
                  {uploadingImage ? "…" : "图片"}
                </button>
                <textarea
                  ref={replyBoxRef}
                  className={`${INPUT} min-h-[48px] flex-1 resize-none`}
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
                  disabled={submitting || (!replyText.trim() && !replyImage)}
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

      {/* 举报 */}
      <Modal open={!!reportTarget} title="举报内容" onClose={() => setReportTarget(null)} width="max-w-md">
        {reportDone ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm font-semibold text-emerald-300">举报已提交</p>
            <p className="text-xs text-white/40">管理员会尽快核实处理，感谢你的反馈。</p>
            <button className={BTN_GHOST} onClick={() => setReportTarget(null)}>
              关闭
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Note text={actionError} />
            <div>
              <p className="mb-2 text-xs font-semibold text-white/60">举报原因</p>
              <div className="flex flex-wrap gap-2">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReportReason(r)}
                    className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition ${
                      reportReason === r
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : "border-white/10 bg-white/[0.03] text-white/45 hover:text-emerald-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className={`${INPUT} min-h-[90px] resize-none`}
              maxLength={300}
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="补充说明（可选）"
            />
            <div className="flex justify-end gap-2">
              <button className={BTN_GHOST} onClick={() => setReportTarget(null)}>
                取消
              </button>
              <button className={BTN_PRIMARY} disabled={reporting} onClick={() => void submitReport()}>
                {reporting ? "提交中…" : "提交举报"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
