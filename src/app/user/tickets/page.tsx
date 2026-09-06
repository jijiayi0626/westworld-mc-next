"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Input, PageHeader, Select, SuccessNote, TextArea, Empty, StatusBadge, fmtTime, Badge } from "@/components/ui";

interface Ticket {
  id: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  reply_count: number;
}

interface TicketDetail {
  ticket: {
    id: number;
    subject: string;
    category: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  replies: Array<{
    id: number;
    user_id: number;
    content: string;
    is_staff: number;
    created_at: string;
  }>;
}

export default function TicketsPage() {
  const [list, setList] = useState<Ticket[] | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [content, setContent] = useState("");
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Ticket[]>("/ticket/mine"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    setError("");
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

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/ticket/create", {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), category, priority, content: content.trim() }),
      });
      setSuccess("工单已创建");
      setSubject("");
      setContent("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setError("");
    setBusy(true);
    try {
      await api(`/ticket/${detail.ticket.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ content: reply.trim() }),
      });
      setReply("");
      await openDetail(detail.ticket.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setBusy(false);
    }
  };

  const passwordNote = detail?.ticket.status === "closed" ? "工单已关闭，无法回复。" : undefined;

  return (
    <UserShell>
      <PageHeader
        title="我的工单"
        desc="提交、跟进问题与反馈"
        right={
          <Btn onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "ghost" : "primary"}>
            {showCreate ? "收起" : "新建工单"}
          </Btn>
        }
      />

      {showCreate && (
        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">新建工单</h3>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Field label="标题">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="简要描述问题" maxLength={100} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="分类">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="general">综合咨询</option>
                  <option value="apply">入服申请</option>
                  <option value="bug">Bug 反馈</option>
                  <option value="payment">支付问题</option>
                </Select>
              </Field>
              <Field label="优先级">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="low">低</option>
                  <option value="normal">中</option>
                  <option value="high">高</option>
                </Select>
              </Field>
            </div>
            <Field label="详细描述">
              <TextArea value={content} onChange={(e) => setContent(e.target.value)} placeholder="请详细描述遇到的问题，包括时间、坐标、复现步骤等" maxLength={5000} required />
            </Field>
            <ErrorNote message={error} />
            <SuccessNote message={success} />
            <div>
              <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "创建工单"}</Btn>
            </div>
          </form>
        </Card>
      )}

      {detail ? (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[1.05rem] font-bold text-slate-800">#{detail.ticket.id} {detail.ticket.subject}</h3>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={detail.ticket.status} />
                <Badge color="gray">{statusBadgeLabel(detail.ticket.category)}</Badge>
                <Badge color={detail.ticket.priority === "high" ? "red" : detail.ticket.priority === "low" ? "gray" : "yellow"}>
                  {detail.ticket.priority === "high" ? "高优先级" : detail.ticket.priority === "low" ? "低优先级" : "中优先级"}
                </Badge>
              </div>
            </div>
            <Btn variant="ghost" onClick={closeDetail}>← 返回列表</Btn>
          </div>

          <div className="flex flex-col gap-3 mt-4 max-h-[420px] overflow-y-auto pr-1">
            {detail.replies.length === 0 && <Empty text="暂无回复" />}
            {detail.replies.map((r) => (
              <div
                key={r.id}
                className={`px-4 py-3 rounded-[10px] text-[0.9rem] leading-relaxed ${
                  r.is_staff
                    ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-100 ml-6"
                    : "bg-slate-50 border border-slate-200 text-slate-200 mr-6"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5 text-[0.75rem] text-slate-500">
                  <span className={r.is_staff ? "text-emerald-400 font-semibold" : "text-slate-500 font-semibold"}>
                    {r.is_staff ? "管理员" : "我"}
                  </span>
                  <span>{fmtTime(r.created_at)}</span>
                </div>
                <div className="whitespace-pre-wrap">{r.content}</div>
              </div>
            ))}
          </div>

          {detail.ticket.status !== "closed" ? (
            <form onSubmit={sendReply} className="mt-4 flex flex-col gap-3">
              <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入回复内容..." maxLength={5000} required />
              <ErrorNote message={error} />
              <div>
                <Btn type="submit" disabled={busy}>{busy ? "发送中..." : "发送回复"}</Btn>
              </div>
            </form>
          ) : (
            passwordNote && <SuccessNote message={passwordNote} />
          )}
        </Card>
      ) : (
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">工单列表</h3>
          {list === null ? (
            <Empty text="加载中..." />
          ) : list.length === 0 ? (
            <Empty text="还没有工单，点击右上角新建" />
          ) : (
            <div className="flex flex-col divide-y divide-white/10">
              {list.map((t) => (
                <button key={t.id} type="button" onClick={() => openDetail(t.id)} className="py-4 text-left cursor-pointer group">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-slate-500 text-[0.82rem]">#{t.id}</span>
                      <span className="text-slate-800 font-medium truncate group-hover:text-accent-emerald transition-colors">{t.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={t.status} />
                      <span className="text-[0.75rem] text-slate-500">{t.reply_count} 回复</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[0.78rem] text-slate-500">{fmtTime(t.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </UserShell>
  );
}

function statusBadgeLabel(cat: string): string {
  const map: Record<string, string> = {
    general: "综合",
    apply: "入服",
    bug: "Bug",
    payment: "支付",
  };
  return map[cat] || cat;
}