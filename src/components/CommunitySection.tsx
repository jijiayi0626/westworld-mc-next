import ScrollFadeUp from "./ScrollFadeUp";
import { defaultContent } from "@/lib/content";

export default function CommunitySection() {
  const { community } = defaultContent;
  const single = community.groups.length === 1;

  return (
    <section
      id="community"
      className="community-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px] z-[1]"
      style={{ backgroundImage: "url('/png/wj_Narcissa_3.png')" }}
    >
      <div className="absolute inset-0 z-[1] bg-black/60" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              {community.title}
            </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {community.subtitle}
            </p>
          </div>
        </ScrollFadeUp>

        <div className="community-grid grid grid-cols-1 sm:grid-cols-2 gap-10 max-w-[900px] mx-auto">
          {community.groups.map((group, i) => (
            <ScrollFadeUp key={i} delay={((i + 1) * 100) as 100 | 200}>
              <div
                className={`community-card bg-white/5 backdrop-blur-glass px-10 py-10 rounded-[20px] border border-white/10 shadow-glass text-center transition-all duration-300 flex flex-col items-center hover:-translate-y-2.5 hover:shadow-[0_15px_40px_rgba(0,0,0,0.4)] hover:bg-white/[0.08] ${single ? "w-full" : ""}`}
              >
                <div className="community-icon-wrapper w-20 h-20 flex items-center justify-center mb-5">
                  <img
                    src={group.icon}
                    alt={group.title}
                    loading="lazy"
                    className="community-icon-img w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)] transition-all duration-300 hover:scale-110"
                  />
                </div>
                <h3 className="text-[1.5rem] mb-2.5 text-white">{group.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed">{group.desc}</p>
                <div className="qr-placeholder w-[180px] h-[180px] rounded-[10px] flex flex-col items-center justify-center mb-6 relative overflow-hidden bg-white">
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
                  className={`community-btn px-8 py-3 rounded-full font-semibold no-underline transition-all duration-300 inline-block ${
                    group.btn_class === "qq-btn"
                      ? "bg-accent-blue text-white shadow-[0_4px_15px_rgba(59,130,246,0.3)] hover:bg-[#2563eb] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(59,130,246,0.5)]"
                      : "bg-accent-emerald text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:bg-[#059669] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(16,185,129,0.5)]"
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