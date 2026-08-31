import ScrollFadeUp from "./ScrollFadeUp";
import { defaultContent } from "@/lib/content";

export default function FeaturesSection() {
  const { features } = defaultContent;

  return (
    <section
      id="features"
      className="features-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: "url('/png/7649e2dbc7044ee71743022dd2d51701.jpg')" }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/60 backdrop-blur-[5px]" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              游戏特色
           </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              探索我们精心打造的独特玩法与系统
           </p>
         </div>
       </ScrollFadeUp>

        <div className="features-grid grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {features.map((feat, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200 | 300}>
              <div className="feature-card bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-[30px] transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden hover:-translate-y-2.5 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_15px_30px_rgba(0,0,0,0.3)]">
                <div className="feature-icon-wrapper w-[120px] h-[120px] flex items-center justify-center mb-6 transition-all duration-300 hover:rotate-[5deg] hover:scale-110">
                  <img
                    src={feat.icon}
                    alt={feat.title}
                    loading="lazy"
                    className="feature-icon w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)] transition-all duration-300 hover:drop-shadow-[0_8px_16px_rgba(0,188,212,0.4)]"
                  />
               </div>
                <h3 className="text-white text-xl font-bold mb-3">{feat.title}</h3>
                <p className="text-white/70 leading-relaxed">{feat.desc}</p>
             </div>
           </ScrollFadeUp>
          ))}
       </div>
     </div>
   </section>
  );
}
