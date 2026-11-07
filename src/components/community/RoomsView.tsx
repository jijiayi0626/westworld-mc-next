"use client";

import { useCallback, useEffect, useState } from "react";
import type { Me } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  Avatar,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  CommunityLimits,
  Contact,
  EmptyState,
  INPUT,
  Modal,
  Note,
  RoomSummary,
  SearchUser,
  Spinner,
  fmtTime,
  relTime,
} from "./shared";

type Mode = "dms" | "groups" | "friends";

export default function RoomsView({
  mode,
  me,
  limits,
  onOpenRoom,
  onGoFriends,
}: {
  mode: Mode;
  me: Me;
  limits: CommunityLimits | null;
  onOpenRoom: (roomId: number, name: string) => void;
  onGoFriends: () => void;
}) {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState("");

  const loadRooms = useCallback(async () => {
    try {
      const data = await api<{ rooms: RoomSummary[] }>("/chat/rooms");
      setRooms(data.rooms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "会话加载失败");
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    if (mode === "friends") return;
    void loadRooms();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadRooms();
    }, 8000);
    return () => clearInterval(timer);
  }, [mode, loadRooms]);

  if (mode === "friends") {
    return <FriendsPanel me={me} onOpenRoom={onOpenRoom} />;
  }

  if (mode === "groups") {
    return <GroupsPanel me={me} limits={limits} rooms={rooms} error={error} reload={loadRooms} onOpenRoom={onOpenRoom} />;
  }

  const dms = (rooms || []).filter((r) => r.kind === "dm");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">私信</h2>
          <p className="mt-0.5 text-xs text-white/40">和好友一对一聊天，消息仅双方可见</p>
        </div>
        <button className={BTN_GHOST} onClick={onGoFriends}>
          找好友聊天
        </button>
      </div>

      <Note text={error} />

      {rooms === null ? (
        <Spinner />
      ) : dms.length === 0 ? (
        <EmptyState
          title="还没有私信"
          desc="在好友列表里找到玩家，点一下「发私信」就能开始聊天。"
          action={<button className={BTN_PRIMARY} onClick={onGoFriends}>去好友列表</button>}
        />
      ) : (
        <div className={`${CARD} divide-y divide-white/5 overflow-hidden`}>
          {dms.map((room) => (
            <button
              key={room.id}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
              onClick={() => onOpenRoom(room.id, room.display_name)}
            >
              <Avatar src={room.display_avatar} name={room.display_name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white/85">{room.display_name}</span>
                  {room.unread > 0 && (
                    <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-[#04120c]">
                      {room.unread > 99 ? "99+" : room.unread}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[10px] text-white/25">{relTime(room.last_at || "")}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-white/35">
                  {room.last_text ? `${room.last_user || ""}：${room.last_text}` : room.last_image ? "[图片]" : "还没有消息"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupsPanel({
  me,
  limits,
  rooms,
  error,
  reload,
  onOpenRoom,
}: {
  me: Me;
  limits: CommunityLimits | null;
  rooms: RoomSummary[] | null;
  error: string;
  reload: () => Promise<void>;
  onOpenRoom: (roomId: number, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const groups = (rooms || []).filter((r) => r.kind === "group");
  const blocked = limits?.group_create === "admin" && me.role !== "admin";

  const create = async () => {
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("群名称至少 2 个字");
      return;
    }
    setBusy(true);
    try {
      const { id } = await api<{ id: number }>("/chat/rooms", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), notice: notice.trim() }),
      });
      setOpen(false);
      setName("");
      setNotice("");
      await reload();
      onOpenRoom(id, name.trim());
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">群聊</h2>
          <p className="mt-0.5 text-xs text-white/40">
            {blocked ? "当前仅管理员可创建群聊，你可以加入已有的群" : "创建自己的群聊，邀请好友一起交流"}
          </p>
        </div>
        <button
          className={BTN_PRIMARY}
          disabled={blocked}
          title={blocked ? "管理员已关闭普通玩家创建群聊" : undefined}
          onClick={() => {
            setFormError("");
            setOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          创建群聊
        </button>
      </div>

      <Note text={error} />

      {rooms === null ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState
          title="还没有群聊"
          desc={blocked ? "等待管理员创建群聊，或先加入社区群。" : "创建一个群聊，把志同道合的伙伴聚在一起。"}
          action={
            !blocked ? (
              <button className={BTN_PRIMARY} onClick={() => setOpen(true)}>
                创建第一个群
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.map((room) => (
            <button
              key={room.id}
              className={`${CARD} flex items-start gap-3 p-4 text-left transition hover:border-emerald-400/25 hover:bg-white/[0.06]`}
              onClick={() => onOpenRoom(room.id, room.display_name)}
            >
              <Avatar src={room.display_avatar} name={room.display_name} size={46} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-white/85">{room.display_name}</span>
                  {room.my_role === "owner" && (
                    <span className="rounded border border-amber-400/25 px-1 text-[9px] text-amber-300">群主</span>
                  )}
                  {room.unread > 0 && (
                    <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-[#04120c]">
                      {room.unread > 99 ? "99+" : room.unread}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/35">
                  {room.notice || `${room.member_count} 位成员`}
                </p>
                <p className="mt-1.5 truncate text-[11px] text-white/30">
                  {room.last_text ? `${room.last_user || ""}：${room.last_text}` : room.last_image ? "[图片]" : "还没有消息"}
                </p>
                <p className="mt-1 text-[10px] text-white/20">{relTime(room.last_at || room.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={open} title="创建群聊" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <Note text={formError} />
          <input
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="群名称（2-30 字）"
          />
          <textarea
            className={`${INPUT} min-h-[90px] resize-none`}
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            maxLength={200}
            placeholder="群公告（选填，最多 200 字）"
          />
          <p className="text-[11px] text-white/30">创建后可在群成员面板中邀请好友加入。</p>
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setOpen(false)}>
              取消
            </button>
            <button className={BTN_PRIMARY} disabled={busy} onClick={() => void create()}>
              {busy ? "创建中…" : "创建"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FriendsPanel({
  me,
  onOpenRoom,
}: {
  me: Me;
  onOpenRoom: (roomId: number, name: string) => void;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(0);
  const [aliasTarget, setAliasTarget] = useState<Contact | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ contacts: Contact[] }>("/chat/contacts");
      setContacts(data.contacts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "好友列表加载失败");
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const search = async () => {
    const keyword = q.trim();
    if (!keyword) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const data = await api<{ users: SearchUser[] }>(`/chat/users/search?q=${encodeURIComponent(keyword)}`);
      setResults(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addFriend = async (uid: number) => {
    setBusy(uid);
    try {
      await api("/chat/contacts", { method: "POST", body: JSON.stringify({ user_id: uid }) });
      await load();
      setResults((prev) => (prev ? prev.map((u) => (u.id === uid ? { ...u, is_contact: 1 } : u)) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(0);
    }
  };

  const startDm = async (uid: number, name: string) => {
    setBusy(uid);
    try {
      const { id } = await api<{ id: number }>("/chat/dm", {
        method: "POST",
        body: JSON.stringify({ user_id: uid }),
      });
      onOpenRoom(id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "私信发起失败");
    } finally {
      setBusy(0);
    }
  };

  const saveAlias = async () => {
    if (!aliasTarget) return;
    try {
      await api(`/chat/contacts/${aliasTarget.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ alias: aliasDraft.trim() }),
      });
      setAliasTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "备注保存失败");
    }
  };

  const removeFriend = async (c: Contact) => {
    if (!window.confirm(`确定删除好友「${c.alias || c.username}」吗？`)) return;
    try {
      await api(`/chat/contacts/${c.user_id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-white">好友</h2>
        <p className="mt-0.5 text-xs text-white/40">添加好友、设置备注，随时发起私信</p>
      </div>

      <Note text={error} />

      <div className={`${CARD} p-4`}>
        <div className="flex gap-2">
          <input
            className={INPUT}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索玩家名称 / 游戏名"
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
          <button className={BTN_GHOST} disabled={searching} onClick={() => void search()}>
            {searching ? "搜索中" : "搜索"}
          </button>
        </div>

        {results && (
          <div className="mt-3 flex flex-col gap-1">
            {results.length === 0 ? (
              <p className="py-2 text-center text-xs text-white/30">没有找到匹配的玩家</p>
            ) : (
              results.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                  <Avatar src={u.avatar} name={u.username} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/75">{u.username}</p>
                    {u.mc_username && <p className="truncate text-[10px] text-white/25">游戏名 {u.mc_username}</p>}
                  </div>
                  {u.is_contact ? (
                    <span className="text-[10px] text-white/25">已是好友</span>
                  ) : (
                    <button
                      className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/50 transition hover:bg-white/10 hover:text-white"
                      disabled={busy === u.id}
                      onClick={() => void addFriend(u.id)}
                    >
                      加好友
                    </button>
                  )}
                  <button
                    className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300 disabled:opacity-40"
                    disabled={busy === u.id}
                    onClick={() => void startDm(u.id, u.username)}
                  >
                    发私信
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {contacts === null ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <EmptyState
          title="还没有好友"
          desc="搜索玩家名称，添加好友后就能互相发私信、设置专属备注。"
        />
      ) : (
        <div className={`${CARD} divide-y divide-white/5 overflow-hidden`}>
          {contacts.map((c) => (
            <div key={c.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar src={c.avatar} name={c.alias || c.username} size={42} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white/85">{c.alias || c.username}</span>
                  {c.alias && <span className="truncate text-[10px] text-white/25">原名 {c.username}</span>}
                </div>
                <p className="text-[10px] text-white/25">好友 · {fmtTime(c.created_at)}</p>
              </div>
              <button
                className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-40"
                disabled={busy === c.user_id}
                onClick={() => void startDm(c.user_id, c.alias || c.username)}
              >
                发私信
              </button>
              <button
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/45 transition hover:bg-white/10 hover:text-white"
                onClick={() => {
                  setAliasTarget(c);
                  setAliasDraft(c.alias || "");
                }}
              >
                备注
              </button>
              <button
                className="rounded-lg px-2 py-1.5 text-[11px] text-white/25 transition hover:bg-rose-500/10 hover:text-rose-300"
                onClick={() => void removeFriend(c)}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={aliasTarget !== null} title="设置好友备注" onClose={() => setAliasTarget(null)}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-white/40">
            给「{aliasTarget?.username}」设置一个只对你显示的备注名。
          </p>
          <input
            className={INPUT}
            value={aliasDraft}
            onChange={(e) => setAliasDraft(e.target.value)}
            maxLength={20}
            placeholder="最多 20 个字，留空恢复原名"
          />
          <div className="flex justify-end gap-2">
            <button className={BTN_GHOST} onClick={() => setAliasTarget(null)}>
              取消
            </button>
            <button className={BTN_PRIMARY} onClick={() => void saveAlias()}>
              保存
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
