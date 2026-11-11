"use client";

import type { ReactNode } from "react";

export type CommunityView = "feed" | "community" | "dms" | "groups" | "friends" | "notifications";

export type PresenceStatus = "online" | "away" | "busy" | "invisible";

export interface Presence {
  status: PresenceStatus;
  text: string;
  online: boolean;
  last_seen: number;
}

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
  peer_presence?: Presence | null;
  my_role: string;
  alias: string;
  remark?: string;
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
  remark?: string;
  role: string;
  joined_at: string;
  presence?: Presence | null;
}

export interface RoomDetail {
  room: RoomSummary & { peer_id: number; peer_presence?: Presence | null };
  me: { role: string; alias: string; remark?: string; last_read_id: number };
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
  reply_to_id?: number;
  reply_to_name?: string;
  reply_to_text?: string;
  mentions?: number[];
  created_at: string;
}

export interface Contact {
  user_id: number;
  username: string;
  avatar: string;
  alias: string;
  created_at: string;
  presence?: Presence | null;
}

export interface SearchUser {
  id: number;
  username: string;
  avatar: string;
  mc_username: string | null;
  is_contact: number;
  friend_status?: "accepted" | "outgoing" | "incoming" | "none";
  presence?: Presence | null;
}

export interface FriendRequest {
  user_id: number;
  username: string;
  avatar: string;
  created_at: string;
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
  image_url?: string;
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
  image_url?: string;
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
  { key: "general", name: "综合讨论", cls: "bg-white/10 text-white/70 border-white/15" },
  { key: "announcement", name: "官方公告", cls: "bg-white/10 text-white/70 border-white/15" },
  { key: "qa", name: "问答求助", cls: "bg-white/10 text-white/70 border-white/15" },
  { key: "share", name: "作品分享", cls: "bg-white/10 text-white/70 border-white/15" },
  { key: "guide", name: "攻略教程", cls: "bg-white/10 text-white/70 border-white/15" },
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
      className={`relative shrink-0 overflow-hidden border border-white/10 bg-white/10 ${rounded} ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || "头像"} className="h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-bold text-white/70"
          style={{ fontSize: Math.max(12, size * 0.42) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

const PRESENCE_META: Record<PresenceStatus, { label: string; dot: string }> = {
  online: { label: "在线", dot: "bg-emerald-400" },
  away: { label: "离开", dot: "bg-amber-400" },
  busy: { label: "忙碌", dot: "bg-rose-400" },
  invisible: { label: "隐身", dot: "bg-white/25" },
};

export function presenceLabel(presence?: Presence | null): string {
  if (!presence) return "离线";
  if (!presence.online) return presence.status === "invisible" ? "隐身" : "离线";
  return PRESENCE_META[presence.status]?.label || "在线";
}

export function PresenceDot({
  presence,
  size = 8,
  className = "",
}: {
  presence?: Presence | null;
  size?: number;
  className?: string;
}) {
  const dot = presence?.online ? PRESENCE_META[presence.status]?.dot : "bg-white/20";
  return (
    <span
      title={presenceLabel(presence)}
      className={`inline-block shrink-0 rounded-full ${dot || "bg-white/20"} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "owner") {
    return (
      <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
        群主
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
        管理员
      </span>
    );
  }
  return null;
}

export const CARD = "rounded-2xl border border-white/10 bg-white/[0.04]";
export const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.08]";
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0b1220] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_DANGER =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50";

export function Note({ kind = "error", text }: { kind?: "error" | "ok"; text: string }) {
  if (!text) return null;
  return (
    <div
      className={`rounded-xl border px-4 py-2 text-sm ${
        kind === "ok"
          ? "border-white/20 bg-white/10 text-white/80"
          : "border-rose-400/30 bg-rose-400/10 text-rose-200"
      }`}
    >
      {text}
    </div>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col items-center justify-center gap-2 px-6 py-12 text-center`}>
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
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-white/45">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
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
        className="absolute inset-0 cursor-default bg-black/65"
      />
      <div className={`relative w-full ${width} animate-[popup-in_0.22s_ease-out] rounded-2xl border border-white/10 bg-[#101a2c] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_24px_48px_rgba(0,0,0,0.45)]`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
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
