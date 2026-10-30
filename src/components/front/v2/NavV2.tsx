"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../AuthProvider";
import { useSiteContent } from "../../SiteContentProvider";
import ServerStatus from "../../ServerStatus";

// 与模板一共用同一套导航结构，视觉语言改为「暗夜绿光」
export const FW2_MAIN_ITEMS = [
  { label: "首页", href: "/" },
  { label: "论坛", href: "/forum" },
  { label: "配置", href: "/specs" },
  { label: "下载", href: "/help#launchers" },
  { label: "相册", href: "/gallery" },
];

export const FW2_MORE_ITEMS = [
  { label: "特色", href: "/features" },
  { label: "团队", href: "/team" },
  { label: "规则", href: "/rules" },
  { label: "FAQ", href: "/faq" },
  { label: "社区", href: "/community" },
  { label: "联系", href: "/contact" },
];

export default function NavV2() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const moreRef = useRef<HTMLLIElement | null>(null);
  const { user, logout } = useAuth();
  const { site } = useSiteContent();

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [moreOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const moreActive = FW2_MORE_ITEMS.some((i) => isActive(i.href));

  return (
    <>
      <nav className={`fw2-nav ${scrolled ? "is-scrolled" : ""}`}>
        <div className="fw2-nav-inner">
          <Link href="/" className="fw2-brand">
            <span className="fw2-brand-mark" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M4 12h16M12 4v16" />
              </svg>
            </span>
            <span className="truncate max-w-[46vw] sm:max-w-none">{site.nav_brand}</span>
          </Link>

          <ul className="fw2-nav-links">
            {FW2_MAIN_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={isActive(item.href) ? "is-active" : ""}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li ref={moreRef} className="fw2-nav-more">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                style={moreOpen || moreActive ? { color: "var(--fw2-accent)", background: "rgba(44,232,138,.1)" } : undefined}
              >
                更多
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: moreOpen ? "rotate(180deg)" : undefined, transition: "transform .2s ease" }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {moreOpen && (
                <div className="fw2-nav-dropdown">
                  {FW2_MORE_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          </ul>

          <div className="fw2-nav-right">
            <ServerStatus className="hidden md:inline-flex" />
            {!user ? (
              <Link href="/login" className="fw2-btn fw2-btn-primary fw2-btn-sm">
                登录 / 注册
              </Link>
            ) : (
              <>
                <Link href="/user" className="fw2-btn fw2-btn-ghost fw2-btn-sm">
                  {user.username}
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="fw2-btn fw2-btn-ghost fw2-btn-sm hidden sm:inline-flex">
                    管理后台
                  </Link>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    router.push("/");
                  }}
                  className="cursor-pointer hidden sm:inline text-[0.8rem] text-slate-400 hover:text-red-300 transition-colors"
                >
                  退出
                </button>
              </>
            )}
            <button
              type="button"
              className={`fw2-hamburger md:hidden ${open ? "is-open" : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-label="切换菜单"
              aria-expanded={open}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </nav>

      {open && (
        <div className="fw2-drawer md:hidden">
          {[...FW2_MAIN_ITEMS, ...FW2_MORE_ITEMS].map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <div className="fw2-drawer-actions">
            <ServerStatus />
            {!user ? (
              <Link href="/login" className="fw2-btn fw2-btn-primary">
                登录 / 注册
              </Link>
            ) : (
              <>
                <Link href="/user" className="fw2-btn fw2-btn-ghost">
                  用户中心（{user.username}）
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="fw2-btn fw2-btn-ghost">
                    管理后台
                  </Link>
                )}
                <button
                  type="button"
                  className="fw2-btn fw2-btn-ghost"
                  onClick={async () => {
                    await logout();
                    router.push("/");
                  }}
                >
                  退出登录
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
