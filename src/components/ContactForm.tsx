"use client";

import { useState, type FormEvent } from "react";
import ScrollFadeUp from "./ScrollFadeUp";

export default function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    // 第 1 期：仅前端校验，提交后提示功能开发中
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    }, 600);
  };

  return (
    <section
      id="contact"
      className="contact-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: "url('/png/5e1e1be033cbd911e62327519886379f.jpg')" }}
    >
      <div className="absolute inset-0 z-[1] bg-black/60" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              联系我们
            </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              有任何问题或建议？通过邮件直接联系服主
            </p>
          </div>
        </ScrollFadeUp>

        <ScrollFadeUp delay={200}>
          <div className="contact-container max-w-[1000px] mx-auto bg-white/5 backdrop-blur-glass p-10 rounded-[20px] border border-white/10 shadow-glass">
            <div className="contact-grid grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
              <div className="contact-rules text-left md:pr-5 md:border-r md:border-white/10 h-full">
                <h3 className="rules-title text-[1.5rem] mb-6 text-white flex items-center gap-2.5">
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                  邮件填写指南
                </h3>
                <ul className="rules-list flex flex-col gap-5">
                  <li className="flex gap-4 items-start text-slate-300 text-[0.95rem] leading-relaxed">
                    <span className="rule-icon flex items-center justify-center w-6 h-6 bg-[rgba(16,185,129,0.2)] text-accent-emerald rounded-full text-[0.8rem] font-bold flex-shrink-0 mt-0.5">
                      1
                    </span>
                    <span className="rule-text">
                      请务必填写真实有效的<strong className="text-white font-semibold">邮箱地址</strong>，以便接收回复。
                    </span>
                  </li>
                  <li className="flex gap-4 items-start text-slate-300 text-[0.95rem] leading-relaxed">
                    <span className="rule-icon flex items-center justify-center w-6 h-6 bg-[rgba(16,185,129,0.2)] text-accent-emerald rounded-full text-[0.8rem] font-bold flex-shrink-0 mt-0.5">
                      2
                    </span>
                    <span className="rule-text">
                      标题请简明扼要，如“<strong className="text-white font-semibold">[Bug反馈]</strong>
                      交易系统金币丢失”。
                    </span>
                  </li>
                  <li className="flex gap-4 items-start text-slate-300 text-[0.95rem] leading-relaxed">
                    <span className="rule-icon flex items-center justify-center w-6 h-6 bg-[rgba(16,185,129,0.2)] text-accent-emerald rounded-full text-[0.8rem] font-bold flex-shrink-0 mt-0.5">
                      3
                    </span>
                    <span className="rule-text">
                      详细描述中请包含<strong className="text-white font-semibold">发生时间、坐标、复现步骤</strong>
                      等信息。
                    </span>
                  </li>
                  <li className="flex gap-4 items-start text-slate-300 text-[0.95rem] leading-relaxed">
                    <span className="rule-icon flex items-center justify-center w-6 h-6 bg-[rgba(16,185,129,0.2)] text-accent-emerald rounded-full text-[0.8rem] font-bold flex-shrink-0 mt-0.5">
                      4
                    </span>
                    <span className="rule-text">
                      举报违规请提供<strong className="text-white font-semibold">截图或视频证据链接</strong>。
                    </span>
                  </li>
                  <li className="flex gap-4 items-start text-slate-300 text-[0.95rem] leading-relaxed">
                    <span className="rule-icon flex items-center justify-center w-6 h-6 bg-[rgba(16,185,129,0.2)] text-accent-emerald rounded-full text-[0.8rem] font-bold flex-shrink-0 mt-0.5">
                      5
                    </span>
                    <span className="rule-text">
                      处理时间通常为<strong className="text-white font-semibold">1-3个工作日</strong>，请耐心等待。
                    </span>
                  </li>
                </ul>
                <div className="contact-note mt-8 px-4 py-4 bg-[rgba(239,68,68,0.1)] border-l-[3px] border-red-500 rounded">
                  <p className="text-red-300 text-[0.85rem]">
                    注：恶意骚扰或发送垃圾邮件将被永久拉黑。
                  </p>
                </div>
              </div>

              <form className="contact-form flex flex-col gap-5" onSubmit={handleSubmit}>
                <div className="form-group flex flex-col gap-2 text-left">
                  <label htmlFor="name" className="text-slate-400 text-[0.9rem] font-medium ml-1">
                    您的昵称
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    placeholder="请输入游戏ID或昵称"
                    required
                    className="bg-black/30 border border-white/10 rounded-[10px] px-4 py-3 text-white text-[1rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                  />
                </div>

                <div className="form-group flex flex-col gap-2 text-left">
                  <label htmlFor="email" className="text-slate-400 text-[0.9rem] font-medium ml-1">
                    联系邮箱
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="用于接收回复的邮箱地址"
                    required
                    className="bg-black/30 border border-white/10 rounded-[10px] px-4 py-3 text-white text-[1rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                  />
                </div>

                <div className="form-group flex flex-col gap-2 text-left">
                  <label htmlFor="subject" className="text-slate-400 text-[0.9rem] font-medium ml-1">
                    主题
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    className="bg-black/30 border border-white/10 rounded-[10px] px-4 py-3 text-white text-[1rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)] [&>option]:bg-[#1a1a2e] [&>option]:text-white"
                  >
                    <option value="report">举报违规</option>
                    <option value="bug">Bug反馈</option>
                    <option value="appeal">封禁申诉</option>
                    <option value="suggestion">服务器建议</option>
                    <option value="other">其他事项</option>
                  </select>
                </div>

                <div className="form-group flex flex-col gap-2 text-left">
                  <label htmlFor="message" className="text-slate-400 text-[0.9rem] font-medium ml-1">
                    详细内容
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder="请详细描述您遇到的问题..."
                    required
                    className="bg-black/30 border border-white/10 rounded-[10px] px-4 py-3 text-white text-[1rem] resize-y min-h-[100px] leading-relaxed transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="submit-btn mt-2.5 bg-gradient-to-br from-accent-emerald to-[#059669] text-white border-none px-7 py-3.5 rounded-[10px] font-semibold text-[1.1rem] cursor-pointer transition-all duration-300 flex items-center justify-center gap-2.5 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(16,185,129,0.4)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>{submitting ? "发送中..." : submitted ? "已提交（功能开发中）" : "发送邮件"}</span>
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </ScrollFadeUp>
      </div>
    </section>
  );
}