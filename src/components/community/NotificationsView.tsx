"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar, CARD, EmptyState, Spinner, relTime } from "./shared";

interface NotificationItem {
  id: number;
  type: "reply" | "like";
  post_id: number;
  reply_id: number;
  actor_id: number;
  actor_name: string;
  actor_avatar: string;
  content: string;
  read: number;
  created_at: string;
}

export default function NotificationsView({
  onOpenPost,
  onRead,
}: {
  onOpenPost: (id: number) => void;
  onRead: () => void;
}) {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api<{ items: NotificationItem[]; unread: number }>("/forum/notifications?limit=30")
      .then(async (data) => {
        if (!alive) return;
        setItems(data.items);
        if (data.unread > 0) {
          await api("/forum/notifications/read", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
          if (alive) {
            setItems((prev) => (prev ? prev.map((n) => ({ ...n, read: 1 })) : prev));
            onRead();
          }
        }
      })
      .catch((e) => {
        if (alive) {
          setItems([]);
          setError(e instanceof Error ? e.message : "通知加载失败");
        }
      });
    return () => {
      alive = false;
    };
    // 仅在进入通知页时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-white">通知</h2>
        <p className="mt-1 text-xs text-white/40">收到的评论与点赞提醒</p>
      </div>

      {error ? <p className="text-xs text-rose-300/80">{error}</p> : null}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="暂时没有通知" desc="别人评论或点赞你的帖子后，会在这里提醒你。" />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read) {
                  void api("/forum/notifications/read", {
                    method: "POST",
                    body: JSON.stringify({ id: n.id }),
                  }).catch(() => undefined);
                }
                onOpenPost(n.post_id);
              }}
              className={`${CARD} flex w-full items-start gap-3 p-4 text-left transition hover:border-white/20 hover:bg-white/[0.06]`}
            >
              <Avatar src={n.actor_avatar} name={n.actor_name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/65">
                  <span className="font-semibold text-white/85">{n.actor_name}</span>
                  {n.type === "like" ? " 赞了你的帖子" : " 评论了你的帖子"}
                </p>
                {n.content && n.type === "reply" ? (
                  <p className="mt-1 line-clamp-1 text-[11px] text-white/35">“{n.content}”</p>
                ) : null}
                <p className="mt-1 text-[10px] text-white/25">{relTime(n.created_at)}</p>
              </div>
              {!n.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white/60" /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
