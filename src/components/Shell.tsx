"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

interface ShellItem {
  href: string;
  label: string;
  icon?: string;
}

function Shell({
  items,
  base,
  homeTitle,
  extra,
  children,
}: {
  items: ShellItem[];
  base: string;
  homeTitle: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  return (
    <div className="container-mc pt-28 pb-16 min-h-[70vh]">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        {/* 移动端：顶部按钮 */}
        <div className="md:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full px-4 py-3 rounded-[10px] bg-white/5 border border-white/10 text-white text-[0.95rem] font-semibold flex items-center justify-between"
          >
            <span>{homeTitle}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" className={`transition-transform ${open ? "rotate-180" : ""}`}>
              <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
            </svg>
          </button>
          {open && (
            <nav className="mt-2 flex flex-col gap-1 glass-card p-3 animate-popup-in">
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`px-3 py-2.5 rounded-[8px] text-[0.9rem] font-medium transition-colors ${
                    isActive(it.href) ? "bg-accent-emerald/20 text-accent-emerald" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {it.label}
                </Link>
              ))}
              {extra}
            </nav>
          )}
        </div>

        {/* 桌面端：侧边栏 */}
        <aside className="hidden md:block">
          <nav className="glass-card p-3 flex flex-col gap-1 sticky top-24">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-2.5 rounded-[8px] text-[0.9rem] font-medium transition-colors ${
                  isActive(it.href)
                    ? "bg-accent-emerald/20 text-accent-emerald"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                {it.label}
              </Link>
            ))}
            {extra}
          </nav>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** 用户中心布局：未登录跳转登录页 */
export function UserShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) return <div className="container-mc pt-32 min-h-[60vh]"><Spinner text="加载登录状态..." /></div>;
  if (!user) return null;

  const items: ShellItem[] = [
    { href: "/user", label: "个人中心" },
    { href: "/user/application", label: "入服申请" },
    { href: "/user/tickets", label: "我的工单" },
    { href: "/user/ai", label: "AI 助手" },
    { href: "/user/orders", label: "我的订单" },
    { href: "/user/notifications", label: "通知中心" },
    { href: "/user/logs", label: "操作日志" },
    { href: "/user/security", label: "安全中心" },
  ];

  return (
    <Shell items={items} base="/user" homeTitle="用户中心" children={children} />
  );
}

/** 管理后台布局：未登录跳登录，非管理员跳用户中心 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    else if (!loading && user && user.role !== "admin") router.replace("/user");
  }, [loading, user, router]);

  if (loading) return <div className="container-mc pt-32 min-h-[60vh]"><Spinner text="加载登录状态..." /></div>;
  if (!user || user.role !== "admin") return null;

  const items: ShellItem[] = [
    { href: "/admin", label: "概览统计" },
    { href: "/admin/users", label: "用户管理" },
    { href: "/admin/applications", label: "入服审核" },
    { href: "/admin/tickets", label: "工单管理" },
    { href: "/admin/announcements", label: "公告管理" },
    { href: "/admin/messages", label: "留言管理" },
    { href: "/admin/content", label: "内容管理" },
    { href: "/admin/shop", label: "商城管理" },
    { href: "/admin/ai", label: "AI 用量" },
    { href: "/admin/monitor", label: "服务器监控" },
    { href: "/admin/blacklist", label: "IP 黑名单" },
    { href: "/admin/oplogs", label: "操作日志" },
    { href: "/admin/settings", label: "站点设置" },
  ];

  return <Shell items={items} base="/admin" homeTitle="管理后台" children={children} />;
}