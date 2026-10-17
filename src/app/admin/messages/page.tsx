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

interface ActionLog {
  id: number;
  user_id: number;
  action: string;
  detail: string;
  ip: string;
  created_at: string;
  username: string | null;
}

interface ActionLogsResp {
  logs: ActionLog[];
  total: number;
  page: number;
  size: number;
  types: string[];
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待回复" },
  { key: "replied", label: "已回复" },
];

export default function AdminMessagesPage() {
  const [list, setList] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 展开项
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");

  // 状态筛选
  const [statusTab, setStatusTab] = useState("all");

  // 行为日志（折叠面板，默认收起）
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<ActionLogsResp | null>(null);
  const [logType, setLogType] = useState("");
  const [logUser, setLogUser] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logsBusy, setLogsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Message[]>("/contact/admin/list"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  const loadLogs = useCallback(async (type: string, userId: string, page: number) => {
    setLogsBusy(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (type) qs.set("action", type);
      if (userId.trim()) qs.set("user_id", userId.trim());
      setLogs(await api<ActionLogsResp>(`/admin/action-logs?${qs.toString()}`));
    } catch {
      setLogs(null);
    } finally {
      setLogsBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 展开日志面板时按当前筛选加载
  useEffect(() => {
    if (logsOpen) void loadLogs(logType, logUser, logPage);
  }, [logsOpen, loadLogs, logType, logUser, logPage]);

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

  const filtered = (list ?? []).filter((m) =>
    statusTab === "all" ? true : statusTab === "pending" ? !m.reply : !!m.reply,
  );

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-4">
          消息通知
          <span className="ml-2 text-[0.82rem] font-normal text-slate-400">共 {(list ?? []).length} 条</span>
        </h1>

        <ErrorNote message={error} />
        <SuccessNote message={success} />

        {/* 类型筛选 */}
        <div className="flex items-center gap-2 mb-4">
          {STATUS_TABS.map((t) => {
            const n = (list ?? []).filter((m) => (t.key === "all" ? true : t.key === "pending" ? !m.reply : !!m.reply)).length;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusTab(t.key)}
                className={`px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium border transition-colors cursor-pointer ${
                  statusTab === t.key
                    ? "bg-[color:var(--green,#10b981)] border-[color:var(--green,#10b981)] text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {t.label}（{n}）
              </button>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-4">
          {list === null ? (
            <Empty text="加载中..." />
          ) : filtered.length === 0 ? (
            <Empty text={statusTab === "all" ? "暂无消息" : "该类型下暂无消息"} />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {filtered.map((m) => (
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

        {/* 行为日志（折叠，默认收起） */}
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-4">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 cursor-pointer"
            aria-expanded={logsOpen}
          >
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              行为日志
              <span className="text-[0.78rem] font-normal text-slate-400">用户注册 / 登录 / 绑定 / 聊天等操作记录</span>
            </span>
            <span className="text-slate-400 text-[0.8rem]">{logsOpen ? "收起 ▲" : "查看 ▼"}</span>
          </button>

          {logsOpen && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-4">
              {/* 筛选器 */}
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <select
                  value={logType}
                  onChange={(e) => {
                    setLogType(e.target.value);
                    setLogPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem] text-slate-700 cursor-pointer"
                >
                  <option value="">全部类型</option>
                  {(logs?.types ?? []).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={logUser}
                  onChange={(e) => {
                    setLogUser(e.target.value);
                    setLogPage(1);
                  }}
                  placeholder="按用户 ID 筛选"
                  className="w-40 bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.85rem]"
                />
                <Btn size="sm" variant="ghost" onClick={() => void loadLogs(logType, logUser, logPage)} disabled={logsBusy}>
                  {logsBusy ? "刷新中..." : "刷新"}
                </Btn>
                <span className="ml-auto text-[0.8rem] text-slate-400">
                  {logs ? `共 ${logs.total} 条 · 第 ${logs.page} 页` : ""}
                </span>
              </div>

              {logs === null ? (
                <Empty text={logsBusy ? "加载中..." : "暂无日志"} />
              ) : logs.logs.length === 0 ? (
                <Empty text="当前筛选下暂无日志" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.85rem]">
                    <thead>
                      <tr className="text-left text-slate-400 text-[0.78rem] border-b border-slate-100">
                        <th className="py-2 pr-4 font-medium">#</th>
                        <th className="py-2 pr-4 font-medium">用户</th>
                        <th className="py-2 pr-4 font-medium">类型</th>
                        <th className="py-2 pr-4 font-medium">详情</th>
                        <th className="py-2 pr-4 font-medium">IP</th>
                        <th className="py-2 font-medium">时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {logs.logs.map((l) => (
                        <tr key={l.id} className="text-slate-600">
                          <td className="py-2.5 pr-4 font-mono text-[0.8rem]">{l.id}</td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">
                            {l.username ? (
                              <span className="text-slate-800">{l.username}</span>
                            ) : (
                              <span className="text-slate-400">#{l.user_id}</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[0.72rem] font-mono">{l.action}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-slate-500 max-w-[280px] truncate" title={l.detail}>{l.detail || "-"}</td>
                          <td className="py-2.5 pr-4 font-mono text-[0.78rem] text-slate-400">{l.ip || "-"}</td>
                          <td className="py-2.5 whitespace-nowrap text-slate-500">{fmtTime(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页 */}
              {logs && logs.total > logs.size && (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Btn size="sm" variant="ghost" disabled={logs.page <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>
                    上一页
                  </Btn>
                  <span className="text-[0.8rem] text-slate-400">
                    {logs.page} / {Math.ceil(logs.total / logs.size)}
                  </span>
                  <Btn size="sm" variant="ghost" disabled={logs.page >= Math.ceil(logs.total / logs.size)} onClick={() => setLogPage((p) => p + 1)}>
                    下一页
                  </Btn>
                </div>
              )}
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
