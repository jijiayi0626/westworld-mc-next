"use client";

import Link from "next/link";
import ScrollFadeUp from "@/components/ScrollFadeUp";

const stats = [
  { label: "支持版本", value: "1.7 - 26.2", desc: "横跨十余个大版本", icon: "M4 7h16M4 12h16M4 17h10" },
  { label: "双端互通", value: "Java + 基岩", desc: "手机电脑一起玩", icon: "M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" },
  { label: "开服时间", value: "2021 年", desc: "四年稳定运营", icon: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { label: "全天候监控", value: "7 × 24", desc: "自动巡检在线状态", icon: "M3 12h4l3-8 4 16 3-8h4" },
];

const timeline = [
  { year: "2021", title: "西域之光开服", desc: "从一张小小的生存地图起步，几个热爱 MC 的玩家架起了第一台服务器。" },
  { year: "2022", title: "白名单审核制度上线", desc: "为了维护良好的游戏环境，我们引入了入服申请与审核机制，社区氛围显著提升。" },
  { year: "2023", title: "基岩互通与跨版本支持", desc: "接入 Geyser 互通方案，手机玩家也能加入；同时扩大支持的 Java 版本范围。" },
  { year: "2024", title: "玩家社区成长", desc: "论坛、相册、活动奖励系统陆续上线，成员之间的创作与互动越来越多。" },
  { year: "2025", title: "官网全面升级", desc: "全新的 Westworld 官网：账号系统、商城、AI 助手、工单与可视化内容管理一步到位。" },
];

const values = [
  { title: "玩家第一", desc: "所有系统围绕玩家体验设计：一键入服、清晰的新手引导、工单与 AI 助手随时答疑。", icon: "M12 21s-7-4.6-9.3-9A5.5 5.5 0 0 1 12 6.5 5.5 5.5 0 0 1 21.3 12c-2.3 4.4-9.3 9-9.3 9Z" },
  { title: "公平公正", desc: "白名单统一审核、管理员操作全程留痕，任何处理都有据可查。", icon: "M12 3v18m-7-4 7 4 7-4M5 7l7-4 7 4-2.5 5h-9L5 7Z" },
  { title: "长期主义", desc: "数据多副本备份、监控自动巡检，我们认真对待这台服务器，也认真对待你的每一个存档。", icon: "M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z" },
  { title: "自由创造", desc: "生存、建筑、红石、机械——这里尊重每一种玩法，相信每个方块都能搭出惊喜。", icon: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 3.5h3.5V21H21v-3.5M14 14h7v7h-7v-7Z" },
];

export default function AboutPage() {
  return (
    <main className="about-page relative bg-bg-dark min-h-screen overflow-hidden about-hero">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes about-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes about-pulse { 0%,100% { opacity: .5 } 50% { opacity: .9 } }
        .about-blob { animation: about-pulse 7s ease-in-out infinite; }
        .about-float { animation: about-float 6s ease-in-out infinite; }
        .about-glass {
          background: linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.04));
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 8px 32px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.14);
        }
        .about-glass:hover { border-color: rgba(52,211,153,.45); }
        .about-timeline-line { background: linear-gradient(180deg, rgba(52,211,153,.7), rgba(56,189,248,.25)); }
      ` }} />

      <div className="h-nav" />

      {/* 背景光斑（鸿蒙风渐变） */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="about-blob absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-emerald-500/15 blur-[110px]" />
        <div className="about-blob absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-sky-500/12 blur-[120px]" style={{ animationDelay: "2s" }} />
        <div className="about-blob absolute bottom-0 left-1/4 w-[380px] h-[380px] rounded-full bg-violet-500/10 blur-[110px]" style={{ animationDelay: "4s" }} />
      </div>

      <div className="relative z-[2] container-mc py-14">
        {/* Hero */}
        <ScrollFadeUp>
          <div className="section-header mb-4 text-center">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full about-glass text-[0.8rem] text-emerald-300 font-medium mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              自 2021 年稳定运营至今
            </span>
            <h1 className="section-title text-[clamp(2.2rem,6vw,3.4rem)] font-extrabold text-white mb-5 leading-tight">
              关于
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent"> 西域之光</span>
            </h1>
            <p className="text-[1.08rem] text-white/75 max-w-[680px] mx-auto leading-[1.9]">
              一个长期运营的 Minecraft 跨版本生存服务器。
              我们相信，一个服务器最珍贵的不是插件与地图，而是一起留下的回忆。
            </p>
          </div>
        </ScrollFadeUp>

        {/* 数据卡 */}
        <ScrollFadeUp delay={100}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 mb-16">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="about-glass rounded-[20px] p-5 text-center transition-all duration-300 hover:-translate-y-1.5 about-float"
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                <div className="w-10 h-10 mx-auto mb-3 rounded-[12px] bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center text-emerald-300">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={s.icon} />
                  </svg>
                </div>
                <div className="text-[0.8rem] text-white/55 mb-1">{s.label}</div>
                <div className="text-[1.35rem] font-extrabold bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">{s.value}</div>
                <div className="text-[0.75rem] text-white/45 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* 我们的坚持 */}
        <ScrollFadeUp>
          <div className="text-center mb-8">
            <h2 className="section-title text-[1.7rem] font-bold text-white mb-2">我们的坚持</h2>
            <p className="text-white/55 text-[0.95rem]">四个原则，贯穿服务器的每一天</p>
          </div>
        </ScrollFadeUp>
        <ScrollFadeUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16 max-w-[920px] mx-auto">
            {values.map((v) => (
              <div key={v.title} className="about-glass rounded-[20px] p-6 transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-emerald-400/25 to-sky-400/15 border border-emerald-300/25 flex items-center justify-center text-emerald-300 shrink-0">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={v.icon} />
                    </svg>
                  </span>
                  <h3 className="text-[1.05rem] font-bold text-white">{v.title}</h3>
                </div>
                <p className="text-[0.92rem] text-white/65 leading-[1.85]">{v.desc}</p>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* 发展历程 */}
        <ScrollFadeUp>
          <div className="text-center mb-8">
            <h2 className="section-title text-[1.7rem] font-bold text-white mb-2">发展历程</h2>
            <p className="text-white/55 text-[0.95rem]">从一张地图，到一群人的世界</p>
          </div>
        </ScrollFadeUp>
        <ScrollFadeUp>
          <div className="max-w-[760px] mx-auto mb-16">
            {timeline.map((t, i) => (
              <div key={t.year} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-[14px] about-glass flex items-center justify-center text-[0.78rem] font-bold text-emerald-300 shrink-0">
                    {t.year}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className="w-px flex-1 my-1.5 about-timeline-line opacity-40" aria-hidden="true" />
                  )}
                </div>
                <div className="pb-9 pt-1.5">
                  <h3 className="text-[1.02rem] font-bold text-white mb-1.5">{t.title}</h3>
                  <p className="text-[0.9rem] text-white/65 leading-[1.85]">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* CTA */}
        <ScrollFadeUp>
          <div className="max-w-[820px] mx-auto relative rounded-[24px] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/25 via-teal-500/15 to-sky-500/20" aria-hidden="true" />
            <div className="relative about-glass rounded-[24px] p-9 text-center">
              <div className="about-float inline-flex w-14 h-14 mb-4 rounded-[16px] bg-emerald-400/20 border border-emerald-300/30 items-center justify-center text-emerald-300">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4V4Z" /><path d="M4 12h16" /><path d="M12 4v16" />
                </svg>
              </div>
              <h2 className="text-[1.45rem] font-bold text-white mb-3">准备好进入西域了吗？</h2>
              <p className="text-[0.95rem] text-white/70 mb-7">
                服务器地址：<span className="font-mono text-emerald-300 select-all">sdcmc.chipzz.top:23400</span>（Java / 基岩通用）
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href="/help" className="inline-flex items-center px-7 py-3 rounded-[14px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-[0.95rem] transition-all shadow-[0_6px_20px_rgba(16,185,129,0.35)] hover:-translate-y-0.5">
                  下载客户端
                </Link>
                <Link href="/login" className="inline-flex items-center px-7 py-3 rounded-[14px] about-glass text-white font-bold text-[0.95rem] transition-all hover:-translate-y-0.5">
                  注册账号
                </Link>
                <Link href="/team" className="inline-flex items-center px-7 py-3 rounded-[14px] about-glass text-white font-bold text-[0.95rem] transition-all hover:-translate-y-0.5">
                  认识管理团队
                </Link>
              </div>
            </div>
          </div>
        </ScrollFadeUp>
      </div>
    </main>
  );
}
