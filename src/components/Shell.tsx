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

  const isUser = base === "/user";

  return (
    <div className={isUser ? "user-container" : "admin-shell"}>
      {/* 移动端顶栏按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mobile-menu-btn"
        style={{ display: open ? "none" : "inline-flex" }}
        aria-label="打开菜单"
      >
        ☰
      </button>

      {/* 侧边栏 */}
      <aside className={isUser ? "user-sidebar" : "sidebar"} id="sidebar">
        <div className={isUser ? "sidebar-header" : "sidebar-header"}>
          <div className="sidebar-logo">
            <span className="sidebar-title">{homeTitle}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`nav-item ${isActive(it.href) ? "active" : ""}`}
            >
              {it.icon && <span className="nav-item-icon">{it.icon}</span>}
              <span>{it.label}</span>
            </Link>
          ))}
          {extra}
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className={isUser ? "user-main" : "main-content"}>
        {children}
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

  if (loading) return <div className="user-page" style={{ padding: 40, textAlign: "center" }}><Spinner text="加载登录状态..." /></div>;
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

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spinner text="加载登录状态..." /></div>;
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