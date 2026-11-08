"use client";

import type { ReactNode } from "react";

export type CommunityView = "feed" | "community" | "dms" | "groups" | "friends";

export interface RoomSummary {
  id: number;
  kind: "community" | "group" | "dm";
  name: string;
  avatar: string;
  notice: string;
  owner_id: number | null;
  display_name: string;
  display_avatar: string;
  peer_id: number;
  my_role: string;
  alias: string;
  last_read_id: number;
  member_count: number;
  unread: number;
  last_id: number | null;
  last_text: string | null;
  last_image: string | null;
  last_at: string | null;
  last_user: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomMember {
  user_id: number;
  username: string;
  avatar: string;
  alias: string;
  role: string;
  joined_at: string;
}

export interface RoomDetail {
  room: RoomSummary & { peer_id: number };
  me: { role: string; alias: string; last_read_id: number };
  members: RoomMember[];
}

export interface ChatMessage {
  id: number;
  room_id: number;
  user_id: number;
  username: string;
  avatar_url: string;
  role: string;
  content: string;
  image_url: string;
  recalled: boolean;
  recalled_at: string;
  recalled_by: number;
  created_at: string;
}

export interface Contact {
  user_id: number;
  username: string;
  avatar: string;
  alias: string;
  created_at: string;
}

export interface SearchUser {
  id: number;
  username: string;
  avatar: string;
  mc_username: string | null;
  is_contact: number;
}

export interface ForumPostItem {
  id: number;
  board: string;
  title: string;
  content: string;
  author_id: number | null;
  author_name: string;
  author_avatar: string;
  ip_region?: string;
  pinned: number;
  reply_count: number;
  like_count: number;
  views: number;
  created_at: string;
}

export interface ForumPostDetail extends ForumPostItem {
  updated_at: string;
}

export interface ForumReply {
  id: number;
  post_id: number;
  author_id: number | null;
  author_name: string;
  author_avatar: string;
  ip_region?: string;
  parent_id?: number;
  reply_to?: string;
  content: string;
  created_at: string;
}

export interface CommunityLimits {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
  group_create: "all" | "admin";
  can_create_group: boolean;
  show_announcements: boolean;
  show_chat: boolean;
}

export const BOARDS = [
  { key: "general", name: "综合讨论", cls: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
  { key: "announcement", name: "官方公告", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
  { key: "qa", name: "问答求助", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
  { key: "share", name: "作品分享", cls: "bg-pink-500/15 text-pink-300 border-pink-400/30" },
  { key: "guide", name: "攻略教程", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
] as const;

export const COMPOSE_BOARDS = ["general", "qa", "share", "guide"];

export function boardMeta(board: string): { name: string; cls: string } {
  return BOARDS.find((b) => b.key === board) || {
    name: board || "其他",
    cls: "bg-white/10 text-white/60 border-white/20",
  };
}

export function fmtTime(s: string): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relTime(s: string): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return fmtTime(s);
}

const GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-blue-500",
];

function gradientOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function Avatar({
  src,
  name,
  size = 40,
  className = "",
  rounded = "rounded-xl",
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const label = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden ${rounded} bg-gradient-to-br ${gradientOf(name || "?")} ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || "头像"} className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-bold text-white/95"
          style={{ fontSize: Math.max(12, size * 0.42) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "owner") {
    return (
      <span className="rounded-md border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
        群主
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="rounded-md border border-emerald-400/30 bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
        管理员
      </span>
    );
  }
  return null;
}

export const CARD = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl";
export const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50 focus:bg-white/[0.08]";
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#04120c] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50";

export function Note({ kind = "error", text }: { kind?: "error" | "ok"; text: string }) {
  if (!text) return null;
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${
        kind === "ok"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-rose-400/30 bg-rose-400/10 text-rose-200"
      }`}
    >
      {text}
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col items-center justify-center gap-2 px-6 py-14 text-center`}>
      <div className="mb-1 h-12 w-12 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-full w-full text-white/30">
          <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-white/80">{title}</p>
      {desc && <p className="max-w-sm text-xs leading-relaxed text-white/40">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "加载中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-white/45">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
      {label}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        aria-label="关闭"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm"
      />
      <div className={`relative w-full ${width} animate-[popup-in_0.22s_ease-out] rounded-2xl border border-white/10 bg-[#101a2c] p-5 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
