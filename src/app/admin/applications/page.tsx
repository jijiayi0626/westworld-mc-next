"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, PageHeader, StatusBadge, TextArea, fmtTime } from "@/components/ui";

interface Application {
  id: number;
  mc_name: string;
  type: string;
  intro: string;
  channel: string;
  status: string;
  created_at: string;
  review_note: string;
  ip: string;
  user_id: number;
  username: string;
}

type Tab = "pending" | "approved" | "rejected";

export default function AdminApplicationsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [list, setList] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Application[]>(`/application/admin/list?status=${tab}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: number, status: "approved" | "rejected") => {
    setError("");
    setBusyId(id);
    try {
      await api(`/application/admin/${id}/review`, { method: "POST", body: JSON.stringify({ status, note: note.trim() }) });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusyId(0);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "待审核" },
    { key: "approved", label: "已通过" },
    { key: "rejected", label: "已拒绝" },
  ];

  return (
    <AdminShell>
      <PageHeader title="入服审核" desc="审核玩家白名单申请" />

      <div className="flex gap-2 mb-5 p-1 bg-white/5 rounded-[10px] w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all cursor-pointer ${
              tab === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />

      {tab === "pending" && (
        <Card className="mb-4">
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-slate-400 text-[0.85rem] font-medium ml-1">审核备注（选填，随操作一并提交）</span>
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="如通过原因 / 拒绝理由..." maxLength={1000} />
          </label>
        </Card>
      )}

      {list === null ? (
        <Empty text="加载中..." />
      ) : list.length === 0 ? (
        <Empty text={`暂无${tab === "pending" ? "待审核" : tab === "approved" ? "已通过" : "已拒绝"}的申请`} />
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-white font-semibold text-[1.02rem]">{a.mc_name}</span>
                  <Badge color={a.type === "bedrock" ? "blue" : "gray"}>{a.type === "bedrock" ? "基岩版" : "Java"}</Badge>
                  <StatusBadge status={a.status} />
                </div>
                <div className="flex items-center gap-3 text-[0.78rem] text-slate-500">
                  <span>申请人：{a.username}</span>
                  <span>{fmtTime(a.created_at)}</span>
                  {a.ip && <span className="font-mono">{a.ip}</span>}
                </div>
              </div>
              {a.channel && <div className="mt-2 text-[0.8rem] text-slate-500">来源：{a.channel}</div>}
              <div className="mt-3 px-4 py-3 rounded-[10px] bg-white/5 border border-white/10 text-[0.9rem] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {a.intro}
              </div>
              {a.review_note && (
                <div className={`mt-3 px-4 py-2.5 rounded-[8px] text-[0.85rem] ${a.status === "approved" ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20" : "text-red-300 bg-red-500/10 border border-red-500/20"}`}>
                  备注：{a.review_note}
                </div>
              )}
              {tab === "pending" && (
                <div className="mt-4 flex gap-2">
                  <Btn variant="primary" size="sm" disabled={busyId === a.id} onClick={() => review(a.id, "approved")}>
                    {busyId === a.id ? "处理中..." : "通过"}
                  </Btn>
                  <Btn variant="danger" size="sm" disabled={busyId === a.id} onClick={() => review(a.id, "rejected")}>拒绝</Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
