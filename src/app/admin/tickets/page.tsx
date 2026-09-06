"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, StatusBadge, SuccessNote, TextArea, fmtTime } from "@/components/ui";

interface TicketRow {
  id: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  username: string;
  reply_count: number;
}

interface TicketDetail {
  ticket: { id: number; subject: string; category: string; priority: string; status: string; user_id: number; created_at: string; updated_at: string };
  replies: Array<{ id: number; user_id: number; content: string; is_staff: number; created_at: string }>;
}

export default function AdminTicketsPage() {
  const [list, setList] = useState<TicketRow[] | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<TicketRow[]>("/ticket/admin/list"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      setDetail(await api<TicketDetail>(`/ticket/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setReply("");
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setError("");
    setBusy(true);
    try {
      await api(`/ticket/${detail.ticket.id}/reply`, { method: "POST", body: JSON.stringify({ content: reply.trim() }) });
      setReply("");
      await openDetail(detail.ticket.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "open" | "closed") => {
    if (!detail) return;
    setError("");
    setBusy(true);
    try {
      await api(`/ticket/admin/${detail.ticket.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      setSuccess(status === "closed" ? "工单已关闭" : "工单已重新打开");
      await openDetail(detail.ticket.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const catLabel: Record<string, string> = { general: "综合", apply: "入服", bug: "Bug", payment: "支付" };

  const filtered = (list ?? []).filter((t) => !statusFilter || t.status === statusFilter);

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-1">工单管理</h1>
        <div className="text-[0.82rem] text-slate-400 mb-4">工单频率限制 0 表示不限制</div>

      {detail ? (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[1.05rem] font-bold text-slate-800">#{detail.ticket.id} {detail.ticket.subject}</h3>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={detail.ticket.status} />
                <Badge color="gray">{catLabel[detail.ticket.category] || detail.ticket.category}</Badge>
                <Badge color={detail.ticket.priority === "high" ? "red" : detail.ticket.priority === "low" ? "gray" : "yellow"}>
                  {detail.ticket.priority === "high" ? "高优先级" : detail.ticket.priority === "low" ? "低优先级" : "中优先级"}
                </Badge>
              </div>
            </div>
            <Btn variant="ghost" onClick={closeDetail}>← 返回列表</Btn>
          </div>

          <div className="flex flex-col gap-3 mt-4 max-h-[380px] overflow-y-auto pr-1">
            {detail.replies.length === 0 && <Empty text="暂无回复" />}
            {detail.replies.map((r) => (
              <div
                key={r.id}
                className={`px-4 py-3 rounded-[10px] text-[0.9rem] leading-relaxed ${
                  r.is_staff ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-100 ml-6" : "bg-slate-50 border border-slate-200 text-slate-200 mr-6"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5 text-[0.75rem] text-slate-500">
                  <span className={r.is_staff ? "text-emerald-400 font-semibold" : "text-slate-500 font-semibold"}>{r.is_staff ? "管理员" : "玩家"}</span>
                  <span>{fmtTime(r.created_at)}</span>
                </div>
                <div className="whitespace-pre-wrap">{r.content}</div>
              </div>
            ))}
          </div>

          <ErrorNote message={error} />
          <SuccessNote message={success} />

          {detail.ticket.status !== "closed" && (
            <form onSubmit={sendReply} className="mt-4 flex flex-col gap-3">
              <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入回复内容..." maxLength={5000} required />
              <div className="flex gap-2">
                <Btn type="submit" disabled={busy}>{busy ? "发送中..." : "发送回复"}</Btn>
                <Btn type="button" variant="ghost" onClick={() => setStatus("closed")} disabled={busy}>关闭工单</Btn>
              </div>
            </form>
          )}
          {detail.ticket.status === "closed" && (
            <div className="mt-4">
              <Btn variant="ghost" onClick={() => setStatus("open")} disabled={busy}>重新打开</Btn>
            </div>
          )}
        </Card>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.9rem] text-slate-700 focus:outline-none"
            >
              <option value="">全部工单</option>
              <option value="open">待回复</option>
              <option value="closed">已关闭</option>
            </select>
            <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.88rem] font-semibold hover:bg-[#059669] transition-colors">刷新</button>
          </div>
          <ErrorNote message={error} />
          {list === null ? (
            <Empty text="加载中..." />
          ) : list.length === 0 ? (
            <Empty text="暂无工单" />
          ) : (
            <div className="flex flex-col divide-y divide-white/10">
              {list.map((t) => (
                <button key={t.id} type="button" onClick={() => openDetail(t.id)} className="py-4 text-left cursor-pointer group">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-slate-500 text-[0.82rem]">#{t.id}</span>
                      <span className="text-slate-800 font-medium truncate group-hover:text-emerald-600 transition-colors">{t.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={t.status} />
                      <span className="text-[0.75rem] text-slate-500">{t.reply_count} 回复</span>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[0.78rem] text-slate-500">
                    <span>by {t.username}</span>
                    <span>{fmtTime(t.created_at)}</span>
                    <span className="text-slate-600">{catLabel[t.category] || t.category}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </AdminShell>
  );
}
