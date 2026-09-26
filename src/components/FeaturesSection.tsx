"use client";

import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";

export default function FeaturesSection() {
  const { features } = useSiteContent();

  return (
    <section
      id="features"
      className="features-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: `url('${features.bg_image}')` }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/60 backdrop-blur-[5px]" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              {features.title}
           </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {features.subtitle}
           </p>
         </div>
       </ScrollFadeUp>

        <div className="features-grid grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {features.items.map((feat, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200 | 300}>
              <div className="feature-card group relative bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-[30px] transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden hover:-translate-y-2.5 hover:bg-white/10 hover:border-accent-blue/40 hover:shadow-[0_24px_50px_rgba(0,0,0,0.4)]">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-accent-blue/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="feature-icon-wrapper w-[120px] h-[120px] flex items-center justify-center mb-6 transition-all duration-300 group-hover:rotate-[5deg] group-hover:scale-110">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-accent-blue/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-125" />
                    <img
                      src={feat.icon}
                      alt={feat.title}
                      loading="lazy"
                      className="feature-icon relative w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)] transition-all duration-300 group-hover:drop-shadow-[0_10px_22px_rgba(59,130,246,0.35)]"
                    />
                  </div>
                </div>
                <h3 className="relative text-white text-xl font-bold mb-3">{feat.title}</h3>
                <p className="relative text-white/70 leading-relaxed">{feat.desc}</p>
              </div>
           </ScrollFadeUp>
          ))}
       </div>
     </div>
   </section>
  );
}
