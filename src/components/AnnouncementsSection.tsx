"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

function formatDate(s: string) {
  if (!s) return "";
  // D1 datetime("now") → "YYYY-MM-DD HH:MM:SS"
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AnnouncementsSection() {
  const router = useRouter();
  const [list, setList] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/announce");
        const body = (await res.json()) as { code: number; data: Announcement[] | null };
        if (!cancelled && body.code === 0 && Array.isArray(body.data)) {
          setList(body.data.slice(0, 5));
        }
      } catch {
        // 网络异常时静默，不展示公告区
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || list.length === 0) return null;

  return (
    <section className="home-announcements relative z-[900]">
      <div className="container-mc">
        <div className="home-announcements-header flex items-center justify-between mb-5">
          <h2 className="text-[1.4rem] font-bold text-white inline-flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"
                className="text-accent-emerald"
              />
            </svg>
            官方公告
          </h2>
          <button
            type="button"
            onClick={() => router.push("/forum")}
            className="inline-flex items-center gap-1 text-[0.88rem] text-white/60 hover:text-accent-emerald transition-colors cursor-pointer"
          >
            进入论坛
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="home-announcements-list grid gap-3.5">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => router.push(`/forum?focus=home-${a.id}`)}
              className="home-announcement w-full text-left cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,0.22)]"
            >
              <div className="home-announcement-meta">
                <span className="home-announcement-level">公告</span>
                <span className="home-announcement-time">{formatDate(a.created_at)}</span>
              </div>
              <h3 className="home-announcement-title text-white text-[1.05rem] font-semibold mb-1.5">
                {a.title}
              </h3>
              <p className="text-slate-300 text-[0.88rem] leading-relaxed line-clamp-2">
                {a.content}
              </p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
