"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Card, Empty, PageHeader, fmtTime } from "@/components/ui";

interface Usage {
  id: number;
  username: string;
  total_usage: number;
  last_used: string | null;
}

export default function AdminAiPage() {
  const [list, setList] = useState<Usage[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Usage[]>("/ai/admin/usage").then(setList).catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <AdminShell>
      <PageHeader title="AI 用量" desc="各用户 AI 助手调用次数统计" />

      <Card>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无使用记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.88rem]">
              <thead>
                <tr className="text-left text-slate-500 text-[0.8rem] border-b border-slate-200">
                  <th className="py-2.5 pr-3">排名</th>
                  <th className="py-2.5 pr-3">用户</th>
                  <th className="py-2.5 pr-3">调用次数</th>
                  <th className="py-2.5">最近使用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {list.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3 text-slate-500">{idx + 1}</td>
                    <td className="py-3 pr-3 font-medium text-slate-800">{u.username}</td>
                    <td className="py-3 pr-3 text-slate-600">{u.total_usage}</td>
                    <td className="py-3 text-slate-500">{fmtTime(u.last_used)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
