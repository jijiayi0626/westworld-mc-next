"use client";

import Link from "next/link";
import ScrollFadeUp from "@/components/ScrollFadeUp";

const stats = [
  { label: "支持版本", value: "1.7 - 26.2", desc: "横跨十余个大版本" },
  { label: "双端互通", value: "Java + 基岩", desc: "手机电脑一起玩" },
  { label: "开服时间", value: "2021 年", desc: "四年稳定运营" },
  { label: "全天候监控", value: "7 × 24", desc: "自动巡检在线状态" },
];

const timeline = [
  { year: "2021", title: "西域之光开服", desc: "从一张小小的生存地图起步，几个热爱 MC 的玩家架起了第一台服务器。" },
  { year: "2022", title: "白名单审核制度上线", desc: "为了维护良好的游戏环境，我们引入了入服申请与审核机制，社区氛围显著提升。" },
  { year: "2023", title: "基岩互通与跨版本支持", desc: "接入 Geyser 互通方案，手机玩家也能加入；同时扩大支持的 Java 版本范围。" },
  { year: "2024", title: "玩家社区成长", desc: "论坛、相册、活动奖励系统陆续上线，成员之间的创作与互动越来越多。" },
  { year: "2025", title: "官网全面升级", desc: "全新的 Westworld 官网：账号系统、商城、AI 助手、工单与可视化内容管理一步到位。" },
];

const values = [
  {
    title: "玩家第一",
    desc: "所有系统围绕玩家体验设计：一键入服、清晰的新手引导、工单与 AI 助手随时答疑。",
  },
  {
    title: "公平公正",
    desc: "白名单统一审核、管理员操作全程留痕，任何处理都有据可查。",
  },
  {
    title: "长期主义",
    desc: "数据多副本备份、监控自动巡检，我们认真对待这台服务器，也认真对待你的每一个存档。",
  },
  {
    title: "自由创造",
    desc: "生存、建筑、红石、机械——这里尊重每一种玩法，相信每个方块都能搭出惊喜。",
  },
];

export default function AboutPage() {
  return (
    <main className="about-page relative bg-bg-dark min-h-screen overflow-hidden">
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none rules-glow" aria-hidden="true" />
      <div className="relative z-[2] container-mc py-14">
        {/* Hero */}
        <ScrollFadeUp>
          <div className="section-header mb-12 text-center">
            <h1 className="section-title text-[clamp(2rem,5vw,3rem)] font-extrabold text-white mb-4 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              关于本站
            </h1>
            <p className="text-[1.1rem] text-white/80 max-w-[680px] mx-auto">
              Westworld·西域之光 是一个长期运营的 Minecraft 跨版本生存服务器。
              我们相信，一个服务器最珍贵的不是插件与地图，而是一起留下的回忆。
            </p>
          </div>
        </ScrollFadeUp>

        {/* 数据卡 */}
        <ScrollFadeUp>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
            {stats.map((s) => (
              <div key={s.label} className="mc-card p-5 text-center">
                <div className="text-[0.82rem] text-white/60 mb-1">{s.label}</div>
                <div className="text-[1.5rem] font-extrabold text-emerald-400">{s.value}</div>
                <div className="text-[0.78rem] text-white/50 mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* 我们的坚持 */}
        <ScrollFadeUp>
          <h2 className="section-title text-[1.6rem] font-bold text-white mb-6 text-center">我们的坚持</h2>
        </ScrollFadeUp>
        <ScrollFadeUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14 max-w-[900px] mx-auto">
            {values.map((v) => (
              <div key={v.title} className="mc-card p-5">
                <h3 className="text-[1.05rem] font-bold text-white mb-2 flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 bg-emerald-400 rounded-[2px]" aria-hidden="true" />
                  {v.title}
                </h3>
                <p className="text-[0.92rem] text-white/70 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* 发展历程 */}
        <ScrollFadeUp>
          <h2 className="section-title text-[1.6rem] font-bold text-white mb-6 text-center">发展历程</h2>
        </ScrollFadeUp>
        <ScrollFadeUp>
          <div className="max-w-[760px] mx-auto mb-14">
            {timeline.map((t, i) => (
              <div key={t.year} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-[10px] bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-[0.78rem] font-bold text-emerald-300 shrink-0">
                    {t.year}
                  </div>
                  {i < timeline.length - 1 && <div className="w-px flex-1 bg-white/15 my-1" aria-hidden="true" />}
                </div>
                <div className="pb-8">
                  <h3 className="text-[1.02rem] font-bold text-white mb-1.5">{t.title}</h3>
                  <p className="text-[0.9rem] text-white/70 leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollFadeUp>

        {/* CTA */}
        <ScrollFadeUp>
          <div className="max-w-[760px] mx-auto mc-card p-8 text-center">
            <h2 className="text-[1.4rem] font-bold text-white mb-3">准备好进入西域了吗？</h2>
            <p className="text-[0.95rem] text-white/70 mb-6">
              服务器地址：<span className="font-mono text-emerald-300">sdcmc.chipzz.top:23400</span>（Java / 基岩通用）
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/help" className="inline-flex items-center px-6 py-3 rounded-[12px] bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-[0.95rem] transition-colors">
                下载客户端
              </Link>
              <Link href="/login" className="inline-flex items-center px-6 py-3 rounded-[12px] bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[0.95rem] transition-colors">
                注册账号
              </Link>
              <Link href="/team" className="inline-flex items-center px-6 py-3 rounded-[12px] bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[0.95rem] transition-colors">
                认识管理团队
              </Link>
            </div>
          </div>
        </ScrollFadeUp>
      </div>
    </main>
  );
}
