"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Card, Empty, PageHeader, fmtTime } from "@/components/ui";

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

  useEffect(() => {
    api<OpLog[]>("/admin/oplogs").then(setList).catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <AdminShell>
      <PageHeader title="操作日志" desc="管理员操作审计记录" />

      <Card>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无操作记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.88rem]">
              <thead>
                <tr className="text-left text-slate-500 text-[0.8rem] border-b border-white/10">
                  <th className="py-2.5 pr-3">ID</th>
                  <th className="py-2.5 pr-3">操作</th>
                  <th className="py-2.5 pr-3">操作者</th>
                  <th className="py-2.5 pr-3">目标</th>
                  <th className="py-2.5 pr-3">详情</th>
                  <th className="py-2.5 pr-3">IP</th>
                  <th className="py-2.5">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {list.map((o) => {
                  const meta = actionLabel[o.action] || { label: o.action, color: "gray" as const };
                  return (
                    <tr key={o.id} className="hover:bg-white/5">
                      <td className="py-3 pr-3 font-mono text-slate-500">{o.id}</td>
                      <td className="py-3 pr-3"><Badge color={meta.color}>{meta.label}</Badge></td>
                      <td className="py-3 pr-3 text-white">{o.operator || "系统"}</td>
                      <td className="py-3 pr-3 text-slate-400 font-mono text-[0.82rem]">{o.target}</td>
                      <td className="py-3 pr-3 text-slate-400 max-w-[220px] truncate">{o.detail}</td>
                      <td className="py-3 pr-3 font-mono text-[0.8rem] text-slate-500">{o.ip || "-"}</td>
                      <td className="py-3 text-slate-400">{fmtTime(o.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
