"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Spinner } from "./ui";

interface ShellItemBase {
  label: string;
  icon?: string;
}

interface ShellLinkItem extends ShellItemBase {
  href: string;
  /** 导航徽标数字（如未读通知数） */
  badge?: number;
}

interface ShellGroupItem extends ShellItemBase {
  /** 分组导航：收进子菜单的二级项 */
  children: { href: string; label: string; icon?: string }[];
}

type ShellItem = ShellLinkItem | ShellGroupItem;

interface AdminStyle {
  sidebarCollapsed?: boolean;
  theme?: "light" | "dark" | "system";
  accent?: string;
}

/** 内联 SVG 图标（stroke 风格）：不依赖 Google Fonts，国内环境可正常渲染 */
const ICONS: Record<string, string[]> = {
  person: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"],
  edit_note: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5"],
  confirmation_number: ["M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9", "M13 7v10"],
  smart_toy: ["M12 2a4 4 0 0 1 4 4h1a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1a4 4 0 0 1 4-4z", "M9 12v.01", "M15 12v.01", "M9.5 16h5"],
  inventory_2: ["M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z", "M3 9l9 6 9-6", "M12 15v6"],
  notifications: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  receipt_long: ["M6 2h12a1 1 0 0 1 1 1v19l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1z", "M9 7h6", "M9 11h6", "M9 15h4"],
  lock: ["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 8 0v4"],
  home: ["M3 10l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z", "M9 21v-8h6v8"],
  analytics: ["M3 3v18h18", "M7 14l4-4 3 3 5-6"],
  chat: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"],
  campaign: ["M3 11l18-5v12L3 13v-2z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  history: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 3"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  group: ["M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2", "M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M21 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  shopping_cart: ["M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6", "M9 21a0.5 0.5 0 1 0 0-1 0.5 0.5 0 0 0 0 1", "M19 21a0.5 0.5 0 1 0 0-1 0.5 0.5 0 0 0 0 1"],
  image: ["M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z", "M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3", "M21 15l-5-5-11 11"],
  monitoring: ["M3 3v18h18", "M7 15l4-5 3 2 5-7"],
  palette: ["M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a1 1 0 0 1 0-2h4a4 4 0 0 0 4-4 8 8 0 0 0-8-8z", "M7.5 10.5v.01", "M10 7.5v.01", "M14 7.5v.01"],
  description: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z", "M14 2v6h6", "M9 13h6", "M9 17h6"],
  language: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M3 12h18", "M12 3a14 14 0 0 1 4 9 14 14 0 0 1-4 9 14 14 0 0 1-4-9 14 14 0 0 1 4-9z"],
  tune: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 16v-4", "M12 8v.01"],
};

function NavIcon({ name }: { name: string }) {
  const ds = ICONS[name] ?? ICONS.info;
  return (
    <svg
      className="nav-item-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ds.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** 应用后台样式设置（主题 + 主色）到根节点 */
function applyAdminStyle(style: AdminStyle) {
  const root = document.documentElement;
  let removeMedia: (() => void) | undefined;
  if (style.theme) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () =>
      root.setAttribute("data-theme", style.theme === "system" ? (media.matches ? "dark" : "light") : style.theme!);
    resolve();
    if (style.theme === "system") {
      media.addEventListener("change", resolve);
      removeMedia = () => media.removeEventListener("change", resolve);
    }
  }
  if (style.accent) {
    root.style.setProperty("--green", style.accent);
  }
  // 卸载时恢复主题，避免深色泄漏到登录页/公开站（登录页是浅色设计）
  return () => {
    removeMedia?.();
    root.removeAttribute("data-theme");
    root.style.removeProperty("--green");
  };
}

/** 站点 Logo 标记：展开/折叠态均显示，折叠后作为侧栏唯一标识 */
function LogoMark() {
  return (
    <svg className="sidebar-logo-mark" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      {/* Minecraft 草方块风格 logo */}
      <rect x="3" y="3" width="18" height="18" rx="3.5" fill="var(--sb-accent, #10b981)" />
      <rect x="3" y="3" width="18" height="6.5" rx="3.5" fill="#34d399" />
      <rect x="6.5" y="12.5" width="3.5" height="3.5" rx="0.8" fill="rgba(255,255,255,0.85)" />
      <rect x="12" y="12.5" width="3.5" height="3.5" rx="0.8" fill="rgba(255,255,255,0.55)" />
      <rect x="9" y="17" width="3.5" height="3.5" rx="0.8" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
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
  // 先应用 localStorage 缓存（同步、无闪烁），再用最新值覆盖并写回缓存
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        let style: AdminStyle | undefined;
        const cached = localStorage.getItem("admin_style_v1");
        if (cached) {
          try {
            style = JSON.parse(cached) as AdminStyle;
          } catch {
            /* 缓存损坏，忽略 */
          }
        }
        const res = await fetch("/api/admin/settings");
        const body = (await res.json()) as { code: number; data?: { key: string; value: string }[] };
        if (cancelled || body.code !== 0 || !Array.isArray(body.data)) return;
        const row = body.data.find((s) => s.key === "admin_style");
        if (row?.value) {
          try {
            style = JSON.parse(row.value) as AdminStyle;
            localStorage.setItem("admin_style_v1", row.value);
          } catch {
            /* 忽略非法配置 */
          }
        }
        if (!style) return;
        cleanup = applyAdminStyle(style);
        // 侧栏默认折叠只对桌面生效；窄屏由下方 resize 逻辑强制展开
        if (typeof style.sidebarCollapsed === "boolean" && window.innerWidth > 768) {
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

  // 窄屏（≤768px）永远不折叠：移动端走汉堡 + 全宽抽屉；只有桌面端可手动折叠
  // 断点与 CSS `@media (min-width:769px)` 对齐（mobile.css 的收起规则）
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 768) setCollapsed(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleCollapsed = () => {
    if (window.innerWidth <= 768) return; // 移动端不折叠
    setCollapsed((v) => !v);
  };

  const toggleGroup = (label: string) => setGroups((g) => ({ ...g, [label]: !g[label] }));

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  const isUser = base === "/user";

  return (
    <div className={`${isUser ? "user-container" : "admin-shell"} ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* 顶栏 + 汉堡按钮（桌面端折叠侧栏 / 移动端开抽屉） */}
      <div className="mobile-topbar">
        <button
          type="button"
          onClick={() => {
            if (window.innerWidth <= 768) setOpen((v) => !v);
            else toggleCollapsed();
          }}
          className="mobile-menu-btn"
          aria-label="菜单"
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
            <LogoMark />
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
            "children" in it ? (
              <div key={it.label} className={`nav-group ${groups[it.label] || it.children.some((s) => isActive(s.href)) ? "open" : ""}`}>
                <button
                  type="button"
                  className="nav-group-toggle nav-item"
                  onClick={() => toggleGroup(it.label)}
                  aria-expanded={groups[it.label]}
                >
                  {it.icon && <NavIcon name={it.icon} />}
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
                      {sub.icon && <NavIcon name={sub.icon} />}
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
                {it.icon && <NavIcon name={it.icon} />}
                <span>{it.label}</span>
                {it.badge != null && it.badge > 0 && <span className="nav-item-badge">{it.badge > 99 ? "99+" : it.badge}</span>}
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
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // 通知中心未读数（导航徽标）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetch("/api/user/notifications", { credentials: "include" });
        const body = (await list.json()) as {
          code: number;
          data?: { is_read: number | boolean }[];
        };
        if (cancelled || body.code !== 0 || !Array.isArray(body.data)) return;
        setUnread(body.data.filter((n) => !n.is_read).length);
      } catch {
        /* 忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return <div className="user-page" style={{ padding: 40, textAlign: "center" }}><Spinner text="加载登录状态..." /></div>;
  if (!user) return null;

  const items: ShellItem[] = [
    { href: "/user", label: "个人中心", icon: "person" },
    { href: "/user/application", label: "入服申请", icon: "edit_note" },
    { href: "/user/tickets", label: "我的工单", icon: "confirmation_number" },
    { href: "/user/ai", label: "AI 助手", icon: "smart_toy" },
    { href: "/user/orders", label: "我的订单", icon: "inventory_2" },
    { href: "/user/notifications", label: "通知中心", icon: "notifications", badge: unread },
    { href: "/user/logs", label: "操作日志", icon: "receipt_long" },
    { href: "/user/security", label: "安全中心", icon: "lock" },
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
    { href: "/admin", label: "后台首页", icon: "home" },
    {
      label: "运营管理",
      icon: "analytics",
      children: [
        { href: "/admin/messages", label: "消息通知", icon: "chat" },
        { href: "/admin/announcements", label: "公告管理", icon: "campaign" },
        { href: "/admin/tickets", label: "工单管理", icon: "confirmation_number" },
        { href: "/admin/oplogs", label: "行为日志", icon: "history" },
        { href: "/admin/blacklist", label: "风控分析", icon: "shield" },
      ],
    },
    {
      label: "用户与申请",
      icon: "group",
      children: [
        { href: "/admin/users", label: "用户管理", icon: "person" },
        { href: "/admin/applications", label: "入服申请", icon: "edit_note" },
      ],
    },
    {
      label: "商城与AI",
      icon: "shopping_cart",
      children: [
        { href: "/admin/shop", label: "商城管理", icon: "storefront" },
        { href: "/admin/ai", label: "AI 管理", icon: "smart_toy" },
        { href: "/admin/library", label: "图片管理", icon: "image" },
      ],
    },
    {
      label: "系统设置",
      icon: "settings",
      children: [
        { href: "/admin/monitor", label: "服务器监控", icon: "monitoring" },
        { href: "/admin/visual", label: "可视化编辑", icon: "palette" },
        { href: "/admin/content", label: "内容管理", icon: "description" },
        { href: "/admin/settings", label: "网站设置", icon: "language" },
        { href: "/admin/backend", label: "后台样式", icon: "tune" },
        { href: "/admin/about", label: "关于本站", icon: "info" },
      ],
    },
  ];

  return <Shell items={items} base="/admin" homeTitle="管理后台" children={children} />;
}
