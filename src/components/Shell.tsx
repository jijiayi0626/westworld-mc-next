"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

interface ShellSubItem {
  href: string;
  label: string;
  icon?: string;
}

interface ShellItem extends ShellSubItem {
  /** 有 children 时为分组导航（收进子菜单） */
  children?: ShellSubItem[];
}

interface AdminStyle {
  sidebarCollapsed?: boolean;
  theme?: "light" | "dark" | "system";
  accent?: string;
}

/** 应用后台样式设置（主题 + 主色）到根节点 */
function applyAdminStyle(style: AdminStyle) {
  const root = document.documentElement;
  if (style.theme) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () =>
      root.setAttribute("data-theme", style.theme === "system" ? (media.matches ? "dark" : "light") : style.theme!);
    resolve();
    if (style.theme === "system") {
      media.addEventListener("change", resolve);
      return () => media.removeEventListener("change", resolve);
    }
  }
  if (style.accent) {
    root.style.setProperty("--green", style.accent);
  }
  return () => {};
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
  const [collapsed, setCollapsed] = useState(false);
  const [groups, setGroups] = useState<Record<string, boolean>>({});

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }
    return () => document.body.classList.remove("sidebar-open");
  }, [open]);

  // 读取后台样式设置（admin 会话可读，其它场景忽略）：主题/主色/侧栏默认折叠
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const body = (await res.json()) as { code: number; data?: { key: string; value: string }[] };
        if (cancelled || body.code !== 0 || !Array.isArray(body.data)) return;
        const row = body.data.find((s) => s.key === "admin_style");
        if (!row?.value) return;
        const style = JSON.parse(row.value) as AdminStyle;
        cleanup = applyAdminStyle(style);
        // 侧栏默认折叠只对桌面生效；窄屏由下方 resize 逻辑强制展开
        if (typeof style.sidebarCollapsed === "boolean" && window.innerWidth >= 1024) {
          setCollapsed(style.sidebarCollapsed);
        }
      } catch {
        // 读取失败时保持默认
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // 窄屏（<1024px）永远不折叠：移动端走汉堡 + 全宽抽屉；只有桌面端可手动折叠
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) setCollapsed(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCollapsed = () => {
    if (window.innerWidth < 1024) return; // 移动端不折叠
    setCollapsed((v) => !v);
  };

  const toggleGroup = (label: string) => setGroups((g) => ({ ...g, [label]: !g[label] }));

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  const isUser = base === "/user";

  return (
    <div className={`${isUser ? "user-container" : "admin-shell"} ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* 移动端：顶栏 + 汉堡按钮 */}
      <div className="mobile-topbar">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mobile-menu-btn"
          aria-label="打开菜单"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="mobile-topbar-title">{homeTitle}</span>
      </div>

      {/* 移动端遮罩 */}
      {open && <div className={isUser ? "sidebar-overlay show" : "admin-sidebar-overlay show"} onClick={() => setOpen(false)} />}

      {/* 侧边栏 */}
      <aside className={`${isUser ? "user-sidebar" : "sidebar"} ${collapsed ? "collapsed" : ""} ${open ? (isUser ? "open" : "active") : ""}`} id="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="sidebar-title">{homeTitle}</span>
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="sidebar-collapse-btn"
            aria-label="收起/展开侧栏"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        <nav className="sidebar-nav">
          {items.map((it) =>
            it.children ? (
              <div key={it.label} className={`nav-group ${groups[it.label] || it.children.some((s) => isActive(s.href)) ? "open" : ""}`}>
                <button
                  type="button"
                  className="nav-group-toggle nav-item"
                  onClick={() => toggleGroup(it.label)}
                  aria-expanded={groups[it.label]}
                >
                  {it.icon && <span className="nav-item-icon">{it.icon}</span>}
                  <span>{it.label}</span>
                  <span className="nav-group-arrow" aria-hidden="true">▾</span>
                </button>
                <div className="nav-submenu">
                  {it.children.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`nav-subitem ${isActive(sub.href) ? "active" : ""}`}
                    >
                      {sub.icon && <span className="nav-item-icon">{sub.icon}</span>}
                      <span>{sub.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={it.href}
                href={it.href}
                className={`nav-item ${isActive(it.href) ? "active" : ""}`}
              >
                {it.icon && <span className="nav-item-icon">{it.icon}</span>}
                <span>{it.label}</span>
              </Link>
            ),
          )}
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
    { href: "/user", label: "个人中心", icon: "👤" },
    { href: "/user/application", label: "入服申请", icon: "📝" },
    { href: "/user/tickets", label: "我的工单", icon: "🎫" },
    { href: "/user/ai", label: "AI 助手", icon: "🤖" },
    { href: "/user/orders", label: "我的订单", icon: "📦" },
    { href: "/user/notifications", label: "通知中心", icon: "🔔" },
    { href: "/user/logs", label: "操作日志", icon: "📜" },
    { href: "/user/security", label: "安全中心", icon: "🔒" },
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
    { href: "/admin", label: "后台首页", icon: "🏠" },
    {
      label: "运营管理",
      icon: "📊",
      children: [
        { href: "/admin/messages", label: "消息通知", icon: "💬" },
        { href: "/admin/announcements", label: "公告管理", icon: "📢" },
        { href: "/admin/tickets", label: "工单管理", icon: "🎫" },
        { href: "/admin/oplogs", label: "行为日志", icon: "📜" },
        { href: "/admin/blacklist", label: "风控分析", icon: "🛡️" },
      ],
    },
    {
      label: "用户与申请",
      icon: "👥",
      children: [
        { href: "/admin/users", label: "用户管理", icon: "👤" },
        { href: "/admin/applications", label: "入服申请", icon: "📝" },
      ],
    },
    {
      label: "商城与AI",
      icon: "🛒",
      children: [
        { href: "/admin/shop", label: "商城管理", icon: "🛍️" },
        { href: "/admin/ai", label: "AI 管理", icon: "🤖" },
        { href: "/admin/library", label: "图片管理", icon: "🖼️" },
      ],
    },
    {
      label: "系统设置",
      icon: "⚙️",
      children: [
        { href: "/admin/monitor", label: "服务器监控", icon: "📈" },
        { href: "/admin/visual", label: "可视化编辑", icon: "🎨" },
        { href: "/admin/content", label: "内容管理", icon: "📄" },
        { href: "/admin/settings", label: "网站设置", icon: "🌐" },
        { href: "/admin/backend", label: "后台样式", icon: "🎛️" },
        { href: "/admin/about", label: "关于本站", icon: "ℹ️" },
      ],
    },
  ];

  return <Shell items={items} base="/admin" homeTitle="管理后台" children={children} />;
}
