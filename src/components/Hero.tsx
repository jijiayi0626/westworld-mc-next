import CopyIP from "./CopyIP";
import ScrollFadeUp from "./ScrollFadeUp";
import { defaultContent } from "@/lib/content";

export default function Hero() {
  const { site } = defaultContent;

  return (
    <header
      id="home"
      className="hero relative h-screen w-full bg-cover bg-center flex items-center overflow-hidden"
      style={{ backgroundImage: "url('/png/c6d2dd6a664242e2e5faa640d28c340b.jpg')" }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
      <div className="container-mc w-full flex pt-20 relative z-[2]">
        <div className="hero-content max-w-[650px]">
          <ScrollFadeUp>
            <div className="hero-badge inline-flex items-center gap-2 bg-gradient-to-r from-white/10 to-transparent border-l-[3px] border-white px-4 py-1.5 text-[0.85rem] text-white mb-4 font-bold uppercase tracking-wider">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
             </svg>
              {site.hero_badge}
          </div>
        </ScrollFadeUp>

          <ScrollFadeUp delay={200}>
            <div className="server-status inline-flex items-center gap-2.5 bg-glass-bg backdrop-blur-glass border border-glass-border px-4 py-2 rounded-full mb-5 text-[0.9rem] text-white">
              <span className="status-dot w-2.5 h-2.5 bg-accent-green rounded-full shadow-[0_0_10px_var(--accent-green)] animate-pulse-glow" />
              <span className="status-text">
                服务器在线: <span className="text-rainbow-fast">加载中</span> 玩家
             </span>
          </div>
        </ScrollFadeUp>

          <ScrollFadeUp delay={300}>
            <h1 className="text-[clamp(2.2rem,6vw,4rem)] leading-[1.1] font-black mb-5 tracking-tight text-shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-white">
              欢迎来到<br />
              <span className="text-rainbow">{site.hero_title}</span>
          </h1>
        </ScrollFadeUp>

          <ScrollFadeUp delay={400}>
            <p className="hero-subtitle text-[clamp(1rem,2vw,1.2rem)] text-white/90 mb-10 max-w-[520px] border-l-2 border-white/50 pl-5 text-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              {site.hero_subtitle}
          </p>
        </ScrollFadeUp>

          <ScrollFadeUp delay={500}>
            <div className="hero-features flex gap-6 mb-10 flex-wrap">
              {site.hero_features.map((feat, i) => (
                <div
                  key={i}
                  className="h-feature flex items-center gap-2.5 text-white text-[0.95rem] font-semibold bg-white/5 px-4 py-2 rounded-lg border border-white/10 backdrop-blur-md transition-all duration-300 hover:bg-white/15 hover:border-white/30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-green drop-shadow-[0_0_5px_var(--accent-green)]">
                    <path d="M20 6L9 17L4 12" />
                 </svg>
                  {feat}
            </div>
              ))}
          </div>
        </ScrollFadeUp>

          <ScrollFadeUp delay={600}>
            <div className="hero-buttons flex gap-6 mb-14 flex-wrap items-center">
              <CopyIP ip={site.server_ip} />
              <span className="hidden">{site.server_ip}</span>
              <a
                href="#community"
                className="btn btn-secondary inline-flex items-center justify-center gap-3 px-9 py-4 rounded-xl font-bold text-[1.05rem] cursor-pointer transition-all duration-300 border bg-white/5 text-white border-white/10 backdrop-blur-md hover:bg-white/15 hover:border-white hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)] uppercase tracking-wider"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4H20V20H4V4Z" />
                  <path d="M4 9H20" />
               </svg>
                加入社区
             </a>
          </div>
        </ScrollFadeUp>
      </div>
    </div>
  </header>
  );
}
