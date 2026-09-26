"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSiteContent } from "./SiteContentProvider";
import ServerStatus from "./ServerStatus";

const navItems = [
  { label: "首页", href: "/" },
  { label: "配置", href: "/specs" },
  { label: "下载", href: "/help" },
  { label: "特色", href: "/features" },
  { label: "相册", href: "/gallery" },
  { label: "团队", href: "/team" },
  { label: "规则", href: "/rules" },
  { label: "FAQ", href: "/faq" },
  { label: "联系", href: "/contact" },
  { label: "社区", href: "/community" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { site } = useSiteContent();

  // 路由变化时关闭抽屉
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  // 滚动超过 10px 时强化导航背景
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <nav
        className={`navbar fixed top-0 left-0 w-full h-nav z-[1000] transition-all duration-300 ${
          scrolled ? "navbar-scrolled" : ""
        }`}
      >
        <div className="container-mc h-full flex justify-between items-center gap-3">
          <Link
            href="/"
            className="logo flex items-center gap-3 text-xl font-extrabold text-white uppercase tracking-wider"
          >
            <svg
              className="logo-svg text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] flex-shrink-0"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4H20V20H4V4Z" />
              <path d="M4 12H20" />
              <path d="M12 4V20" />
            </svg>
            <span className="logo-text truncate max-w-[46vw] sm:max-w-none">
              {site.nav_brand}
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-5">
            {/* 桌面端服务器状态 */}
            <ServerStatus className="hidden md:inline-flex" />

            <button
              type="button"
              className={`hamburger md:hidden cursor-pointer z-[1001] ${open ? "active" : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-label="切换菜单"
              aria-expanded={open}
            >
              <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
              <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
              <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
            </button>

            <ul className={`nav-links ${open ? "active" : ""}`}>
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`text-[0.95rem] font-semibold transition-all duration-300 relative py-[5px] ${
                      isActive(item.href)
                        ? "text-white nav-link-active"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="nav-actions">
                {!user ? (
                  <Link
                    href="/login"
                    className="nav-register-btn hm-press bg-gradient-to-br from-green-500 to-green-600 text-white px-[18px] py-[6px] rounded-full text-[0.88rem] font-semibold tracking-wider shadow-[0_2px_10px_rgba(34,197,94,0.35)] transition-all duration-300 hover:from-green-600 hover:to-green-700 hover:-translate-y-px"
                  >
                    登录 / 注册
                  </Link>
                ) : (
                  <div className="nav-account flex items-center gap-2 flex-wrap">
                    <span className="nav-username text-[0.88rem] font-semibold text-white/90 px-1">
                      {user.username}
                    </span>
                    <Link
                      href="/user"
                      className="px-[14px] py-[6px] rounded-full text-[0.85rem] font-semibold bg-white/10 border border-white/15 text-white/90 hover:bg-white/20 transition-all duration-300"
                    >
                      用户中心
                    </Link>
                    {user.role === "admin" && (
                      <Link
                        href="/admin"
                        className="px-[14px] py-[6px] rounded-full text-[0.85rem] font-semibold bg-white/10 border border-white/15 text-white/90 hover:bg-white/20 transition-all duration-300"
                      >
                        管理后台
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await logout();
                        router.push("/");
                      }}
                      className="cursor-pointer text-[0.8rem] text-slate-400 hover:text-red-300 transition-colors"
                    >
                      退出
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div
        className={`nav-backdrop md:hidden ${open ? "active" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
    </>
  );
}
