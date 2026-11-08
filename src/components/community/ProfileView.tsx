"use client";

import { useEffect, useState } from "react";
import type { Me } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import {
  Avatar,
  BTN_GHOST,
  CARD,
  EmptyState,
  Presence,
  PresenceDot,
  RoleBadge,
  Spinner,
  boardMeta,
  fmtTime,
  presenceLabel,
} from "./shared";

interface ProfileData {
  user: {
    id: number;
    username: string;
    avatar: string;
    bio: string;
    role: string;
    points: number;
    created_at: string;
    presence?: Presence | null;
  };
  stats: { posts: number; replies: number; likes: number };
  posts: { id: number; board: string; title: string; content: string; image_url?: string; created_at: string }[];
  replies: { id: number; post_id: number; content: string; parent_id?: number; created_at: string; post_title?: string }[];
}

export default function ProfileView({
  userId,
  me,
  onBack,
  onOpenPost,
}: {
  userId: number;
  me: Me | null;
  onBack: () => void;
  onOpenPost: (id: number) => void;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"posts" | "replies">("posts");

  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    api<ProfileData>(`/forum/users/${userId}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "用户资料加载失败");
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <button className={`${BTN_GHOST} self-start`} onClick={onBack}>
          ← 返回社区
        </button>
        <EmptyState title="无法查看该玩家" desc={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <button className={`${BTN_GHOST} self-start`} onClick={onBack}>
          ← 返回社区
        </button>
        <Spinner />
      </div>
    );
  }

  const { user, stats, posts, replies } = data;
  const isSelf = me?.id === user.id;

  return (
    <div className="flex flex-col gap-4">
      <button className={`${BTN_GHOST} self-start`} onClick={onBack}>
        ← 返回社区
      </button>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar src={user.avatar} name={user.username} size={64} rounded="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight text-white">{user.username}</h2>
              {user.role === "admin" ? <RoleBadge role="admin" /> : null}
              {isSelf ? (
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-white/45">
                  我
                </span>
              ) : null}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs leading-relaxed text-white/45">
              <PresenceDot presence={user.presence} />
              <span className="text-white/35">{presenceLabel(user.presence)}</span>
              {user.presence?.text ? <span className="truncate text-white/45">· {user.presence.text}</span> : null}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">{user.bio || "这个玩家还没有填写简介。"}</p>
            <p className="mt-2 text-[11px] text-white/25">
              加入于 {fmtTime(user.created_at)} · 积分 <span className="font-bold text-emerald-300">{user.points}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "发帖", value: stats.posts },
            { label: "评论", value: stats.replies },
            { label: "获赞", value: stats.likes },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-center">
              <p className="text-lg font-extrabold text-white">{s.value}</p>
              <p className="text-[10px] text-white/35">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { key: "posts" as const, label: `帖子 ${stats.posts}` },
          { key: "replies" as const, label: `评论 ${stats.replies}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "border-emerald-400/35 bg-emerald-400/15 text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-white/45 hover:text-white/75"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        posts.length === 0 ? (
          <EmptyState title="还没有发过帖子" desc={isSelf ? "去社区动态发第一帖吧。" : "这位玩家还没有发帖记录。"} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenPost(p.id)}
                className={`${CARD} p-3.5 text-left transition hover:border-emerald-400/25 hover:bg-white/[0.06]`}
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${boardMeta(p.board).cls}`}>
                    {boardMeta(p.board).name}
                  </span>
                  <span className="text-[10px] text-white/25">{fmtTime(p.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-white/80">{p.title}</p>
                {p.content ? <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/40">{p.content}</p> : null}
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt="帖子图片"
                    className="mt-2 max-h-32 rounded-lg border border-white/10 object-cover"
                    loading="lazy"
                  />
                ) : null}
              </button>
            ))}
          </div>
        )
      ) : replies.length === 0 ? (
        <EmptyState title="还没有评论" desc={isSelf ? "去社区参与讨论吧。" : "这位玩家还没有评论记录。"} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {replies.map((r) => (
            <button
              key={r.id}
              onClick={() => onOpenPost(r.post_id)}
              className={`${CARD} p-3.5 text-left transition hover:border-emerald-400/25 hover:bg-white/[0.06]`}
            >
              <p className="line-clamp-2 text-xs leading-relaxed text-white/60">
                {r.parent_id ? <span className="text-emerald-300/70">楼中楼：</span> : null}
                {r.content}
              </p>
              <p className="mt-1.5 truncate text-[10px] text-white/25">
                来自《{r.post_title || "帖子已删除"}》 · {fmtTime(r.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
