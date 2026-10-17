"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { ErrorNote } from "@/components/ui";

export interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  avatar_url: string;
  role: string;
  content: string;
  image_url: string;
  created_at: string;
}

export interface ChatLimits {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
  show_announcements?: boolean;
  show_chat?: boolean;
}

const POLL_MS = 4000;

function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 聊天面板（论坛「聊天」Tab 与聊天室复用） */
export default function ChatPanel() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<File | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [limits, setLimits] = useState<ChatLimits | null>(null);

  const lastIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stickToBottom = useRef(true);
  const sendingRef = useRef(false);

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const data = await api<{ messages: ChatMessage[]; online: number }>(
        `/chat/messages?after_id=${lastIdRef.current}`,
      );
      setOnline(data.online);
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !seen.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh].slice(-300);
        });
        lastIdRef.current = data.messages[data.messages.length - 1].id;
        if (stickToBottom.current) setTimeout(() => scrollToBottom(true), 50);
      }
    } catch {
      /* 轮询失败静默，下轮重试 */
    }
  }, [scrollToBottom]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const cfg = await api<ChatLimits>("/chat/limits");
        if (!stop) setLimits(cfg);
      } catch {
        /* 配置加载失败用默认行为 */
      }
      try {
        const data = await api<{ messages: ChatMessage[]; online: number }>("/chat/messages");
        if (stop) return;
        setMessages(data.messages);
        setOnline(data.online);
        setLoaded(true);
        if (data.messages.length > 0) lastIdRef.current = data.messages[data.messages.length - 1].id;
        setTimeout(() => scrollToBottom(), 60);
      } catch {
        if (!stop) {
          setLoaded(true);
          setError("聊天室加载失败，请刷新重试");
        }
      }
    })();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [poll, scrollToBottom]);

  // 消息容器滚动跟踪：接近底部才自动跟随
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loaded]);

  const send = async () => {
    const content = text.trim();
    if ((!content && !attached) || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      let msg: ChatMessage;
      if (attached) {
        const form = new FormData();
        form.append("file", attached);
        msg = await api<ChatMessage>("/chat/image", { method: "POST", body: form });
      } else {
        msg = await api<ChatMessage>("/chat/send", { method: "POST", body: JSON.stringify({ content }) });
      }
      setText("");
      setAttached(null);
      if (fileRef.current) fileRef.current.value = "";
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      lastIdRef.current = Math.max(lastIdRef.current, msg.id);
      stickToBottom.current = true;
      setTimeout(() => scrollToBottom(true), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const pickFile = (f: File | null) => {
    setError("");
    if (!f) return;
    const maxMb = limits?.max_image_mb ?? 4;
    if (f.size > maxMb * 1024 * 1024) {
      setError(`图片需小于 ${maxMb}MB`);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type)) {
      setError("仅支持 PNG / JPG / WEBP / GIF");
      return;
    }
    setAttached(f);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-[0.82rem] text-slate-500">共 {messages.length} 条消息</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[0.78rem] text-slate-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          近 5 分钟活跃 {online} 人
        </span>
      </div>

      <ErrorNote message={error} />

      {/* 欢迎公告 */}
      {limits?.welcome && (
        <div className="mb-3 px-4 py-2.5 rounded-[12px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.85rem] flex items-start gap-2">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
            <path d="M3 11 21 4v16L3 13v-2z" />
            <path d="M7 13v5a2 2 0 0 0 4 0v-3" />
          </svg>
          <span>{limits.welcome}</span>
        </div>
      )}

      {/* 已关闭提示 */}
      {limits && !limits.enabled && (
        <div className="mb-3 px-4 py-2.5 rounded-[12px] bg-amber-50 border border-amber-200 text-amber-700 text-[0.85rem] flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M5.7 5.7l12.6 12.6" />
          </svg>
          聊天室已关闭，暂时只能浏览历史消息。
        </div>
      )}

      {/* 消息区 */}
      <div
        ref={listRef}
        className="chat-scroll bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-y-auto p-4 mb-3"
        style={{ height: "clamp(340px, 54vh, 640px)" }}
      >
        {!loaded ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-[0.85rem]">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-[0.85rem]">
            还没有人发言，来抢个沙发吧～
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const isSelf = user?.id === m.user_id;
              return (
                <div key={m.id} className={`flex gap-2.5 ${isSelf ? "flex-row-reverse" : ""}`}>
                  {m.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.avatar_url} alt={m.username} className="w-9 h-9 rounded-[10px] object-cover border border-slate-200 shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-emerald-100 to-teal-100 border border-slate-200 flex items-center justify-center text-[0.8rem] font-bold text-emerald-700 shrink-0">
                      {m.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className={`chat-bubble-wrap max-w-[76%] ${isSelf ? "items-end flex flex-col" : ""}`}>
                    <div className={`flex items-center gap-2 mb-1 text-[0.74rem] ${isSelf ? "flex-row-reverse" : ""}`}>
                      <span className="text-slate-600 font-medium">{m.username}</span>
                      {m.role === "admin" && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[0.62rem]">管理员</span>
                      )}
                      <span className="text-slate-400">{fmtTime(m.created_at)}</span>
                    </div>
                    <div
                      className={`rounded-[14px] px-3.5 py-2.5 text-[0.9rem] leading-relaxed break-words ${
                        isSelf
                          ? "bg-emerald-500 text-white border border-emerald-500"
                          : "bg-slate-50 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                      {m.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={m.image_url} target="_blank" rel="noreferrer">
                          <img
                            src={m.image_url}
                            alt="聊天图片"
                            loading="lazy"
                            className="rounded-[10px] mt-1 max-h-52 max-w-[min(320px,60vw)] object-cover hover:opacity-90 transition-opacity"
                          />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      {attached && (
        <div className="flex items-center gap-2 mb-2 text-[0.82rem] text-slate-600">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 max-w-[280px]">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
              <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span className="truncate">{attached.name}</span>
            <span className="flex-shrink-0">（{(attached.size / 1024 / 1024).toFixed(2)}MB）</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setAttached(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            移除
          </button>
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3 flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="发送图片"
          className="w-10 h-10 rounded-[10px] bg-slate-50 border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, limits?.max_text ?? 400))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={limits && !limits.enabled ? "聊天室已关闭，暂时无法发言" : `说点什么…（Enter 发送，Shift+Enter 换行，最多 ${limits?.max_text ?? 400} 字）`}
          rows={1}
          disabled={!!limits && !limits.enabled}
          className="flex-1 resize-none bg-transparent border-0 outline-none text-slate-800 placeholder:text-slate-400 text-[0.92rem] py-2.5 max-h-32 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || (!text.trim() && !attached) || (!!limits && !limits.enabled)}
          className="h-10 px-5 rounded-[10px] bg-emerald-500 text-white font-semibold text-[0.88rem] disabled:opacity-40 shrink-0 transition-colors hover:bg-emerald-600 cursor-pointer"
        >
          {sending ? "发送中" : "发送"}
        </button>
      </div>
    </div>
  );
}
