"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, PageHeader, Spinner, SuccessNote, fmtTime } from "@/components/ui";

interface ReportItem {
  id: number;
  target_type: "post" | "reply";
  target_id: number;
  post_id: number;
  reporter_id: number;
  reporter_name: string;
  reason: string;
  detail: string;
  status: "pending" | "resolved" | "rejected";
  created_at: string;
  target: {
    id: number;
    title?: string;
    content?: string;
    author_name?: string;
    post_title?: string;
  } | null;
}

export default function AdminReportsPage() {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [scope, setScope] = useState<"pending" | "all">("pending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    setItems(null);
    setError("");
    try {
      const list = await api<ReportItem[]>(`/forum/admin/reports?status=${scope}`);
      setItems(list);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "举报列表加载失败");
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const handle = async (id: number, action: "delete" | "reject") => {
    if (action === "delete" && !window.confirm("确定删除被举报的内容吗？删除后不可恢复。")) return;
    setBusy(id);
    setError("");
    setSuccess("");
    try {
      await api(`/forum/admin/reports/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setSuccess(action === "delete" ? "已删除内容并标记处理" : "已驳回该举报");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(0);
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="社区举报"
        desc="处理玩家提交的帖子与评论举报，删除违规内容或驳回误报。"
        right={
          <div className="flex gap-2">
            <Btn variant={scope === "pending" ? "primary" : "ghost"} size="sm" onClick={() => setScope("pending")}>
              待处理
            </Btn>
            <Btn variant={scope === "all" ? "primary" : "ghost"} size="sm" onClick={() => setScope("all")}>
              全部
            </Btn>
          </div>
        }
      />

      <div className="flex flex-col gap-3">
        <ErrorNote message={error} />
        <SuccessNote message={success} />
      </div>

      {items === null ? (
        <Spinner text="加载举报…" />
      ) : items.length === 0 ? (
        <Empty text={scope === "pending" ? "当前没有待处理的举报，社区很和谐。" : "还没有任何举报记录。"} />
      ) : (
        <div className="admin-stagger flex flex-col gap-3">
          {items.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={r.target_type === "post" ? "blue" : "yellow"}>
                  {r.target_type === "post" ? "帖子" : "评论"}
                </Badge>
                <Badge color={r.status === "pending" ? "red" : r.status === "resolved" ? "green" : "gray"}>
                  {r.status === "pending" ? "待处理" : r.status === "resolved" ? "已处理" : "已驳回"}
                </Badge>
                <span className="text-sm font-semibold text-slate-800">{r.reason}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {r.reporter_name} 举报于 {fmtTime(r.created_at)}
                </span>
              </div>

              <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3">
                {r.target ? (
                  <>
                    <p className="text-xs text-slate-500">
                      {r.target_type === "post"
                        ? `帖子：《${r.target.title || "无标题"}》 · 作者 ${r.target.author_name || "未知"}`
                        : `评论 · 作者 ${r.target.author_name || "未知"} · 来自《${r.target.post_title || "帖子已删除"}》`}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                      {r.target.content || "（无文字内容）"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">内容已被删除</p>
                )}
                {r.detail ? <p className="mt-2 text-xs text-slate-500">补充说明：{r.detail}</p> : null}
              </div>

              {r.status === "pending" ? (
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" size="sm" disabled={busy === r.id} onClick={() => void handle(r.id, "reject")}>
                    忽略
                  </Btn>
                  <Btn variant="danger" size="sm" disabled={busy === r.id} onClick={() => void handle(r.id, "delete")}>
                    {busy === r.id ? "处理中…" : "删除内容"}
                  </Btn>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
