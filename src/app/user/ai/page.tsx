"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, PageHeader, fmtTime } from "@/components/ui";

interface Convo {
  id: number;
  title: string;
  status: string;
  created_at: string;
  messages: number;
}

interface Message {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export default function AiPage() {
  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(async () => {
    try {
      setConvos(await api<Convo[]>("/ai/conversations"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void loadConvos();
  }, [loadConvos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConvo = async (id: number) => {
    setError("");
    try {
      const msgs = await api<Message[]>(`/ai/conversations/${id}`);
      setCurrent(id);
      setMessages(msgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const newConvo = () => {
    setCurrent(null);
    setMessages([]);
    setError("");
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    setError("");
    setBusy(true);
    setInput("");
    // 乐观插入用户消息
    setMessages((prev) => [
      ...(prev || []),
      { id: Date.now(), role: "user", content, created_at: "" },
    ]);
    try {
      const data = await api<{ conversation_id: number; reply: string }>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => [
        ...(prev || []),
        { id: Date.now() + 1, role: "assistant", content: data.reply, created_at: "" },
      ]);
      setCurrent(data.conversation_id);
      await loadConvos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
      setMessages((prev) => (prev || []).slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  const delConvo = async (id: number) => {
    try {
      await api(`/ai/conversations/${id}/delete`, { method: "POST" });
      if (current === id) newConvo();
      await loadConvos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <UserShell>
      <PageHeader
        title="AI 助手"
        desc="咨询服务器玩法、申请、规则等问题"
        right={<Btn onClick={newConvo} variant={current === null ? "ghost" : "primary"}>新对话</Btn>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        {/* 会话列表 */}
        <Card className="h-fit">
          <h3 className="text-[0.9rem] font-bold text-slate-300 mb-3">历史会话</h3>
          {convos === null ? (
            <Empty text="加载中..." />
          ) : convos.length === 0 ? (
            <Empty text="暂无会话" />
          ) : (
            <div className="flex flex-col gap-1">
              {convos.map((c) => (
                <div key={c.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openConvo(c.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-[8px] text-[0.85rem] transition-colors cursor-pointer truncate ${
                      current === c.id ? "bg-accent-emerald/20 text-accent-emerald" : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {c.title}
                    <span className="block text-[0.7rem] text-slate-500 mt-0.5">{fmtTime(c.created_at)} · {c.messages} 条</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => delConvo(c.id)}
                    className="text-slate-600 hover:text-red-400 px-1 cursor-pointer text-[0.8rem]"
                    aria-label="删除会话"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 聊天区 */}
        <Card className="flex flex-col h-[560px]">
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
            {error && <div className="px-3 py-2 text-[0.82rem] text-red-300 bg-red-500/10 border border-red-500/25 rounded-[8px]">{error}</div>}
            {!messages || messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                <div className="text-3xl">🤖</div>
                <p className="text-slate-400 text-[0.9rem] max-w-[320px]">
                  你好！我是西域之光 AI 助手。可以问我服务器玩法、如何入服、地址版本等问题。
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`px-4 py-3 rounded-[12px] text-[0.9rem] leading-relaxed whitespace-pre-wrap max-w-[85%] ${
                    m.role === "user"
                      ? "self-end bg-accent-emerald/15 border border-accent-emerald/25 text-white"
                      : "self-start bg-white/5 border border-white/10 text-slate-200"
                  }`}
                >
                  {m.content}
                </div>
              ))
            )}
            {busy && (
              <div className="self-start px-4 py-3 rounded-[12px] bg-white/5 border border-white/10 text-slate-400 text-[0.85rem]">
                AI 思考中...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="mt-4 flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题..."
              maxLength={4000}
              className="flex-1 bg-black/30 border border-white/10 rounded-[10px] px-4 py-2.5 text-white text-[0.95rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50"
            />
            <Btn type="submit" disabled={busy || !input.trim()}>{busy ? "..." : "发送"}</Btn>
          </form>
        </Card>
      </div>
    </UserShell>
  );
}