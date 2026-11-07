"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSiteContent } from "@/components/SiteContentProvider";
import { api } from "@/lib/api";
import FeedView from "./FeedView";
import RoomChat from "./RoomChat";
import RoomsView from "./RoomsView";
import {
  Avatar,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  CommunityLimits,
  CommunityView,
  RoomSummary,
} from "./shared";

const NAV: { key: CommunityView; label: string; desc: string }[] = [
  { key: "feed", label: "社区动态", desc: "发帖 · 讨论" },
  { key: "community", label: "社区群", desc: "全员频道" },
  { key: "dms", label: "私信", desc: "好友一对聊" },
  { key: "groups", label: "群聊", desc: "自建群组" },
  { key: "friends", label: "好友", desc: "添加 · 备注" },
];

function NavIcon({ view }: { view: CommunityView }) {
  const cls = "h-[18px] w-[18px]";
  if (view === "feed") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" strokeLinecap="round" />
      </svg>
    );
  }
  if (view === "community") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0111 0" strokeLinecap="round" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M15.5 13.5A4.5 4.5 0 0121 18" strokeLinecap="round" />
      </svg>
    );
  }
  if (view === "dms") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
        <path d="M5 6h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4 3v-3H5a1 1 0 01-1-1V7a1 1 0 011-1z" strokeLinejoin="round" />
        <path d="M8 10h8M8 13h5" strokeLinecap="round" />
      </svg>
    );
  }
  if (view === "groups") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
        <rect x="4" y="6" width="16" height="13" rx="2" />
        <path d="M9 6V4M15 6V4" strokeLinecap="round" />
        <path d="M8 11h3v3H8zM14 11h2M14 15h2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19a6 6 0 0112 0" strokeLinecap="round" />
      <path d="M18 8v6M15 11h6" strokeLinecap="round" />
    </svg>
  );
}

