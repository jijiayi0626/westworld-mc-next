"use client";

import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";

export default function CommunitySection() {
  const { community } = useSiteContent();
  const single = community.groups.length === 1;

  return (
    <section
      id="community"
      className="community-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-24 z-[1]"
      style={{ backgroundImage: `url('${community.bg_image}')` }}
    >
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3">
              {community.title}
            </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {community.subtitle}
            </p>
          </div>
        </ScrollFadeUp>

        <div className="community-grid grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-[900px] mx-auto">
          {community.groups.map((group, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200}>
              <div
                className={`community-card group relative bg-white/5 backdrop-blur-glass px-8 py-8 rounded-3xl border border-white/10 shadow-glass text-center transition-all duration-300 flex flex-col items-center overflow-hidden hover:-translate-y-2 hover:shadow-[0_16px_40px_rgba(0,0,0,0.36)] hover:bg-white/[0.08] hover:border-white/30 ${single ? "w-full" : ""}`}
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="community-icon-wrapper w-20 h-20 flex items-center justify-center mb-5">
                  <img
                    src={group.icon}
                    alt={group.title}
                    loading="lazy"
                    className="community-icon-img w-full h-full object-contain transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_8px_16px_rgba(0,0,0,0.3)]"
                  />
                </div>
                <h3 className="text-[1.5rem] mb-2 text-white">{group.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed">{group.desc}</p>
                <div className="qr-placeholder w-[180px] h-[180px] rounded-lg flex flex-col items-center justify-center mb-6 relative overflow-hidden bg-white">
                  <img
                    src={community.qr_image}
                    alt={`${group.title}二维码`}
                    loading="lazy"
                    className="qr-code absolute inset-0 w-full h-full object-contain p-1"
                  />
                  <span className="relative z-[1] text-bg-dark text-[0.85rem] font-bold bg-white/90 px-2 py-0.5 rounded mt-auto mb-1 shadow-sm">
                    扫码加入{group.title}
                  </span>
                </div>
                <a
                  href={group.btn_href}
                  className={`community-btn px-8 py-3 rounded-lg font-semibold no-underline transition-all duration-300 inline-block ${
                    group.btn_class === "qq-btn"
                      ? "bg-white text-bg-dark shadow-[0_4px_12px_rgba(0,0,0,0.28)] hover:bg-slate-100 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.32)]"
                      : "bg-emerald-500 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:bg-emerald-600 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,185,129,0.34)]"
                  }`}
                >
                  {group.btn_text}
                </a>
              </div>
            </ScrollFadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}