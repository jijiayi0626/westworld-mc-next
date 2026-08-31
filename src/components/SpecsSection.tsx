import ScrollFadeUp from "./ScrollFadeUp";
import { defaultContent } from "@/lib/content";

export default function SpecsSection() {
  const { specs } = defaultContent;

  return (
    <section
      id="specs"
      className="specs-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[60px] flex items-center"
      style={{ backgroundImage: "url('/png/89ce487b74da31797c19a3dc4ffc0d79.jpg')" }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/70 backdrop-blur-[3px]" />
      <div className="container-mc relative z-[2] text-center">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              服务器配置
          </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              为了给您提供最流畅的游戏体验，我们不惜成本选用了顶级的企业级硬件设施
        </p>
      </div>
       </ScrollFadeUp>

        <div className="specs-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-[30px]">
          {specs.map((spec, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200 | 300 | 400}>
              <div className="spec-card bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl px-5 py-6 text-center transition-all duration-300 hover:bg-white/10 hover:-translate-y-2 hover:scale-[1.02] hover:border-white/30 hover:shadow-card-hover">
                <div className="spec-icon-wrapper w-20 h-20 mx-auto mb-2.5 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:rotate-[5deg]">
                  <img
                    src={spec.icon}
                    alt={spec.title}
                    className="w-[72px] h-[72px] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-110"
                  />
            </div>
                <h3 className="spec-title text-[1.2rem] font-bold mb-2 text-white">
                  {spec.title}
            </h3>
                <p className="spec-desc text-[0.9rem] text-white/70 mb-4 leading-snug">
                  {spec.desc}
            </p>
                <div className="spec-value text-[1rem] font-extrabold text-accent-green px-3 py-1.5 bg-[rgba(0,230,118,0.1)] rounded-md inline-block border border-[rgba(0,230,118,0.3)]">
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
