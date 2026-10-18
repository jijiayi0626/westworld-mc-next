"use client";

import Link from "next/link";
import { useSiteContent } from "../../SiteContentProvider";
import { FW2_MAIN_ITEMS, FW2_MORE_ITEMS } from "./NavV2";

export default function FooterV2() {
  const { site } = useSiteContent();

  return (
    <footer className="fw2-footer">
      <div className="container-mc">
        <div className="fw2-footer-grid">
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="fw2-brand-mark" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z" />
                  <path d="M4 12h16M12 4v16" />
                </svg>
              </span>
              <span className="text-white font-extrabold tracking-wider">{site.nav_brand}</span>
            </div>
            <p>{site.footer_description}</p>
          </div>

          <div>
            <h4>导航</h4>
            <div className="fw2-footer-links">
              {FW2_MAIN_ITEMS.map((i) => (
                <Link key={i.href} href={i.href}>
                  {i.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4>更多</h4>
            <div className="fw2-footer-links">
              {FW2_MORE_ITEMS.slice(0, 4).map((i) => (
                <Link key={i.href} href={i.href}>
                  {i.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="fw2-footer-bottom">
          <span>{site.footer_copyright}</span>
          <span className="flex flex-wrap items-center gap-4">
            {site.friend_links.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--fw2-accent)] transition-colors">
                {f.name}
              </a>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
