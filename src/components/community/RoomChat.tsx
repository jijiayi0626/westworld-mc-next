"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Me } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  Avatar,
  BTN_DANGER,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  ChatMessage,
  INPUT,
  Modal,
  Note,
  PresenceDot,
  RoleBadge,
  RoomDetail,
  RoomMember,
  SearchUser,
  Spinner,
  fmtTime,
  presenceLabel,
} from "./shared";

const EMOJIS = ["😀", "😂", "👍", "🎉", "❤️", "🔥", "😭", "😮", "🤔", "👀", "🚀", "🌙"];

function ts(s: string): number {
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export default function RoomChat({
  roomId,
  me,
  onBack,
  fallbackName,
}: {
  roomId: number;
  me: Me;
  onBack?: () => void;
  fallbackName?: string;
}) {
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [remarkDraft, setRemarkDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [qqGroup, setQqGroup] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [memberBusy, setMemberBusy] = useState(0);

  const lastIdRef = useRef(0);
  const stickRef = useRef(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const readRef = useRef(0);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const markRead = useCallback(
    async (id: number) => {
      if (!id || id <= readRef.current) return;
      readRef.current = id;
      try {
        await api(`/chat/rooms/${roomId}/read`, {
          method: "POST",
          body: JSON.stringify({ last_id: id }),
        });
      } catch {
        /* 已读上报失败不打扰用户 */
      }
    },
    [roomId],
  );

  const loadDetail = useCallback(async () => {
    try {
      const data = await api<RoomDetail>(`/chat/rooms/${roomId}`);
      setDetail(data);
      setAliasDraft((prev) => prev || data.me.alias || "");
      setRemarkDraft((prev) => prev || data.me.remark || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "会话加载失败");
    }
  }, [roomId]);

  const poll = useCallback(async () => {
    try {
      const data = await api<{ messages: ChatMessage[] }>(
        `/chat/rooms/${roomId}/messages?after_id=${lastIdRef.current}`,
      );
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          return [...prev, ...fresh].slice(-400);
        });
        const maxId = data.messages[data.messages.length - 1].id;
        lastIdRef.current = Math.max(lastIdRef.current, maxId);
        if (stickRef.current) setTimeout(() => scrollToBottom(true), 40);
        if (document.visibilityState === "visible") void markRead(lastIdRef.current);
      }
    } catch {
      /* 轮询失败静默，下一轮重试 */
    }
  }, [roomId, markRead, scrollToBottom]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detailTimer: ReturnType<typeof setInterval> | undefined;
    lastIdRef.current = 0;
    readRef.current = 0;
    setMessages([]);
    setLoaded(false);
    setDetail(null);
    setError("");
    setAliasDraft("");
    setRemarkDraft("");

    (async () => {
      try {
        const [data] = await Promise.all([
          api<{ messages: ChatMessage[] }>(`/chat/rooms/${roomId}/messages`),
          loadDetail(),
        ]);
        if (!alive) return;
        setMessages(data.messages);
        if (data.messages.length) lastIdRef.current = data.messages[data.messages.length - 1].id;
        setLoaded(true);
        setTimeout(() => scrollToBottom(), 50);
        void markRead(lastIdRef.current);
      } catch (e) {
        if (!alive) return;
        setLoaded(true);
        setError(e instanceof Error ? e.message : "会话加载失败");
      }

      const loop = () => {
        if (!alive) return;
        const delay =
          document.visibilityState === "hidden" ? 15000 : document.hasFocus() ? 1200 : 4000;
        timer = setTimeout(async () => {
          await poll();
          loop();
        }, delay);
      };
      loop();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    detailTimer = setInterval(() => {
      if (document.visibilityState === "visible") void loadDetail();
    }, 20000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (detailTimer) clearInterval(detailTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [roomId, loadDetail, poll, markRead, scrollToBottom]);

  const sendText = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const msg = await api<ChatMessage>(`/chat/rooms/${roomId}/send`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setText("");
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      lastIdRef.current = Math.max(lastIdRef.current, msg.id);
      stickRef.current = true;
      setTimeout(() => scrollToBottom(true), 30);
      void markRead(msg.id);
      void poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const msg = await api<ChatMessage>(`/chat/rooms/${roomId}/image`, { method: "POST", body: fd });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      lastIdRef.current = Math.max(lastIdRef.current, msg.id);
      stickRef.current = true;
      setTimeout(() => scrollToBottom(true), 30);
      void poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片发送失败");
    } finally {
      setUploading(false);
    }
  };

  const recall = async (id: number) => {
    try {
      await api(`/chat/messages/${id}/recall`, { method: "POST" });
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, recalled: true, content: "", image_url: "" } : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败");
    }
  };

  const saveAlias = async () => {
    try {
      await api(`/chat/rooms/${roomId}/alias`, {
        method: "POST",
        body: JSON.stringify({ alias: aliasDraft.trim() }),
      });
      if (detail?.room.kind !== "dm") {
        await api(`/chat/rooms/${roomId}/remark`, {
          method: "POST",
          body: JSON.stringify({ remark: remarkDraft.trim() }),
        });
      }
      setAliasOpen(false);
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "备注保存失败");
    }
  };

  const openSettings = () => {
    setNameDraft(detail?.room.name || "");
    setNoticeDraft(detail?.room.notice || "");
    const matched = (detail?.room.avatar || "").match(/p\.qlogo\.cn\/gh\/(\d+)/);
    setQqGroup(matched?.[1] || "");
    setSettingsOpen(true);
  };

  /** 用 QQ 群号直接取群头像（640px 高清） */
  const applyQqGroupAvatar = async () => {
    const g = qqGroup.replace(/\D/g, "");
    if (!/^\d{5,12}$/.test(g)) {
      setError("请输入 5-12 位 QQ 群号");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await api(`/chat/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify({ avatar: `https://p.qlogo.cn/gh/${g}/${g}/640/` }),
      });
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "群头像设置失败");
    } finally {
      setUploading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await api(`/chat/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nameDraft.trim(), notice: noticeDraft.trim() }),
      });
      setSettingsOpen(false);
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "群资料保存失败");
    }
  };

  const dissolveRoom = async () => {
    if (!window.confirm("确定解散该群聊吗？群消息与成员关系将全部删除，且无法恢复。")) return;
    try {
      await api(`/chat/rooms/${roomId}`, { method: "DELETE" });
      setSettingsOpen(false);
      onBack?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解散失败");
    }
  };

  const changeAvatar = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await api<{ url: string }>("/upload/avatar", { method: "POST", body: fd });
      await api(`/chat/rooms/${roomId}`, {
        method: "PATCH",
        body: JSON.stringify({ avatar: url }),
      });
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "头像更换失败");
    } finally {
      setUploading(false);
    }
  };

  const leaveRoom = async () => {
    if (!window.confirm("确定退出这个会话吗？")) return;
    try {
      await api(`/chat/rooms/${roomId}/leave`, { method: "POST" });
      onBack?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "退出失败");
    }
  };

  const setRole = async (uid: number, role: "admin" | "member") => {
    setMemberBusy(uid);
    try {
      await api(`/chat/rooms/${roomId}/members/${uid}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setMemberBusy(0);
    }
  };

  const removeMember = async (uid: number) => {
    if (!window.confirm("确定将该成员移出会话吗？")) return;
    setMemberBusy(uid);
    try {
      await api(`/chat/rooms/${roomId}/members/${uid}`, { method: "DELETE" });
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "移除失败");
    } finally {
      setMemberBusy(0);
    }
  };

  const searchUsers = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    try {
      const data = await api<{ users: SearchUser[] }>(`/chat/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.users);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addMember = async (uid: number) => {
    setMemberBusy(uid);
    try {
      await api(`/chat/rooms/${roomId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_ids: [uid] }),
      });
      setSearchResults((prev) => prev.filter((u) => u.id !== uid));
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "邀请失败");
    } finally {
      setMemberBusy(0);
    }
  };

  const room = detail?.room;
  const kind = room?.kind || "group";
  const myRole = detail?.me.role || "member";
  const privileged = me.role === "admin" || myRole === "owner" || myRole === "admin";
  const canEditRoom =
    kind === "group" ? privileged : kind === "community" ? me.role === "admin" : false;
  const canRecall = (m: ChatMessage) => {
    if (m.recalled) return false;
    if (privileged) return true;
    return m.user_id === me.id && Date.now() - ts(m.created_at) < 10 * 60 * 1000;
  };

  const title = room?.display_name || fallbackName || "会话";
  const subtitle =
    kind === "dm"
      ? `私信 · ${presenceLabel(room?.peer_presence)}${
          room?.peer_presence?.text ? ` · ${room.peer_presence.text}` : ""
        }`
      : kind === "community"
        ? `${room?.member_count || 0} 位成员 · 社区公共频道`
        : `${room?.member_count || 0} 位成员`;

  return (
    <div className={`${CARD} flex h-[calc(100vh-190px)] min-h-[520px] flex-col overflow-hidden`}>
      {/* 头部 */}
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 sm:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="返回"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <Avatar src={room?.display_avatar} name={title} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-bold text-white">{title}</h2>
            {kind === "community" && (
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                社区
              </span>
            )}
            {myRole !== "member" && <RoleBadge role={myRole} />}
          </div>
          <p className="truncate text-[11px] text-white/35">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button className={`${BTN_GHOST} !px-2.5 !py-1.5 !text-xs`} onClick={() => setAliasOpen(true)}>
            备注
          </button>
          {kind !== "dm" && (
            <button className={`${BTN_GHOST} !px-2.5 !py-1.5 !text-xs`} onClick={() => setPanelOpen(true)}>
              成员
            </button>
          )}
          {canEditRoom && (
            <>
              <button className={`${BTN_GHOST} !px-2.5 !py-1.5 !text-xs`} onClick={openSettings}>
                群设置
              </button>
              <input
                ref={avatarRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void changeAvatar(f);
                  e.target.value = "";
                }}
              />
              <button
                className={`${BTN_GHOST} hidden !px-2.5 !py-1.5 !text-xs sm:inline-flex`}
                disabled={uploading}
                onClick={() => avatarRef.current?.click()}
              >
                换头像
              </button>
            </>
          )}
          {kind !== "community" && myRole !== "owner" && (
            <button className={`${BTN_DANGER} !px-2.5 !py-1.5 !text-xs`} onClick={() => void leaveRoom()}>
              退出
            </button>
          )}
        </div>
      </div>

      {/* 公告 */}
      {room?.notice ? (
        <div className="border-b border-white/5 bg-emerald-400/[0.06] px-4 py-2 text-[11px] leading-relaxed text-emerald-200/80">
          {room.notice}
        </div>
      ) : null}

      <Note text={error} />

      {/* 消息区 */}
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {!loaded ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Avatar src={room?.display_avatar} name={title} size={52} />
            <p className="text-sm font-semibold text-white/70">{title}</p>
            <p className="max-w-xs text-xs leading-relaxed text-white/35">
              {kind === "dm" ? "打个招呼，开始你们的私信吧。" : "还没有消息，来聊第一句吧。"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {messages.map((m) => {
              if (m.recalled) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[10px] text-white/30">
                      {m.user_id === me.id ? "你" : m.username} 撤回了一条消息
                    </span>
                  </div>
                );
              }
              const mine = m.user_id === me.id;
              return (
                <div key={m.id} className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                  <Avatar src={m.avatar_url} name={m.username} size={32} />
                  <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className={`mb-1 flex items-center gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                      <span className="text-[11px] font-semibold text-white/55">{m.username}</span>
                      {m.role === "admin" ? (
                        <span className="rounded border border-emerald-400/25 px-1 text-[9px] text-emerald-300/80">管理</span>
                      ) : null}
                      <span className="text-[10px] text-white/25">{fmtTime(m.created_at)}</span>
                    </div>
                    <div
                      className={`relative rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        mine
                          ? "rounded-tr-sm bg-emerald-500/15 text-emerald-50"
                          : "rounded-tl-sm border border-white/5 bg-white/[0.06] text-white/75"
                      }`}
                    >
                      {m.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.image_url}
                          alt="聊天图片"
                          className="max-h-64 max-w-full cursor-zoom-in rounded-lg object-contain"
                          onClick={() => window.open(m.image_url, "_blank")}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      )}
                    </div>
                    {canRecall(m) && (
                      <button
                        onClick={() => void recall(m.id)}
                        className="mt-0.5 text-[10px] text-white/20 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                      >
                        撤回
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-white/10 p-2.5 sm:p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="rounded-md px-1 py-0.5 text-base transition hover:bg-white/10"
              onClick={() => setText((prev) => (prev + e).slice(0, 400))}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void sendImage(f);
              e.target.value = "";
            }}
          />
          <button
            className="mb-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-white/45 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            aria-label="发送图片"
          >
            {uploading ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="8.5" cy="9.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <textarea
            className={`${INPUT} max-h-28 min-h-[42px] flex-1 resize-none`}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
            maxLength={400}
          />
          <button className={BTN_PRIMARY} disabled={sending || !text.trim()} onClick={() => void sendText()}>
            {sending ? "发送中" : "发送"}
          </button>
        </div>
      </div>

      {/* 备注 */}
      <Modal
        open={aliasOpen}
        title={kind === "dm" ? "设置对方备注" : "群昵称与群备注"}
        onClose={() => setAliasOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[11px] text-white/40">
              {kind === "dm" ? "只对你显示的对方备注名。" : "群昵称：群里其他成员看到的昵称。"}
            </p>
            <input
              className={INPUT}
              value={aliasDraft}
              onChange={(e) => setAliasDraft(e.target.value)}
              maxLength={20}
              placeholder="最多 20 个字，留空则显示原名"
            />
          </div>
          {kind !== "dm" && (
            <div>
              <p className="mb-1.5 text-[11px] text-white/40">
                群备注：只对你显示的群名称，类似 QQ 群备注，不影响其他成员。
              </p>
              <input
                className={INPUT}
                value={remarkDraft}
                onChange={(e) => setRemarkDraft(e.target.value)}
                maxLength={20}
                placeholder="给自己看的群名，留空显示原群名"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setAliasOpen(false)}>
              取消
            </button>
            <button className={BTN_PRIMARY} onClick={() => void saveAlias()}>
              保存
            </button>
          </div>
        </div>
      </Modal>

      {/* 群设置（群主 / 管理员） */}
      <Modal open={settingsOpen} title="群设置" onClose={() => setSettingsOpen(false)}>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[11px] text-white/40">群名称</p>
            <input
              className={INPUT}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={30}
              placeholder="2-30 个字"
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] text-white/40">群公告（所有成员可见）</p>
            <textarea
              className={`${INPUT} min-h-[100px] resize-none`}
              value={noticeDraft}
              onChange={(e) => setNoticeDraft(e.target.value)}
              maxLength={200}
              placeholder="填写群公告，例如群规、活动通知…"
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] text-white/40">QQ 群号（自动使用群头像）</p>
            <div className="flex gap-2">
              <input
                className={INPUT}
                value={qqGroup}
                onChange={(e) => setQqGroup(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="例如 838177210"
                inputMode="numeric"
              />
              <button
                type="button"
                className={`${BTN_GHOST} flex-shrink-0`}
                disabled={uploading}
                onClick={() => void applyQqGroupAvatar()}
              >
                {uploading ? "设置中..." : "使用群头像"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-white/30">填写后会拉取该 QQ 群的高清群头像作为当前群聊头像。</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setSettingsOpen(false)}>
              取消
            </button>
            <button className={BTN_PRIMARY} onClick={() => void saveSettings()}>
              保存
            </button>
          </div>
          {kind === "group" && (myRole === "owner" || me.role === "admin") && (
            <div className="mt-1 border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] text-white/35">
                解散后群消息与成员关系会被删除，且无法恢复。
              </p>
              <button className={`${BTN_DANGER} w-full`} onClick={() => void dissolveRoom()}>
                解散群聊
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* 成员 */}
      <Modal open={panelOpen} title={`成员（${detail?.members.length || 0}）`} onClose={() => setPanelOpen(false)} width="max-w-lg">
        {kind === "group" && privileged && (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[11px] font-semibold text-white/45">邀请好友加入群聊</p>
            <div className="flex gap-2">
              <input
                className={INPUT}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜索玩家名称"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchUsers();
                }}
              />
              <button className={BTN_GHOST} disabled={searching} onClick={() => void searchUsers()}>
                {searching ? "搜索中" : "搜索"}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {searchResults.map((u) => {
                  const friendStatus = u.friend_status || (u.is_contact ? "accepted" : "none");
                  const canInvite = friendStatus === "accepted";
                  return (
                    <div key={u.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5">
                      <Avatar src={u.avatar} name={u.username} size={26} />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-xs text-white/70">{u.username}</span>
                        <PresenceDot presence={u.presence} size={6} />
                      </div>
                      <button
                        className="rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300 disabled:opacity-40"
                        disabled={memberBusy === u.id || !canInvite}
                        title={canInvite ? undefined : "只能邀请已成为好友的玩家"}
                        onClick={() => void addMember(u.id)}
                      >
                        {canInvite ? "邀请" : "仅好友"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[10px] text-white/25">只能邀请已通过好友申请的玩家。</p>
          </div>
        )}

        <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
          {(detail?.members || []).map((m: RoomMember) => {
            const isOwner = m.role === "owner";
            const canChangeRole =
              !isOwner &&
              m.user_id !== me.id &&
              (kind === "community" || (kind === "group" && privileged));
            const canRemove =
              kind === "group" && privileged && !isOwner && m.user_id !== me.id;
            return (
              <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                <Avatar src={m.avatar} name={m.alias || m.username} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-white/75">{m.alias || m.username}</span>
                    <PresenceDot presence={m.presence} size={6} />
                    <RoleBadge role={m.role} />
                    {m.user_id === me.id && <span className="text-[10px] text-white/25">我</span>}
                  </div>
                  <p className="truncate text-[10px] text-white/25">
                    {presenceLabel(m.presence)}
                    {m.alias ? ` · 原名 ${m.username}` : ""}
                    {m.presence?.text ? ` · ${m.presence.text}` : ""}
                  </p>
                </div>
                {canChangeRole && (
                  <button
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/45 transition hover:bg-white/10 hover:text-white"
                    disabled={memberBusy === m.user_id}
                    onClick={() => void setRole(m.user_id, m.role === "admin" ? "member" : "admin")}
                  >
                    {m.role === "admin" ? "取消管理" : "设为管理员"}
                  </button>
                )}
                {canRemove && (
                  <button
                    className="rounded-md px-2 py-1 text-[10px] text-white/25 transition hover:bg-rose-500/10 hover:text-rose-300"
                    disabled={memberBusy === m.user_id}
                    onClick={() => void removeMember(m.user_id)}
                  >
                    移除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
