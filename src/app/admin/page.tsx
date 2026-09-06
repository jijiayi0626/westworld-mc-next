"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";

interface Stats {
  users: number;
  today_users: number;
  today_applications: number;
  pending_applications: number;
  approved_unsynced: number;
  need_info_applications: number;
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

  // 统计卡片（图5：今日新增注册绿底 / 今日新增申请浅绿 / 待审核浅黄 / 已通过未同步浅蓝）
  const statCards = [
    { label: "今日新增注册", value: stats?.today_users, bg: "#dcfce7", color: "#15803d", href: "/admin/users" },
    { label: "今日新增申请", value: stats?.today_applications, bg: "#ecfdf5", color: "#047857", href: "/admin/applications" },
    { label: "待审核申请", value: stats?.pending_applications, bg: "#fef9c3", color: "#a16207", href: "/admin/applications" },
    { label: "已通过未同步", value: stats?.approved_unsynced, bg: "#e0f2fe", color: "#1d4ed8", href: "/admin/applications" },
  ];

  // 功能卡片（图5：申请审核 / 白名单同步 / 待跟进 / 待处理工单）
  const actionCards = [
    {
      title: "申请审核",
      desc: "优先处理待审核申请，降低玩家等待时间。",
      num: stats?.pending_applications,
      btn: "去审核",
      href: "/admin/applications",
      btnColor: "#10b981",
    },
    {
      title: "白名单同步",
      desc: "已通过但未同步的申请需要复制命令到服务器执行。",
      num: stats?.approved_unsynced,
      btn: "去同步",
      href: "/admin/applications",
      btnColor: "#10b981",
    },
    {
      title: "待跟进申请",
      desc: "已要求补充信息的申请。适合定期复查或通知提醒。",
      num: stats?.need_info_applications,
      btn: "查看申请",
      href: "/admin/applications",
      btnColor: "#f59e0b",
    },
    {
      title: "待处理工单",
      desc: "玩家反馈、举报、申诉和建议需要及时回复。",
      num: stats?.open_tickets,
      btn: "处理工单",
      href: "/admin/tickets",
      btnColor: "#ef4444",
    },
  ];

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[1.35rem] font-bold text-slate-900">后台首页</h1>
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[0.88rem]">{error}</div>}

        {/* 运营待办概览 */}
        <div className="bg-[#eff6ff] border border-blue-200 rounded-[12px] px-4 py-3 mb-5 text-[#1e40af] text-[0.92rem] font-semibold">
          运营待办概览
        </div>

        {/* 统计卡片区 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map((c) => (
            <Link key={c.label} href={c.href} className="block rounded-[14px] border border-slate-100 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-md hover:-translate-y-0.5" style={{ background: c.bg }}>
              <div className="text-[0.82rem] font-medium" style={{ color: c.color }}>{c.label}</div>
              <div className="text-[2rem] font-extrabold mt-1" style={{ color: c.color }}>{c.value ?? "—"}</div>
            </Link>
          ))}
        </div>

        {/* 功能卡片区 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {actionCards.map((c) => (
            <div key={c.title} className="bg-white border border-slate-200 rounded-[14px] p-5 flex items-center justify-between gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div>
                <h3 className="text-[1.02rem] font-bold text-slate-900">{c.title}</h3>
                <p className="text-[0.85rem] text-slate-500 mt-1.5 leading-relaxed">{c.desc}</p>
              </div>
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <span className="text-[1.5rem] font-extrabold text-slate-800">{c.num ?? "0"}</span>
                <Link
                  href={c.href}
                  className="px-4 py-2 rounded-[8px] text-white text-[0.85rem] font-semibold transition-all hover:opacity-90"
                  style={{ background: c.btnColor }}
                >
                  {c.btn}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* 底部按钮区（图5：三个绿色按钮） */}
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/applications" className="px-5 py-2.5 rounded-[10px] bg-[#10b981] text-white text-[0.9rem] font-semibold transition-all hover:bg-[#059669]">处理入服申请</Link>
          <Link href="/admin/messages" className="px-5 py-2.5 rounded-[10px] bg-[#10b981] text-white text-[0.9rem] font-semibold transition-all hover:bg-[#059669]">查看消息通知</Link>
          <Link href="/admin/blacklist" className="px-5 py-2.5 rounded-[10px] bg-[#10b981] text-white text-[0.9rem] font-semibold transition-all hover:bg-[#059669]">查看风险分析</Link>
        </div>

        {/* 快捷入口 */}
        <div className="mt-8 bg-white border border-slate-200 rounded-[14px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="text-[0.95rem] font-bold text-slate-900 mb-3">快捷入口</h3>
          <div className="flex flex-wrap gap-2.5 text-[0.88rem]">
            {[
              ["公告管理", "/admin/announcements"],
              ["内容管理", "/admin/content"],
              ["服务器监控", "/admin/monitor"],
              ["AI 用量", "/admin/ai"],
              ["商城管理", "/admin/shop"],
              ["操作日志", "/admin/oplogs"],
              ["站点设置", "/admin/settings"],
              ["返回前台", "/"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="px-3.5 py-2 rounded-[8px] bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900 transition-colors">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}