"use client";

import Link from "next/link";
import { useSiteContent } from "./SiteContentProvider";

export default function Footer() {
  const { site } = useSiteContent();

  return (
    <footer className="footer bg-bg-dark text-slate-400 pt-20 border-t border-white/10">
      <div className="container-mc flex flex-wrap justify-between gap-10 pb-15">
        <div className="footer-brand flex-1 min-w-[300px]">
          <Link href="/" className="footer-logo flex items-center gap-2.5 text-2xl font-bold text-white mb-5">
            <svg
              className="footer-logo-svg text-accent-emerald flex-shrink-0"
              width="24"
              height="24"
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
            <span className="footer-logo-text">{site.name}</span>
         </Link>
          <p className="footer-desc leading-[1.8] max-w-[400px]">
            {site.footer_description}
         </p>
       </div>

        <div className="footer-links flex flex-wrap gap-12">
          <div className="footer-column">
            <h4 className="text-white text-[1.1rem] mb-5 relative pb-2.5 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-7 after:h-0.5 after:bg-accent-emerald">
              快速导航
           </h4>
            <ul>
              <li className="mb-3">
                <Link
                  href="/"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  首页
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/specs"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  服务器配置
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/help"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  如何加入
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/features"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  游戏特色
               </Link>
             </li>
           </ul>
         </div>

          <div className="footer-column">
            <h4 className="text-white text-[1.1rem] mb-5 relative pb-2.5 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-7 after:h-0.5 after:bg-accent-emerald">
              社区互动
           </h4>
            <ul>
              <li className="mb-3">
                <Link
                  href="/gallery"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  游戏截图
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/team"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  管理团队
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/contact"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  联系我们
               </Link>
             </li>
              <li className="mb-3">
                <Link
                  href="/community"
                  className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                >
                  加入社区
               </Link>
             </li>
           </ul>
         </div>

          <div className="footer-column">
            <h4 className="text-white text-[1.1rem] mb-5 relative pb-2.5 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-7 after:h-0.5 after:bg-accent-emerald">
              友情链接
           </h4>
            <ul>
              {site.friend_links.map((link, i) => (
                <li key={i} className="mb-3">
                  <a
                    href={link.url}
                    target={link.url.startsWith("http") ? "_blank" : undefined}
                    rel={link.url.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="text-slate-400 transition-all duration-300 hover:text-accent-emerald hover:pl-1.5"
                  >
                    {link.name}
                 </a>
               </li>
              ))}
           </ul>
         </div>
       </div>
     </div>

      <div className="footer-bottom bg-bg-darker py-5 text-center text-[0.9rem] border-t border-white/5">
        <div className="container-mc">
          <p>{site.footer_copyright}</p>
          {site.footer_disclaimer && (
            <p className="disclaimer text-slate-500 text-[0.8rem] mt-1.5 uppercase">
              {site.footer_disclaimer}
            </p>
          )}
       </div>
     </div>
   </footer>
  );
}