export default function CommunityApp() {
  const { user, loading, refresh } = useAuth();
  const siteContent = useSiteContent();
  const bgImage = siteContent.community.bg_image || siteContent.hero.bg_image;
  const [view, setView] = useState<CommunityView>("feed");
  const [active, setActive] = useState<{ view: "dms" | "groups"; id: number; name: string } | null>(null);
  const [limits, setLimits] = useState<CommunityLimits | null>(null);
  const [unread, setUnread] = useState({ community: 0, dm: 0, group: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api<CommunityLimits>("/chat/limits")
      .then(setLimits)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v && NAV.some((n) => n.key === v)) setView(v as CommunityView);
  }, []);

  const loadUnread = useCallback(async () => {
    if (!user) {
      setUnread({ community: 0, dm: 0, group: 0, total: 0 });
      return;
    }
    try {
      const data = await api<{ rooms: RoomSummary[] }>("/chat/rooms");
      const next = { community: 0, dm: 0, group: 0, total: 0 };
      for (const r of data.rooms) {
        const n = Number(r.unread) || 0;
        if (r.kind === "community") next.community += n;
        else if (r.kind === "group") next.group += n;
        else next.dm += n;
        next.total += n;
      }
      setUnread(next);
    } catch {
      /* 未读统计失败不打扰 */
    }
  }, [user]);

  useEffect(() => {
    void loadUnread();
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadUnread();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadUnread, user, view, active]);

  const needLogin = () => {
    window.location.href = "/login";
  };

  const changeAvatar = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await api<{ url: string }>("/upload/avatar", { method: "POST", body: fd });
      await api("/user/profile", {
        method: "POST",
        body: JSON.stringify({
          bio: user.bio || "",
          avatar: url,
          qq: user.qq || "",
          discord: user.discord || "",
          mc_username: user.mc_username || "",
        }),
      });
      await refresh();
    } catch {
      /* 失败时保持原头像 */
    } finally {
      setUploading(false);
    }
  };

  const switchView = (v: CommunityView) => {
    setView(v);
    setActive(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略历史记录写入失败 */
    }
  };

  const openRoom = (id: number, name: string) => {
    if (view === "dms" || view === "groups") setActive({ view, id, name });
  };

  const badgeOf = (key: CommunityView) => {
    if (key === "community") return unread.community;
    if (key === "dms") return unread.dm;
    if (key === "groups") return unread.group;
    return 0;
  };

  const loginGate = (
    <div className={`${CARD} flex flex-col items-center justify-center gap-3 px-6 py-16 text-center`}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-xl font-black text-[#04120c]">
        西
      </div>
      <h2 className="text-lg font-extrabold text-white">加入西域社区</h2>
      <p className="max-w-sm text-xs leading-relaxed text-white/40">
        登录后即可发布动态、加入社区群、添加好友、创建群聊并互发私信。
      </p>
      <div className="mt-1 flex gap-2">
        <Link href="/login" className={BTN_PRIMARY}>
          登录
        </Link>
        <Link href="/login" className={BTN_GHOST}>
          注册账号
        </Link>
      </div>
    </div>
  );

  const content = (() => {
    if (view === "feed") return <FeedView me={user} onNeedLogin={needLogin} />;
    if (!user) return loginGate;

    if (view === "community") {
      return <RoomChat roomId={1} me={user} fallbackName="社区群" />;
    }

    if (view === "friends") {
      return <RoomsView mode="friends" me={user} limits={limits} onOpenRoom={openRoom} onGoFriends={() => switchView("dms")} />;
    }

    if (active && active.view === view) {
      return (
        <RoomChat
          roomId={active.id}
          me={user}
          fallbackName={active.name}
          onBack={() => {
            setActive(null);
            void loadUnread();
          }}
        />
      );
    }

    return (
      <RoomsView
        mode={view}
        me={user}
        limits={limits}
        onOpenRoom={openRoom}
        onGoFriends={() => switchView("friends")}
      />
    );
  })();

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] text-sm text-white/40">
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
        正在进入社区…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0b1220] text-white">
      {bgImage && (
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat opacity-90"
          style={{ backgroundImage: `url('${bgImage}')` }}
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0b1220]/35 via-[#0b1220]/60 to-[#0b1220]/85"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.08] blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-[380px] w-[380px] rounded-full bg-sky-500/[0.06] blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-[300px] w-[560px] -translate-x-1/2 rounded-full bg-teal-500/[0.05] blur-[120px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-xl">
        <div className="relative mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-black text-[#04120c]">
              西
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-extrabold tracking-tight text-white">西域社区</p>
              <p className="hidden text-[9px] tracking-[0.22em] text-emerald-300/60 sm:block">
                WESTWORLD COMMUNITY
              </p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className={`${BTN_GHOST} hidden !px-3 !py-1.5 !text-xs sm:inline-flex`}>
              返回官网
            </Link>
            {user ? (
              <Link
                href="/user"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 transition hover:bg-white/10"
              >
                <Avatar src={user.avatar} name={user.username} size={26} />
                <span className="hidden max-w-[110px] truncate text-xs font-semibold text-white/75 sm:block">
                  {user.username}
                </span>
              </Link>
            ) : (
              <Link href="/login" className={BTN_PRIMARY}>
                登录 / 注册
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1320px] gap-6 px-4 py-6 md:px-6">
        <aside className="hidden w-[230px] shrink-0 lg:block">
          <nav className={`${CARD} flex flex-col gap-1 p-2`}>
            {NAV.map((item) => {
              const activeItem = view === item.key;
              const badge = badgeOf(item.key);
              return (
                <button
                  key={item.key}
                  onClick={() => switchView(item.key)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    activeItem
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "text-white/50 hover:bg-white/[0.05] hover:text-white/80"
                  }`}
                >
                  <span className={activeItem ? "text-emerald-300" : "text-white/35"}>
                    <NavIcon view={item.key} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-[10px] text-white/25">{item.desc}</span>
                  </span>
                  {badge > 0 && (
                    <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-[#04120c]">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {user ? (
            <div className={`${CARD} mt-4 p-4`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => avatarRef.current?.click()}
                  className="group relative overflow-hidden rounded-xl"
                  title="点击更换头像"
                >
                  <Avatar src={user.avatar} name={user.username} size={46} />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                    {uploading ? "上传中" : "更换"}
                  </span>
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white/85">{user.username}</p>
                  <p className="text-[10px] text-white/30">
                    {user.role === "admin" ? "社区管理员" : "社区成员"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <Link
                  href="/user"
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                >
                  个人中心
                  <span className="text-white/20">→</span>
                </Link>
                <button
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                  onClick={() => avatarRef.current?.click()}
                >
                  更换头像
                  <span className="text-white/20">→</span>
                </button>
              </div>
            </div>
          ) : (
            <div className={`${CARD} mt-4 p-4`}>
              <p className="text-xs font-semibold text-white/70">游客模式</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                登录后可发帖、加入社区群与好友私信。
              </p>
              <Link href="/login" className={`${BTN_PRIMARY} mt-3 w-full`}>
                登录 / 注册
              </Link>
            </div>
          )}

          <div className={`${CARD} mt-4 p-4`}>
            <p className="text-[11px] font-semibold text-white/50">社区提示</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/25">
              文明交流，禁止刷屏与广告。违规内容会被管理员撤回或删除。
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {NAV.map((item) => {
              const activeItem = view === item.key;
              const badge = badgeOf(item.key);
              return (
                <button
                  key={item.key}
                  onClick={() => switchView(item.key)}
                  className={`relative shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    activeItem
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                      : "border-white/10 bg-white/[0.04] text-white/45"
                  }`}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-[#04120c]">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {content}
        </main>
      </div>
    </div>
  );
}
