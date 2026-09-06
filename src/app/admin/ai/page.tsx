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

  const total = (list ?? []).reduce((a, u) => a + u.total_usage, 0);

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">AI 管理</h1>

        {/* 统计卡（图20） */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            { label: "使用用户数", value: list?.length ?? 0, bg: "#f0fdf4", color: "#15803d" },
            { label: "总调用次数", value: total, bg: "#eff6ff", color: "#1d4ed8" },
            { label: "AI 功能", value: "关闭", bg: "#f1f5f9", color: "#475569" },
            { label: "近 7 天", value: "-", bg: "#fef9c3", color: "#a16207" },
          ].map((c) => (
            <div key={c.label} className="rounded-[14px] border border-slate-100 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" style={{ background: c.bg }}>
              <div className="text-[0.82rem] font-medium" style={{ color: c.color }}>{c.label}</div>
              <div className="text-[1.8rem] font-extrabold mt-1" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* AI 配置说明（图20 折叠面板） */}
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-5">
          <details className="group">
            <summary className="cursor-pointer flex items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 list-none [&::-webkit-details-marker]:hidden">
              AI 配置说明
              <span className="text-[0.82rem] text-slate-400 font-normal">启用开关 / API 密钥 / 模型（当前 AI_ENABLED=false）</span>
            </summary>
            <div className="px-5 pb-4 text-[0.85rem] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              <p>· 在 <code className="font-mono bg-slate-100 px-1 rounded">wrangler.jsonc</code> 的 vars 中将 <code className="font-mono bg-slate-100 px-1 rounded">AI_ENABLED</code> 设为 <code className="font-mono bg-slate-100 px-1 rounded">"true"</code> 并部署。</p>
              <p>· 通过 <code className="font-mono bg-slate-100 px-1 rounded">wrangler secret put AI_API_KEY</code> 配置 API 密钥，vars 中设置 <code className="font-mono bg-slate-100 px-1 rounded">AI_BASE_URL</code> 与 <code className="font-mono bg-slate-100 px-1 rounded">AI_MODEL</code>（默认 gpt-4o-mini）。</p>
              <p>· 启用后玩家可在用户中心使用 AI 助手，本页将显示用量统计。</p>
            </div>
          </details>
        </div>

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">用量统计</h3>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无使用记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.88rem]">
              <thead>
                <tr className="text-left text-slate-500 text-[0.8rem] bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4">排名</th>
                  <th className="py-3 px-4">用户</th>
                  <th className="py-3 px-4">调用次数</th>
                  <th className="py-3 px-4">最近使用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{u.username}</td>
                    <td className="py-3 px-4 text-slate-600">{u.total_usage}</td>
                    <td className="py-3 px-4 text-slate-500">{fmtTime(u.last_used)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
    </AdminShell>
  );
}
