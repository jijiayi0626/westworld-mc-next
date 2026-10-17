"use client";

import { useEffect, useMemo, useState } from "react";

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

type Tag = "all" | "home" | "forum";

interface MergedItem {
  key: string;
  tag: "home" | "forum";
  title: string;
  content: string;
  author: string;
  pinned: number;
  created_at: string;
}

function ts(s: string): number {
  const d = new Date(s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 官网公开论坛页：无需登录即可查看公告（官网公告 + 论坛公告合并展示） */
export default function PublicForum() {
  const [items, setItems] = useState<MergedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tag, setTag] = useState<Tag>("all");
  const [focusKey, setFocusKey] = useState("");

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus") || "";
    setFocusKey(focus);
    if (focus.startsWith("forum-")) setTag("forum");
    if (focus.startsWith("home-")) setTag("home");

    (async () => {
      const [homeRes, forumRes] = await Promise.allSettled([
        fetch("/api/announce").then((r) => r.json()) as Promise<{ code: number; data: HomeAnnouncement[] | null }>,
        fetch("/api/forum/announcements").then((r) => r.json()) as Promise<{ code: number; data: ForumAnnouncement[] | null }>,
      ]);
      const home: MergedItem[] =
        homeRes.status === "fulfilled" && homeRes.value.code === 0 && Array.isArray(homeRes.value.data)
          ? homeRes.value.data.map((a) => ({ key: `home-${a.id}`, tag: "home" as const, title: a.title, content: a.content, author: "管理团队", pinned: 0, created_at: a.created_at }))
          : [];
      const forum: MergedItem[] =
        forumRes.status === "fulfilled" && forumRes.value.code === 0 && Array.isArray(forumRes.value.data)
          ? forumRes.value.data.map((a) => ({ key: `forum-${a.id}`, tag: "forum" as const, title: a.title, content: a.content, author: a.author_name || "管理团队", pinned: a.pinned, created_at: a.created_at }))
          : [];
      if (home.length === 0 && forum.length === 0) setError(true);
      setItems([...home, ...forum].sort((a, b) => (b.pinned - a.pinned) || ts(b.created_at) - ts(a.created_at)));
    })();
  }, []);

  const shown = useMemo(
    () => (items ?? []).filter((i) => tag === "all" || i.tag === tag),
    [items, tag],
  );

  // 定位从首页跳转过来的公告：展开 + 滚动 + 高亮
  useEffect(() => {
    if (!items || !focusKey) return;
    const el = document.getElementById(`ann-${focusKey}`);
    if (!el) return;
    el.setAttribute("open", "");
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [items, focusKey]);

  const tags: { value: Tag; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "home", label: "官方公告" },
    { value: "forum", label: "论坛公告" },
  ];

  return (
    <main className="forum-public-page relative bg-bg-dark min-h-screen overflow-hidden">
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none rules-glow" aria-hidden="true" />
      <div className="relative z-[2] container-mc py-14">
        <div className="section-header mb-10 text-center">
          <h1 className="section-title text-[clamp(2rem,5vw,3rem)] font-extrabold text-white mb-4 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
            论坛公告
          </h1>
          <p className="text-[1.1rem] text-white/80 max-w-[620px] mx-auto">
            服务器官方公告与论坛动态，无需登录即可查看；登录后可在用户中心参与聊天室讨论
          </p>
        </div>

        {/* 标签筛选 */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex gap-1 bg-white/5 border border-white/10 rounded-[12px] p-1 backdrop-blur-glass">
            {tags.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTag(t.value)}
                className={`px-4 py-2 rounded-[9px] text-[0.88rem] font-medium transition-colors cursor-pointer ${
                  tag === t.value ? "bg-accent-emerald text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)]" : "text-white/70 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 公告列表 */}
        <div className="flex flex-col gap-3.5 max-w-[860px] mx-auto">
          {items === null ? (
            <div className="text-center text-white/60 py-12">加载中...</div>
          ) : error || shown.length === 0 ? (
            <div className="text-center text-white/60 py-12">暂无公告</div>
          ) : (
            shown.map((a) => (
              <details
                key={a.key}
                id={`ann-${a.key}`}
                className={`group bg-white/5 backdrop-blur-glass border rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/[0.08] ${
                  focusKey === a.key ? "border-accent-emerald/70 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" : "border-white/10 hover:border-accent-emerald/40"
                }`}
              >
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-5 py-4 flex items-center gap-3">
                  {a.pinned === 1 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/40 text-red-300 text-[0.68rem] font-semibold flex-shrink-0">置顶</span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[0.68rem] font-semibold flex-shrink-0 border ${
                      a.tag === "home"
                        ? "bg-sky-500/15 border-sky-400/40 text-sky-300"
                        : "bg-accent-emerald/15 border-accent-emerald/40 text-accent-emerald"
                    }`}
                  >
                    {a.tag === "home" ? "官方公告" : "论坛公告"}
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

        <div className="text-center mt-10">
          <a href="/login" className="inline-flex items-center gap-1.5 text-[0.9rem] text-white/60 hover:text-accent-emerald transition-colors">
            登录后可在用户中心参与聊天室讨论
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
    </main>
  );
}
