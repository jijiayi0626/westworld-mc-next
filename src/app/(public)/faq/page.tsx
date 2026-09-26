"use client";

import { useState } from "react";
import ScrollFadeUp from "@/components/ScrollFadeUp";

const faqs: { q: string; a: string }[] = [
  {
    q: "如何加入服务器？",
    a: "先前往「下载」页安装合适的启动器（PCL2 / HMCL / PCL CE / FCL），然后打开启动器添加服务器地址 sdcmc.chipzz.top:23400 即可进入。Java 与基岩版通用。",
  },
  {
    q: "服务器支持哪些版本？",
    a: "Java 版支持 1.7 至 26.2，基岩版支持 26.0 至 26.40，请使用对应范围的游戏版本进入。",
  },
  {
    q: "需要申请白名单吗？",
    a: "建议先在「用户中心 → 入服申请」填写游戏名与自我介绍，管理员审核通过后即可稳定游玩；未申请也可先进入体验。",
  },
  {
    q: "忘记密码怎么办？",
    a: "在登录页点击「找回密码」，输入注册邮箱获取重置码后即可设置新密码。若未收到邮件，可联系管理员协助。",
  },
  {
    q: "遇到游戏问题/Bug 如何反馈？",
    a: "请前往「用户中心 → 我的工单」提交问题工单，尽量附上发生时间、坐标与复现步骤，管理员会尽快处理。",
  },
  {
    q: "如何成为管理团队成员？",
    a: "管理团队由服务器长期活跃、品行良好的玩家组成，招募信息会在公告中发布，也可在联系页留言自荐。",
  },
  {
    q: "服务器会卡吗？需要什么配置？",
    a: "服务器硬件配置可在「配置」页查看。客户端方面，普通电脑即可流畅游玩；建议关闭光影并预留至少 2GB 内存给游戏。",
  },
  {
    q: "支持正版账号登录吗？",
    a: "支持。可以在「安全中心」绑定微软账号，绑定后可在网页端查看并管理你的游戏角色信息。",
  },
];

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <main className="faq-page relative bg-bg-dark min-h-screen overflow-hidden">
      <div className="h-nav" />
      <div className="absolute inset-0 pointer-events-none rules-glow" aria-hidden="true" />
      <div className="relative z-[2] container-mc py-14">
        <ScrollFadeUp>
          <div className="section-header mb-12 text-center">
            <h1 className="section-title text-[clamp(2rem,5vw,3rem)] font-extrabold text-white mb-4 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              常见问题
            </h1>
            <p className="text-[1.1rem] text-white/80 max-w-[620px] mx-auto">
              关于入服、版本、账号与反馈的常见疑问，点击展开查看解答
            </p>
          </div>
        </ScrollFadeUp>

        <div className="max-w-[860px] mx-auto flex flex-col gap-3">
          {faqs.map((item, i) => {
            const isOpen = open === i;
            return (
              <ScrollFadeUp key={item.q} delay={((i % 2) * 100) as 0 | 100}>
                <div
                  className={`group relative bg-white/5 backdrop-blur-glass border rounded-2xl overflow-hidden transition-all duration-300 ${
                    isOpen
                      ? "border-accent-emerald/40 bg-white/[0.08]"
                      : "border-white/10 hover:border-white/25 hover:bg-white/[0.07]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[1.05rem] font-bold text-white leading-snug">
                      {item.q}
                    </span>
                    <span
                      className={`flex-shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-accent-emerald" : "text-white/70"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-[0.95rem] text-white/75 leading-[1.85] border-t border-white/10 pt-4">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollFadeUp>
            );
          })}
        </div>

        <div className="mt-14 max-w-[860px] mx-auto">
          <ScrollFadeUp>
            <div className="bg-accent-emerald/10 border border-accent-emerald/30 rounded-2xl p-6 text-center">
              <p className="text-emerald-300 text-[0.95rem]">
                没有找到答案？前往「<a href="/contact" className="underline hover:text-white">联系我们</a>」提交留言，或登录后提交工单
              </p>
            </div>
          </ScrollFadeUp>
        </div>
      </div>
    </main>
  );
}
