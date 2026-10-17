"use client";

import { useCallback, useEffect, useState } from "react";
import { UserShell } from "@/components/Shell";
import ChatPanel, { type ChatLimits } from "@/components/ChatPanel";
import { api } from "@/lib/api";
import { PageHeader, Empty, ErrorNote } from "@/components/ui";

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
  return d.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function UserForumPage() {
  const [tab, setTab] = useState<"announcements" | "chat">("announcements");
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [limits, setLimits] = useState<ChatLimits | null>(null);

  // URL ?tab=chat 直达聊天 Tab
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "chat") setTab("chat");
  }, []);

  useEffect(() => {
    api<ChatLimits>("/chat/limits").then(setLimits).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    try {
      setList(await api<Announcement[]>("/forum/announcements"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "公告加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showAnnouncements = limits?.show_announcements !== false;
  const showChat = limits?.show_chat !== false;

  return (
    <UserShell>
      <div className="px-6 py-6 max-w-[860px] mx-auto">
        <PageHeader title="论坛" desc="服务器公告与玩家聊天室；公告由管理团队发布，聊天支持图片分享" />

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-5 bg-slate-100 rounded-[12px] p-1 w-fit max-w-full overflow-x-auto">
          {showAnnouncements && (
            <button
              type="button"
              onClick={() => setTab("announcements")}
              className={`px-4 py-2 rounded-[9px] text-[0.88rem] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === "announcements" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              公告{list ? `（${list.length}）` : ""}
            </button>
          )}
          {showChat && (
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`px-4 py-2 rounded-[9px] text-[0.88rem] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              聊天
            </button>
          )}
        </div>

        {tab === "announcements" && showAnnouncements && (
          <div className="flex flex-col gap-3">
            <ErrorNote message={error} />
            {list === null ? (
              <Empty text="加载中..." />
            ) : list.length === 0 ? (
              <Empty text="暂无公告" />
            ) : (
              list.map((a) => (
                <details key={a.id} className="group bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-4 py-3.5 flex items-center gap-2.5 hover:bg-slate-50 transition-colors">
                    {a.pinned === 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[0.68rem] font-semibold flex-shrink-0">置顶</span>
                    )}
                    <span className="text-[0.95rem] font-semibold text-slate-800 truncate flex-1">{a.title}</span>
                    <span className="text-[0.75rem] text-slate-400 flex-shrink-0 hidden sm:inline">{a.author_name} · {fmtTime(a.created_at)}</span>
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-slate-400 flex-shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                    <p className="text-[0.9rem] text-slate-600 whitespace-pre-wrap leading-relaxed mt-2">{a.content}</p>
                    <div className="mt-3 text-[0.72rem] text-slate-400 sm:hidden">{a.author_name} · {fmtTime(a.created_at)}</div>
                  </div>
                </details>
              ))
            )}
          </div>
        )}

        {tab === "chat" && showChat && <ChatPanel />}

        {/* 两个 Tab 都被关闭时的兜底提示 */}
        {!showAnnouncements && !showChat && <Empty text="论坛功能已关闭" />}
      </div>
    </UserShell>
  );
}
