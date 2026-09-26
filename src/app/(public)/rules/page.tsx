import type { Metadata } from "next";
import ScrollFadeUp from "@/components/ScrollFadeUp";

export const metadata: Metadata = {
  title: "服务器规则 - Westworld西域之光",
  description: "西域之光服务器玩家守则：请文明游戏，共同维护和谐社区。",
};

const rules: { icon: string; title: string; desc: string }[] = [
  {
    icon: "🚫",
    title: "禁止作弊与外挂",
    desc: "严禁使用任何形式的作弊、外挂、X-Ray、自动脚本等第三方辅助工具，一经发现永久封禁。",
  },
  {
    icon: "⚔️",
    title: "禁止恶意攻击玩家",
    desc: "严禁恶意击杀、偷盗、欺诈、破坏他人建筑等侵害其他玩家的行为。PVP 请基于双方自愿。",
  },
  {
    icon: "🏗️",
    title: "建筑与红石规范",
    desc: "请勿在出生点及他人建筑附近擅自建造；大型红石机器注意卡顿影响，超过承载时管理员有权要求拆除。",
  },
  {
    icon: "💬",
    title: "文明聊天",
    desc: "请勿在聊天频道辱骂、刷屏、宣传广告或发布任何违规内容，营造和谐交流环境。",
  },
  {
    icon: "🎣",
    title: "禁止利用漏洞",
    desc: "发现游戏漏洞或 Bug 请通过工单提交反馈，严禁利用漏洞获取利益，恶意利用将严肃处理。",
  },
  {
    icon: "🔄",
    title: "账号规范",
    desc: "禁止共享账号、代练代打或使用他人账号进行操作，账号本人对名下一切行为负责。",
  },
  {
    icon: "🗑️",
    title: "垃圾与红名清理",
    desc: "请勿在服务器内随意丢弃大量垃圾物品，长时间离线的建筑区域将被定期清理，重要建筑请提前报备。",
  },
  {
    icon: "🤝",
    title: "尊重管理团队",
    desc: "请配合管理员的管理与调查。对处理结果有异议可提交申诉工单，勿在频道中干扰管理。",
  },
];

export default function RulesPage() {
  return (
    <main className="rules-page relative bg-bg-dark min-h-screen overflow-hidden">
      {/* 顶部留白（固定导航占位）+ 标题区 */}
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none rules-glow" aria-hidden="true" />
      <div className="relative z-[2] container-mc py-14">
        <ScrollFadeUp>
          <div className="section-header mb-12 text-center">
            <h1 className="section-title text-[clamp(2rem,5vw,3rem)] font-extrabold text-white mb-4 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              服务器规则
            </h1>
            <p className="text-[1.1rem] text-white/80 max-w-[620px] mx-auto">
              良好的游戏环境需要每一位玩家共同维护，请仔细阅读并遵守以下守则
            </p>
          </div>
        </ScrollFadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-[1000px] mx-auto">
          {rules.map((rule, i) => (
            <ScrollFadeUp key={rule.title} delay={((i % 2) * 100) as 0 | 100}>
              <div className="group relative bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-6 overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/[0.08] hover:border-accent-emerald/40 hover:shadow-[0_20px_45px_rgba(0,0,0,0.4)]">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-accent-emerald/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-[1.4rem] flex-shrink-0">
                    {rule.icon}
                  </div>
                  <div>
                    <h2 className="text-[1.15rem] font-bold text-white mb-1.5">{rule.title}</h2>
                    <p className="text-[0.92rem] text-white/70 leading-relaxed">{rule.desc}</p>
                  </div>
                </div>
              </div>
            </ScrollFadeUp>
          ))}
        </div>

        <div className="mt-14 max-w-[1000px] mx-auto">
          <ScrollFadeUp>
            <div className="bg-[rgba(239,68,68,0.08)] border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-300 text-[0.95rem]">
                ⚠️ 违反以上规则将视情节轻重给予警告、临时封禁或永久封禁处理，最终解释权归管理团队所有。
              </p>
            </div>
          </ScrollFadeUp>
        </div>
      </div>
    </main>
  );
}
