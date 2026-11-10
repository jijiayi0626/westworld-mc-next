"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useSiteContent } from "@/components/SiteContentProvider";

const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/features", label: "玩法" },
  { href: "/specs", label: "配置" },
  { href: "/gallery", label: "画廊" },
  { href: "/rules", label: "规则" },
  { href: "/community", label: "社区" },
];

const MORE_LINKS = [
  { href: "/faq", label: "常见问题" },
  { href: "/help", label: "新手指引" },
  { href: "/about", label: "关于我们" },
  { href: "/team", label: "管理团队" },
  { href: "/contact", label: "联系我们" },
];

export default function NavV3() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { site } = useSiteContent();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="m3-header">
      <nav className="m3-nav" aria-label="主导航">
        <Link href="/" className="m3-brand">
          <span className="m3-logo" aria-hidden="true">
            W
          </span>
          <span className="m3-brand-text">
            <strong>{site.nav_brand || site.name}</strong>
            <small>MINECRAFT SERVER</small>
          </span>
        </Link>

        <div className="m3-links">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`m3-link${isActive(l.href) ? " is-active" : ""}`}>
              {l.label}
            </Link>
          ))}
          <div className="m3-more">
            <button type="button" className="m3-link m3-more-btn" aria-haspopup="true">
              更多
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="m3-more-menu">
              {MORE_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="m3-actions">
          <Link href={user ? "/user" : "/login"} className="m3-ghost">
            {user ? "用户中心" : "登录"}
          </Link>
          <Link href="/help" className="m3-cta">
            开始游玩
          </Link>
          <button
            type="button"
            className="m3-burger"
            aria-label="打开菜单"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
      </nav>

      {open && (
        <div className="m3-mobile">
          {[...NAV_LINKS, ...MORE_LINKS].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

export function FooterV3({ children }: { children?: ReactNode }) {
  const { site } = useSiteContent();
  return (
    <>
      {children}
      <footer className="m3-footer">
        <div className="m3-footer-inner">
          <div className="m3-footer-brand">
            <span className="m3-logo" aria-hidden="true">
              W
            </span>
            <div>
              <strong>{site.name}</strong>
              <p>{site.footer_description || site.description}</p>
            </div>
          </div>
          <div className="m3-footer-cols">
            <div>
              <h4>探索</h4>
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <h4>支持</h4>
              {MORE_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div>
              <h4>加入</h4>
              <p className="m3-footer-ip">{site.server_ip}</p>
              <a href="https://jq.qq.com/?_wv=1027&k=838177210" target="_blank" rel="noreferrer noopener">
                QQ 群 838177210
              </a>
            </div>
          </div>
        </div>
        <div className="m3-footer-bottom">
          <span>{site.footer_copyright}</span>
          <span>Powered by Westworld</span>
        </div>
      </footer>
    </>
  );
}
