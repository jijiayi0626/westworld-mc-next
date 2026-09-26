"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Card, Empty, fmtTime } from "@/components/ui";

interface OpLog {
  id: number;
  action: string;
  target: string;
  detail: string;
  ip: string;
  created_at: string;
  operator: string | null;
}

const actionLabel: Record<string, { label: string; color: "gray" | "blue" | "yellow" | "red" | "green" }> = {
  user_update: { label: "用户变更", color: "yellow" },
  setting_update: { label: "设置变更", color: "blue" },
  blacklist_add: { label: "拉黑", color: "red" },
  blacklist_delete: { label: "移出黑名单", color: "gray" },
  whitelist_review: { label: "白名单审核", color: "green" },
  ticket_status: { label: "工单状态", color: "blue" },
  announce_create: { label: "新建公告", color: "green" },
  announce_update: { label: "更新公告", color: "blue" },
  announce_delete: { label: "删除公告", color: "red" },
  content_update: { label: "内容更新", color: "blue" },
  content_delete: { label: "内容删除", color: "red" },
  contact_reply: { label: "回复留言", color: "green" },
  shop_product_create: { label: "新增商品", color: "green" },
  shop_product_update: { label: "更新商品", color: "blue" },
  shop_product_delete: { label: "删除商品", color: "red" },
  shop_order_deliver: { label: "订单发货", color: "green" },
  rcon_command: { label: "RCON 命令", color: "red" },
};

export default function AdminOpLogsPage() {
  const [list, setList] = useState<OpLog[] | null>(null);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    api<OpLog[]>("/admin/oplogs").then(setList).catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const filtered = (list ?? []).filter((o) => {
    if (actionFilter && o.action !== actionFilter) return false;
    if (keyword && !`${o.operator ?? ""} ${o.target} ${o.detail} ${o.ip ?? ""}`.toLowerCase().includes(keyword.toLowerCase())) return false;
    return true;
  });

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">行为日志</h1>

        {/* 检索区（图9） */}
        <div className="bg-white border border-slate-200 rounded-[14px] p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索用户名 / 邮箱 / 游戏ID / IP / 详情..."
              className="flex-1 min-w-[220px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.9rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
            />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.9rem] text-slate-700 focus:outline-none"
            >
              <option value="">全部行为</option>
              {Object.entries(actionLabel).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <button type="button" className="px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.88rem] font-semibold hover:bg-[#059669] transition-colors">查询</button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
          {error && <p className="text-red-500 text-sm px-5 pt-4">{error}</p>}
          {list === null ? (
            <Empty text="加载中..." />
          ) : filtered.length === 0 ? (
            <Empty text="暂无日志" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead>
                  <tr className="text-left text-slate-500 text-[0.8rem] bg-slate-50 border-b border-slate-200">
                    <th className="py-3 px-4">时间</th>
                    <th className="py-3 px-4">用户</th>
                    <th className="py-3 px-4">行为</th>
                    <th className="py-3 px-4">详情</th>
                    <th className="py-3 px-4">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((o) => {
                    const meta = actionLabel[o.action] || { label: o.action, color: "gray" as const };
                    return (
                      <tr key={o.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-500">{fmtTime(o.created_at)}</td>
                        <td className="py-3 px-4 text-slate-800">{o.operator || "系统"}</td>
                        <td className="py-3 px-4"><Badge color={meta.color}>{meta.label}</Badge></td>
                        <td className="py-3 px-4 text-slate-500 max-w-[260px] truncate">{o.detail || o.target}</td>
                        <td className="py-3 px-4 font-mono text-[0.8rem] text-slate-500">{o.ip || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
