"use client";

import { useCallback, useEffect, useState } from "react";
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

interface HealthItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

interface Health {
  all_ok: boolean;
  checked_at: string;
  items: HealthItem[];
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const loadHealth = useCallback(async () => {
    setHealthBusy(true);
    try {
      setHealth(await api<Health>("/admin/health"));
    } catch {
      setHealth(null);
    } finally {
      setHealthBusy(false);
    }
  }, []);

  useEffect(() => {
    api<Stats>("/admin/stats").then(setStats).catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
    void loadHealth();
  }, [loadHealth]);

  // 统计卡片（深浅模式自适应：tone 映射到 admin.css 的 .stat-card.sc-*）
  const statCards = [
    { label: "今日新增注册", value: stats?.today_users, tone: "green", href: "/admin/users" },
    { label: "今日新增申请", value: stats?.today_applications, tone: "green", href: "/admin/applications" },
    { label: "待审核申请", value: stats?.pending_applications, tone: "amber", href: "/admin/applications" },
    { label: "已通过未同步", value: stats?.approved_unsynced, tone: "blue", href: "/admin/applications" },
  ];

  // 功能卡片（图5：申请审核 / 白名单同步 / 待跟进 / 待处理工单）
  const actionCards = [
    {
      title: "申请审核",
      desc: "优先处理待审核申请，降低玩家等待时间。",
      num: stats?.pending_applications,
      btn: "去审核",
      href: "/admin/applications",
      tone: "green",
    },
    {
      title: "白名单同步",
      desc: "已通过但未同步的申请需要复制命令到服务器执行。",
      num: stats?.approved_unsynced,
      btn: "去同步",
      href: "/admin/applications",
      tone: "green",
    },
    {
      title: "待跟进申请",
      desc: "已要求补充信息的申请。适合定期复查或通知提醒。",
      num: stats?.need_info_applications,
      btn: "查看申请",
      href: "/admin/applications",
      tone: "amber",
    },
    {
      title: "待处理工单",
      desc: "玩家反馈、举报、申诉和建议需要及时回复。",
      num: stats?.open_tickets,
      btn: "处理工单",
      href: "/admin/tickets",
      tone: "red",
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
        <div className="stat-card sc-blue rounded-[12px] px-4 py-3 mb-5 text-[0.92rem] font-semibold">
          运营待办概览
        </div>

        {/* 统计卡片区 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map((c) => (
            <Link key={c.label} href={c.href} className={`stat-card block rounded-[14px] p-4 transition-all hover:shadow-md hover:-translate-y-0.5 sc-${c.tone}`}>
              <div className="text-[0.82rem] font-medium">{c.label}</div>
              <div className="text-[2rem] font-extrabold mt-1">{c.value ?? "—"}</div>
            </Link>
          ))}
        </div>

        {/* 系统健康自检：自动发现不可用组件 */}
        <div className="bg-white border border-slate-200 rounded-[14px] p-5 mb-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[1.02rem] font-bold text-slate-900">系统健康</h3>
              {health && (
                <span className={`px-2 py-0.5 rounded-full text-[0.72rem] font-medium ${health.all_ok ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  {health.all_ok ? "全部正常" : health.items.filter((i) => !i.ok).length + " 项待处理"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadHealth()}
              disabled={healthBusy}
              className="px-3 py-1.5 rounded-[8px] bg-slate-50 border border-slate-200 text-slate-600 text-[0.8rem] hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              {healthBusy ? "检测中..." : "重新检测"}
            </button>
          </div>
          {health === null ? (
            <p className="text-slate-400 text-[0.88rem]">{healthBusy ? "自动检测中..." : "健康状态加载失败"}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
              {health.items.map((i) => (
                <div key={i.id} className="flex items-start gap-2.5">
                  <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${i.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  <div className="min-w-0">
                    <div className={`text-[0.88rem] font-medium ${i.ok ? "text-slate-700" : "text-red-600"}`}>{i.label}</div>
                    <div className={`text-[0.78rem] mt-0.5 leading-relaxed ${i.ok ? "text-slate-400" : "text-red-500"}`}>{i.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  className={`stat-btn sc-${c.tone} px-4 py-2 rounded-[8px] text-[0.85rem] font-semibold transition-all`}
                >
                  {c.btn}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* 底部按钮区（图5：三个绿色按钮） */}
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/applications" className="px-5 py-2.5 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.9rem] font-semibold transition-all hover:bg-[color:var(--green-dark,#059669)]">处理入服申请</Link>
          <Link href="/admin/messages" className="px-5 py-2.5 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.9rem] font-semibold transition-all hover:bg-[color:var(--green-dark,#059669)]">查看消息通知</Link>
          <Link href="/admin/blacklist" className="px-5 py-2.5 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.9rem] font-semibold transition-all hover:bg-[color:var(--green-dark,#059669)]">查看风险分析</Link>
        </div>

        {/* 快捷入口 */}
        <div className="mt-8 bg-white border border-slate-200 rounded-[14px] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="text-[0.95rem] font-bold text-slate-900 mb-3">快捷入口</h3>
          <div className="flex flex-wrap gap-2.5 text-[0.88rem]">
            {[
              ["公告与论坛", "/admin/forum"],
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