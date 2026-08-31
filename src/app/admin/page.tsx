"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Card, PageHeader } from "@/components/ui";

interface Stats {
  users: number;
  pending_applications: number;
  open_tickets: number;
  pending_orders: number;
  new_messages: number;
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/admin/stats").then(setStats).catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const cards = [
    { label: "注册用户", value: stats?.users, href: "/admin/users", color: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/25" },
    { label: "待审入服", value: stats?.pending_applications, href: "/admin/applications", color: "from-yellow-500/20 to-yellow-600/5 border-yellow-500/25" },
    { label: "进行中工单", value: stats?.open_tickets, href: "/admin/tickets", color: "from-blue-500/20 to-blue-600/5 border-blue-500/25" },
    { label: "待支付订单", value: stats?.pending_orders, href: "/admin/shop", color: "from-purple-500/20 to-purple-600/5 border-purple-500/25" },
    { label: "新留言", value: stats?.new_messages, href: "/admin/messages", color: "from-pink-500/20 to-pink-600/5 border-pink-500/25" },
  ];

  return (
    <AdminShell>
      <PageHeader title="概览统计" desc="全站运营数据一览" />

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <div className={`glass-card glass-card-hover p-5 bg-gradient-to-br border ${c.color}`}>
              <div className="text-[0.8rem] text-slate-400">{c.label}</div>
              <div className="text-3xl font-extrabold text-white mt-2">{c.value ?? "—"}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-[1.02rem] font-bold text-white mb-3">快捷入口</h3>
          <div className="grid grid-cols-2 gap-2.5 text-[0.88rem]">
            {[
              ["公告管理", "/admin/announcements"],
              ["内容管理", "/admin/content"],
              ["服务器监控", "/admin/monitor"],
              ["AI 用量", "/admin/ai"],
              ["IP 黑名单", "/admin/blacklist"],
              ["操作日志", "/admin/oplogs"],
              ["站点设置", "/admin/settings"],
              ["返回前台", "/"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="px-3 py-2.5 rounded-[8px] bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/25 hover:text-white transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-[1.02rem] font-bold text-white mb-3">提示</h3>
          <ul className="flex flex-col gap-2 text-[0.85rem] text-slate-400 list-disc list-inside">
            <li>入服申请、留言、工单按状态过滤，避免遗漏待处理项。</li>
            <li>商城商品可上下架、手动发货订单。</li>
            <li>RCON 未开启时，监控页命令执行不可用。</li>
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
