"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSiteContent } from "@/components/SiteContentProvider";
import { api } from "@/lib/api";
import FeedView from "./FeedView";
import NotificationsView from "./NotificationsView";
import ProfileView from "./ProfileView";
import RoomChat from "./RoomChat";
import RoomsView from "./RoomsView";
import {
  Avatar,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  CommunityLimits,
  CommunityView,
  INPUT,
  Modal,
  Presence,
  PresenceDot,
  PresenceStatus,
  RoomSummary,
  presenceLabel,
} from "./shared";

const NAV: { key: CommunityView; label: string; desc: string }[] = [
  { key: "feed", label: "社区动态", desc: "发帖 · 讨论" },
  { key: "notifications", label: "通知", desc: "回复 · 点赞" },
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
  if (view === "notifications") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cls}>
        <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 004 0" strokeLinecap="round" />
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
  const [notifUnread, setNotifUnread] = useState(0);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [presence, setPresence] = useState<Presence | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<PresenceStatus>("online");
  const [statusText, setStatusText] = useState("");
  const avatarRef = useRef<HTMLInputElement | null>(null);

  // 在线心跳：25 秒一次，页面隐藏时暂停；90 秒无心跳即视为离线
  useEffect(() => {
    if (!user) {
      setPresence(null);
      return;
    }
    let alive = true;
    const beat = async () => {
      try {
        const p = await api<Presence>("/presence/heartbeat", { method: "POST" });
        if (alive) setPresence(p);
      } catch {
        /* 心跳失败不打扰 */
      }
    };
    void beat();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void beat();
    }, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user]);

  const openStatus = () => {
    setStatusDraft(presence?.status || "online");
    setStatusText(presence?.text || "");
    setStatusOpen(true);
  };

  const saveStatus = async () => {
    try {
      const p = await api<Presence>("/presence/status", {
        method: "POST",
        body: JSON.stringify({ status: statusDraft, text: statusText.trim() }),
      });
      setPresence(p);
      setStatusOpen(false);
    } catch {
      /* 保存失败保持面板，用户可重试 */
    }
  };

  useEffect(() => {
    api<CommunityLimits>("/chat/limits")
      .then(setLimits)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("view");
    if (v && NAV.some((n) => n.key === v)) setView(v as CommunityView);
    const uid = Number(sp.get("user")) || 0;
    if (uid > 0) setProfileId(uid);
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

  const loadNotifUnread = useCallback(async () => {
    if (!user) {
      setNotifUnread(0);
      return;
    }
    try {
      const data = await api<{ unread: number }>("/forum/notifications/unread");
      setNotifUnread(Number(data.unread) || 0);
    } catch {
      /* 通知统计失败不打扰 */
    }
  }, [user]);

  useEffect(() => {
    void loadNotifUnread();
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifUnread();
    }, 20000);
    return () => clearInterval(timer);
  }, [loadNotifUnread, user]);

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
    setProfileId(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      url.searchParams.delete("user");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略历史记录写入失败 */
    }
  };

  const openProfile = (id: number) => {
    setProfileId(id);
    setActive(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("user", String(id));
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略 */
    }
  };

  const closeProfile = () => {
    setProfileId(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("user");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略 */
    }
  };

  const openPost = (id: number) => {
    setProfileId(null);
    setView("feed");
    setActive(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "feed");
      url.searchParams.set("post", String(id));
      url.searchParams.delete("user");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* 忽略 */
    }
  };

  const openRoom = (id: number, name: string) => {
    if (view === "dms" || view === "groups") setActive({ view, id, name });
  };

  const badgeOf = (key: CommunityView) => {
    if (key === "notifications") return notifUnread;
    if (key === "community") return unread.community;
    if (key === "dms") return unread.dm;
    if (key === "groups") return unread.group;
    return 0;
  };

  const loginGate = (
    <div className={`${CARD} flex flex-col items-center justify-center gap-3 px-6 py-16 text-center`}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/10 text-xl font-black text-white/70">
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
    if (profileId) {
      return <ProfileView userId={profileId} me={user} onBack={closeProfile} onOpenPost={openPost} />;
    }
    if (view === "feed") return <FeedView me={user} onNeedLogin={needLogin} onOpenUser={openProfile} />;
    if (!user) return loginGate;

    if (view === "notifications") {
      return <NotificationsView onOpenPost={openPost} onRead={() => setNotifUnread(0)} />;
    }

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
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
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
        className="pointer-events-none fixed inset-0 bg-[#0b1220]/75"
        aria-hidden
      />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1220]/95">
        <div className="relative mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 text-sm font-black text-white/70">
              西
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-extrabold tracking-tight text-white">西域社区</p>
              <p className="hidden text-[9px] tracking-[0.22em] text-white/40 sm:block">
                WESTWORLD COMMUNITY
              </p>
            </div>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className={`${BTN_GHOST} hidden !px-3 !py-2 !text-xs sm:inline-flex`}>
              返回官网
            </Link>
            {user ? (
              <Link
                href="/user"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2 py-2 transition hover:bg-white/10"
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
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    activeItem
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:bg-white/[0.05] hover:text-white/80"
                  }`}
                >
                  <span className={activeItem ? "text-white/90" : "text-white/35"}>
                    <NavIcon view={item.key} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-[10px] text-white/25">{item.desc}</span>
                  </span>
                  {badge > 0 && (
                    <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-[#0b1220] tabular-nums">
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
                  <button
                    className="mt-1 flex max-w-full items-center gap-2 text-[10px] text-white/35 transition hover:text-white/70"
                    onClick={openStatus}
                    title="设置在线状态"
                  >
                    <PresenceDot presence={presence} size={6} />
                    <span className="truncate">
                      {presenceLabel(presence)}
                      {presence?.text ? ` · ${presence.text}` : " · 设置状态"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href="/user"
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                >
                  个人中心
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
                <button
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                  onClick={() => openProfile(user.id)}
                >
                  我的主页
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                <button
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50 transition hover:bg-white/[0.07] hover:text-white"
                  onClick={() => avatarRef.current?.click()}
                >
                  更换头像
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
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
            <p className="mt-1 text-[10px] leading-relaxed text-white/25">
              文明交流，禁止刷屏与广告。违规内容会被管理员撤回或删除。
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {NAV.map((item) => {
              const activeItem = view === item.key;
              const badge = badgeOf(item.key);
              return (
                <button
                  key={item.key}
                  onClick={() => switchView(item.key)}
                  className={`relative shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    activeItem
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 bg-white/[0.04] text-white/45"
                  }`}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="ml-1 rounded-lg bg-white px-1 py-1 text-[9px] font-bold text-[#0b1220] tabular-nums">
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

      <Modal open={statusOpen} title="设置在线状态" onClose={() => setStatusOpen(false)}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["online", "在线", "正常接收消息"],
                ["away", "离开", "暂时不在"],
                ["busy", "忙碌", "请勿打扰"],
                ["invisible", "隐身", "显示为离线"],
              ] as [PresenceStatus, string, string][]
            ).map(([key, label, desc]) => (
              <button
                key={key}
                onClick={() => setStatusDraft(key)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  statusDraft === key
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"
                }`}
              >
                <span className="block text-xs font-semibold">{label}</span>
                <span className="block text-[10px] text-white/30">{desc}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-2 text-[11px] text-white/40">状态文案（好友与群成员可见）</p>
            <input
              className={INPUT}
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              maxLength={30}
              placeholder="例如：在肝建筑 / 挂机中 / 晚上开黑"
            />
          </div>
          <p className="text-[10px] text-white/25">
            在线状态每 25 秒自动刷新；连续 90 秒没有心跳会显示为离线。
          </p>
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setStatusOpen(false)}>
              取消
            </button>
            <button className={BTN_PRIMARY} onClick={() => void saveStatus()}>
              保存
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
