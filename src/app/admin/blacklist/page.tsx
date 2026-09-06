"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote, fmtTime } from "@/components/ui";

interface BlackItem {
  id: number;
  ip: string;
  reason: string;
  created_at: string;
}

export default function AdminBlacklistPage() {
  const [list, setList] = useState<BlackItem[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<BlackItem[]>("/admin/blacklist"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/blacklist", { method: "POST", body: JSON.stringify({ ip: ip.trim(), reason: reason.trim() }) });
      setSuccess("已加入黑名单");
      setIp("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api("/admin/blacklist/delete", { method: "POST", body: JSON.stringify({ id }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <AdminShell>
      <PageHeader title="IP 黑名单" desc="封禁恶意访问的 IP 地址" />

      <Card className="mb-5">
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">新增拉黑</h3>
        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="IP 地址">
              <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="如 1.2.3.4" maxLength={45} required />
            </Field>
            <Field label="原因">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="选填" maxLength={200} />
            </Field>
          </div>
          <ErrorNote message={error} />
          <SuccessNote message={success} />
          <div>
            <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "加入黑名单"}</Btn>
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">黑名单列表</h3>
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="黑名单为空" />
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {list.map((b) => (
              <div key={b.id} className="py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-slate-800 font-medium">{b.ip}</div>
                  <div className="mt-1 text-[0.78rem] text-slate-500">{b.reason || "无原因"} · {fmtTime(b.created_at)}</div>
                </div>
                <Btn size="sm" variant="danger" onClick={() => remove(b.id)}>移除</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
