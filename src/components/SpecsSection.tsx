"use client";

import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";

export default function SpecsSection() {
  const { specs } = useSiteContent();
  const cpuIcon = specs.cpu_brand ? `/png/cpu-${specs.cpu_brand}.svg` : "";
  const iconOf = (icon: string, title: string, index: number) =>
    cpuIcon && (index === 0 || title.includes("处理器")) ? cpuIcon : icon;

  return (
    <section
      id="specs"
      className="specs-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-16 flex items-center"
      style={{ backgroundImage: `url('${specs.bg_image}')` }}
    >
      <div className="container-mc relative z-[2] text-center">
        <ScrollFadeUp>
          <div className="section-header mb-12 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3">
              {specs.title}
          </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {specs.subtitle}
        </p>
      </div>
       </ScrollFadeUp>

        <div className="specs-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {specs.items.map((spec, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200 | 300 | 400}>
              <div className="spec-card group relative bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl px-6 py-6 text-center transition-all duration-300 overflow-hidden hover:bg-white/10 hover:-translate-y-2 hover:scale-[1.02] hover:border-white/30 hover:shadow-[0_16px_40px_rgba(0,0,0,0.36)]">
                {/* 卡片顶部高亮线 */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="spec-icon-wrapper w-20 h-20 mx-auto mb-2 flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-[5deg]">
                  <div className="relative">
                    <img
                      src={iconOf(spec.icon, spec.title, i)}
                      alt={spec.title}
                      className="relative w-[72px] h-[72px] object-contain transition-all duration-300 group-hover:drop-shadow-[0_8px_16px_rgba(0,0,0,0.3)]"
                    />
                  </div>
                </div>
                <h3 className="spec-title text-[1.2rem] font-bold mb-2 text-white">
                  {spec.title}
                </h3>
                <p className="spec-desc text-[0.9rem] text-white/70 mb-4 leading-snug">
                  {spec.desc}
                </p>
                <div className="spec-value text-[1rem] font-extrabold text-white px-3 py-2 bg-white/10 rounded-lg inline-block border border-white/20">
                  {spec.value}
                </div>
              </div>
           </ScrollFadeUp>
          ))}
      </div>
    </div>
  </section>
  );
}
