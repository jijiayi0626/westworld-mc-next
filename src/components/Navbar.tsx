"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSiteContent } from "./SiteContentProvider";

const navItems = [
  { label: "首页", href: "/" },
  { label: "配置", href: "/specs" },
  { label: "下载", href: "/help" },
  { label: "特色", href: "/features" },
  { label: "相册", href: "/gallery" },
  { label: "团队", href: "/team" },
  { label: "联系", href: "/contact" },
  { label: "社区", href: "/community" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { site } = useSiteContent();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.classList.add("nav-open");
    } else {
      document.body.classList.remove("nav-open");
    }
    return () => document.body.classList.remove("nav-open");
  }, [open]);

  return (
    <>
      <nav className="navbar fixed top-0 left-0 w-full h-nav z-[1000] bg-white/5 backdrop-blur-glass border-b border-[rgba(6,204,244,0.1)] transition-all duration-300">
        <div className="container-mc h-full flex justify-between items-center">
          <Link href="/" className="logo flex items-center gap-3 text-xl font-extrabold text-white uppercase tracking-wider">
            <svg className="logo-svg text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] flex-shrink-0" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4H20V20H4V4Z" />
              <path d="M4 12H20" />
              <path d="M12 4V20" />
           </svg>
            <span className="logo-text">{site.nav_brand}</span>
         </Link>

          <button
            type="button"
            className={`hamburger md:hidden cursor-pointer z-[1001] ${open ? "active" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-label="切换菜单"
          >
            <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
            <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
            <span className="bar block w-6 h-[3px] my-[5px] mx-auto transition-all duration-300 bg-white" />
         </button>

          <ul
            className={`nav-links hidden md:flex gap-8 ${open ? "active" : ""}`}
          >
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`text-[0.95rem] font-semibold transition-all duration-300 relative py-[5px] ${
                      isActive
                        ? "text-white"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    {item.label}
                 </Link>
               </li>
              );
            })}
            <li>
              {!user ? (
                <Link
                  href="/login"
                  className="nav-register-btn bg-gradient-to-br from-green-500 to-green-600 text-white px-[18px] py-[6px] rounded-full text-[0.88rem] font-semibold tracking-wider shadow-[0_2px_10px_rgba(34,197,94,0.35)] transition-all duration-300 hover:from-green-600 hover:to-green-700 hover:-translate-y-px"
                >
                  登录/注册
               </Link>
              ) : (
                <div className="nav-account flex items-center gap-2">
                  {user.role === "admin" && (
                    <Link
                      href="/admin"
                      className="px-[14px] py-[6px] rounded-full text-[0.85rem] font-semibold bg-white/10 border border-white/15 text-white/90 hover:bg-white/20 transition-all duration-300"
                    >
                      管理后台
                    </Link>
                  )}
                  <Link
                    href="/user"
                    className="px-[14px] py-[6px] rounded-full text-[0.85rem] font-semibold bg-white/10 border border-white/15 text-white/90 hover:bg-white/20 transition-all duration-300"
                  >
                    用户中心
                  </Link>
                  <span className="nav-username text-[0.88rem] font-semibold text-white/90 px-1">
                    {user.username}
                  </span>
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
     </nav>

      <div
        className={`nav-backdrop md:hidden ${open ? "active" : ""}`}
        onClick={() => setOpen(false)}
      />
    </>
  );
}
