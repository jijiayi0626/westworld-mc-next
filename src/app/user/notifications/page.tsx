"use client";

import { useCallback, useEffect, useState } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, PageHeader, fmtTime, StatusBadge } from "@/components/ui";

interface Notification {
  id: number;
  type: string;
  title: string;
  content: string;
  is_read: number;
  created_at: string;
}

export default function NotificationsPage() {
  const [list, setList] = useState<Notification[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Notification[]>("/user/notifications"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id?: number) => {
    try {
      await api("/user/notifications/read", {
        method: "POST",
        body: id ? JSON.stringify({ id }) : undefined,
      });
      await load();
    } catch {
      // 忽略
    }
  };

  const unread = list?.filter((n) => !n.is_read).length ?? 0;

  return (
    <UserShell>
      <PageHeader
        title="通知中心"
        desc="系统公告、工单与申请动态"
        right={
          unread > 0 ? (
            <Btn variant="ghost" onClick={() => markRead()}>全部已读（{unread}）</Btn>
          ) : undefined
        }
      />

      <Card>
        {error && <div className="mb-3 text-red-300 text-[0.85rem]">{error}</div>}
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无通知" />
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {list.map((n) => (
              <div key={n.id} className={`py-4 ${!n.is_read ? "bg-accent-emerald/[0.04] -mx-4 px-4 rounded-[8px]" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StatusBadge status={n.type} />
                    <span className={`text-slate-800 font-medium truncate ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-accent-emerald flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[0.75rem] text-slate-500">{fmtTime(n.created_at)}</span>
                    {!n.is_read && (
                      <button type="button" onClick={() => markRead(n.id)} className="text-[0.75rem] text-accent-emerald hover:underline cursor-pointer">
                        标为已读
                      </button>
                    )}
                  </div>
                </div>
                {n.content && <div className="mt-1.5 text-[0.85rem] text-slate-500 whitespace-pre-wrap pl-1">{n.content}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </UserShell>
  );
}