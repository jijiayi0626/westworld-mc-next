"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, PageHeader, StatusBadge, SuccessNote, TextArea, fmtTime } from "@/components/ui";

interface Message {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  ip: string;
  created_at: string;
  reply: string | null;
}

export default function AdminMessagesPage() {
  const [list, setList] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 展开项
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Message[]>("/contact/admin/list"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) => {
    setOpenId((v) => (v === id ? null : id));
    setReply("");
  };

  const sendReply = async (e: FormEvent, id: number) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/contact/admin/reply", { method: "POST", body: JSON.stringify({ id, reply: reply.trim() }) });
      setReply("");
      setOpenId(null);
      setSuccess("已回复该留言");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "回复失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api("/contact/admin/delete", { method: "POST", body: JSON.stringify({ id }) });
      if (openId === id) setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">消息通知
          <span className="ml-2 text-[0.82rem] font-normal text-slate-400">共 {(list ?? []).length} 条</span>
        </h1>

        <ErrorNote message={error} />
        <SuccessNote message={success} />

        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-4">
          {list === null ? (
            <Empty text="加载中..." />
          ) : list.length === 0 ? (
            <Empty text="暂无消息" />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {list.map((m) => (
                <div key={m.id} className="py-4 px-5">
                  <button type="button" onClick={() => toggle(m.id)} className="w-full text-left cursor-pointer">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-slate-500 text-[0.82rem]">#{m.id}</span>
                        <span className="text-slate-800 font-medium truncate">{m.subject || "(无主题)"}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[0.78rem] text-slate-500">{m.name}</span>
                        <span className="text-[0.78rem] text-slate-500">{fmtTime(m.created_at)}</span>
                      </div>
                    </div>
                  </button>
                  {openId === m.id && (
                    <div className="mt-3">
                      <div className="px-4 py-3 rounded-[10px] bg-slate-50 border border-slate-200 text-[0.9rem] text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {m.message}
                      </div>
                      <div className="mt-2 text-[0.78rem] text-slate-500 flex items-center gap-3">
                        {m.email && <span>{m.email}</span>}
                        {m.ip && <span className="font-mono">{m.ip}</span>}
                      </div>
                      {m.reply && (
                        <div className="mt-2 px-4 py-2.5 rounded-[8px] bg-emerald-50 border border-emerald-200 text-[0.85rem] text-emerald-700">
                          已回复：{m.reply}
                        </div>
                      )}
                      {!m.reply && (
                        <form onSubmit={(e) => sendReply(e, m.id)} className="mt-3 flex flex-col gap-2">
                          <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="回复内容..." maxLength={5000} required />
                          <div className="flex gap-2">
                            <Btn type="submit" size="sm" disabled={busy}>{busy ? "发送中..." : "回复"}</Btn>
                          </div>
                        </form>
                      )}
                      <div className="mt-3">
                        <Btn size="sm" variant="danger" onClick={() => remove(m.id)}>删除留言</Btn>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 消息通知设置（图6） */}
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <details className="group">
            <summary className="cursor-pointer flex items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 list-none [&::-webkit-details-marker]:hidden">
              消息通知设置
              <span className="text-[0.82rem] text-slate-400 font-normal">免打扰、邮件、清理和白名单（邮件服务未配置时通知仅站内可见）</span>
            </summary>
            <div className="px-5 pb-4 text-[0.85rem] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              <p>· 用户留言、入服申请、工单回复等通过站内通知推送给玩家。</p>
              <p>· 配置 SMTP 后可在 .dev.vars / secrets 中启用邮件通知；未配置时不影响站内功能。</p>
              <p>· 管理员可在“入服审核”页的 RCON 向导中配置白名单自动同步。</p>
            </div>
          </details>
        </div>
      </div>
    </AdminShell>
  );
}
