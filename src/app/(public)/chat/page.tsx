"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import ScrollFadeUp from "@/components/ScrollFadeUp";

interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  avatar_url: string;
  role: string;
  content: string;
  image_url: string;
  created_at: string;
}

const POLL_MS = 4000;

function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<File | null>(null);

  const lastIdRef = useRef(0);
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

  // 首次加载最近 50 条 + 启动轮询
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const data = await api<{ messages: ChatMessage[]; online: number }>("/chat/messages");
        if (stop) return;
        setMessages(data.messages);
        setOnline(data.online);
        if (data.messages.length > 0) lastIdRef.current = data.messages[data.messages.length - 1].id;
        setTimeout(() => scrollToBottom(), 60);
      } catch {
        setError("聊天室加载失败，请刷新重试");
      }
    })();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [poll, scrollToBottom]);

  // 滚动位置跟踪：接近底部才自动跟随
  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement;
      if (!el) return;
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    if (f.size > 4 * 1024 * 1024) {
      setError("图片需小于 4MB");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type)) {
      setError("仅支持 PNG / JPG / WEBP / GIF");
      return;
    }
    setAttached(f);
  };

  return (
    <main className="relative bg-bg-dark min-h-screen overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes chat-blob { 0%,100% { opacity:.5 } 50% { opacity:.85 } }
        .chat-blob { animation: chat-blob 7s ease-in-out infinite; }
      ` }} />
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="chat-blob absolute -top-24 right-0 w-[380px] h-[380px] rounded-full bg-sky-500/12 blur-[110px]" />
        <div className="chat-blob absolute bottom-0 -left-24 w-[360px] h-[360px] rounded-full bg-emerald-500/12 blur-[110px]" style={{ animationDelay: "3s" }} />
      </div>

      <div className="relative z-[2] container-mc py-8 flex flex-col" style={{ minHeight: "calc(100vh - var(--nav-h, 64px) - 0px)" }}>
        {/* 头部 */}
        <ScrollFadeUp>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="text-[1.6rem] font-extrabold text-white flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-[12px] bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center text-emerald-300">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
                  </svg>
                </span>
                服务器聊天室
              </h1>
              <p className="text-white/55 text-[0.88rem] mt-1.5">和大家聊聊游戏、分享截图（支持发图，≤4MB）</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/8 border border-white/12 text-[0.8rem] text-white/70 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              近 5 分钟活跃 {online} 人
            </span>
          </div>
        </ScrollFadeUp>

        {/* 消息区 */}
        <div className="flex-1 rounded-[20px] p-4 sm:p-5 overflow-y-auto mb-4" style={{ maxHeight: "56vh", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", background: "linear-gradient(150deg, rgba(255,255,255,.07), rgba(255,255,255,.03))", border: "1px solid rgba(255,255,255,.12)" }}>
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/40 text-[0.9rem] py-16">
              还没有人发言，来抢个沙发吧～
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {messages.map((m) => {
                const isSelf = user?.id === m.user_id;
                return (
                  <div key={m.id} className={`flex gap-2.5 ${isSelf ? "flex-row-reverse" : ""}`}>
                    {m.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar_url} alt={m.username} className="w-9 h-9 rounded-[10px] object-cover border border-white/15 shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-emerald-400/30 to-sky-400/20 border border-white/15 flex items-center justify-center text-[0.8rem] font-bold text-white/80 shrink-0">
                        {m.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className={`max-w-[76%] ${isSelf ? "items-end flex flex-col" : ""}`}>
                      <div className={`flex items-center gap-2 mb-1 text-[0.75rem] ${isSelf ? "flex-row-reverse" : ""}`}>
                        <span className="text-white/70 font-medium">{m.username}</span>
                        {m.role === "admin" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-300 text-[0.62rem]">管理员</span>
                        )}
                        <span className="text-white/35">{fmtTime(m.created_at)}</span>
                      </div>
                      <div
                        className={`rounded-[14px] px-3.5 py-2.5 text-[0.92rem] leading-relaxed break-words ${
                          isSelf
                            ? "bg-gradient-to-br from-emerald-500/80 to-teal-600/80 text-white border border-emerald-300/25"
                            : "bg-white/8 text-white/90 border border-white/12"
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
                              className={`rounded-[10px] mt-1 max-h-52 max-w-[min(320px,60vw)] object-cover border border-white/15 hover:opacity-90 transition-opacity ${m.content ? "" : "mb-0"}`}
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
        {error && (
          <div className="mb-2.5 px-4 py-2.5 rounded-[12px] bg-red-500/15 border border-red-300/30 text-red-200 text-[0.85rem]">
            {error}
          </div>
        )}
        {user ? (
          <div className="rounded-[16px] border border-white/12 bg-white/6 backdrop-blur-md p-3">
            {attached && (
              <div className="flex items-center gap-2 mb-2 text-[0.82rem] text-white/70">
                <span className="px-2.5 py-1 rounded-full bg-emerald-400/15 border border-emerald-300/25 text-emerald-300 truncate max-w-[240px]">
                  📎 {attached.name}（{(attached.size / 1024 / 1024).toFixed(2)}MB）
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttached(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-white/50 hover:text-white/90 cursor-pointer"
                >
                  移除
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
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
                title="发送图片（≤4MB）"
                className="w-11 h-11 rounded-[12px] bg-white/8 border border-white/15 text-white/70 hover:text-white hover:bg-white/14 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 400))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="说点什么…（Enter 发送，Shift+Enter 换行，最多 400 字）"
                rows={1}
                className="flex-1 resize-none bg-transparent border-0 outline-none text-white placeholder:text-white/35 text-[0.95rem] py-2.5 max-h-32"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || (!text.trim() && !attached)}
                className="h-11 px-5 rounded-[12px] bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-[0.9rem] disabled:opacity-40 shrink-0 transition-all hover:from-emerald-400 hover:to-teal-400 cursor-pointer"
              >
                {sending ? "发送中" : "发送"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] border border-white/12 bg-white/6 backdrop-blur-md px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-white/65 text-[0.9rem]">登录后即可参与聊天、发送图片（游客可浏览）</p>
            <div className="flex gap-2.5">
              <Link href="/login" className="px-5 py-2.5 rounded-[12px] bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[0.88rem] font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all">
                登录
              </Link>
              <Link href="/register" className="px-5 py-2.5 rounded-[12px] bg-white/8 border border-white/15 text-white text-[0.88rem] font-semibold hover:bg-white/14 transition-colors">
                注册
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
