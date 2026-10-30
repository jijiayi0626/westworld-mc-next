"use client";

import { useState } from "react";
import ScrollFadeUp from "./ScrollFadeUp";
import MotdQuery from "./MotdQuery";
import { useSiteContent } from "./SiteContentProvider";

type DownloadSource = "official" | "netdisk";

interface LauncherLink {
  label: string;
  url: string;
  note?: string;
  source?: DownloadSource;
}

/** 旧数据没有 source 字段时，按文案/域名判断下载源，兼容后台已保存的内容 */
function detectSource(link: LauncherLink): DownloadSource {
  if (link.source === "official" || link.source === "netdisk") return link.source;
  const label = link.label || "";
  if (/官网|官方|作者|发布页|github/i.test(label)) return "official";
  if (/网盘|云盘|夸克|迅雷|蓝奏|百度|提取码/i.test(label)) return "netdisk";
  try {
    const host = new URL(link.url).hostname.toLowerCase();
    if (/huangyuhui|foldcraftlauncher|pclce|github/.test(host)) return "official";
  } catch {
    /* 非法 URL 交给默认值 */
  }
  return "official";
}

/** 页面第一步「下载启动器」使用的公共网盘 */
const SHARED_NETDISK = "https://cloud.inumc.dpdns.org/s/a8c9ad73dc064495a352cbe25aa2561a";

/** 从第一步文案里读取网盘密码（页面原文：下载密码：westworld） */
function extractPassword(text: string): string {
  const m = text.match(/下载密码[:：]\s*([^\s，。,.；;]+)/);
  return m?.[1] ?? "";
}

export default function HelpSteps() {
  const { help, site } = useSiteContent();
  const [downloadSource, setDownloadSource] = useState<DownloadSource>("netdisk");

  // 复用页面第一步里已配置的「启动器下载网盘」，没有时回退到固定地址
  const sharedStep = help.steps.find(
    (s) => s.cta_href && /cloud|pan\.|lanzou|quark|xunlei|baidu|drive/i.test(s.cta_href)
  );
  const sharedNetdisk = sharedStep?.cta_href || SHARED_NETDISK;
  const sharedPassword = extractPassword(sharedStep?.desc || "") || extractPassword(help.steps.map((s) => s.desc).join(" "));

  const linksOf = (launcher: (typeof help.launchers)[number]): LauncherLink[] => {
    const matched = (launcher.links ?? []).filter((link) => detectSource(link) === downloadSource);
    if (matched.length > 0) return matched;
    if (downloadSource === "netdisk") {
      return [{ label: "我们的网盘", url: sharedNetdisk, note: sharedPassword ? `密码 ${sharedPassword}` : undefined, source: "netdisk" }];
    }
    return [];
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(site.server_ip);
    } catch {
      // ignore
    }
  };

  return (
    <section
      id="help-docs"
      className="help-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: `url('${help.bg_image}')` }}
    >
      <div className="container-mc relative z-[2] text-center">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              {help.title}
      </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {help.subtitle}
      </p>
    </div>
    </ScrollFadeUp>

        <div className="steps-container flex justify-center items-start gap-5 mt-12 flex-wrap">
          {help.steps.map((step, i) => (
            <div key={i} className="contents">
              <ScrollFadeUp delay={((i * 2 + 1) * 100) as 100 | 300 | 500}>
                <div className="step-card group bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-[30px] text-center flex-1 min-w-[280px] max-w-[350px] transition-all duration-300 relative overflow-hidden hover:-translate-y-2.5 hover:bg-white/[0.08] hover:border-accent-emerald/40 hover:shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-accent-emerald/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="step-number absolute -top-2.5 -right-2.5 text-[5rem] font-black text-white/[0.05] leading-none z-0 pointer-events-none">
                    {step.number}
        </div>
                  <div className="step-icon w-[70px] h-[70px] bg-white/10 rounded-full flex items-center justify-center mx-auto mb-5 text-accent-green relative z-[1] border border-white/10 transition-all duration-300 hover:bg-accent-green hover:text-bg-dark hover:scale-110 hover:rotate-[10deg] hover:shadow-[0_0_20px_rgba(0,230,118,0.4)]">
                    {i === 0 && (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
                    )}
                    {i === 1 && (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12 8V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
                    )}
                    {i === 2 && (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5 3L19 12L5 21V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
                    )}
          </div>
                  <h3 className="step-title text-[1.5rem] font-bold text-white mb-[15px] relative z-[1]">
                    {step.title}
        </h3>
                  <p className="step-desc text-[0.95rem] text-white/70 mb-6 leading-relaxed relative z-[1] min-h-[48px]">
                    {step.desc}
        </p>
                  {step.cta && (
                    <a
                      href={step.cta_href || "#"}
                      className="btn-step inline-block px-6 py-2.5 bg-white text-bg-dark rounded-lg font-bold text-[0.9rem] transition-all duration-300 border-none cursor-pointer no-underline relative z-[1] hover:bg-primary-hover hover:-translate-y-0.5 hover:shadow-[0_5px_15px_rgba(255,255,255,0.2)]"
                    >
                      {step.cta}
          </a>
                  )}
                  {i === 1 && (
                    <div className="server-address-box bg-black/30 border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between gap-2.5 relative z-[1]">
                      <span className="font-mono text-accent-green font-bold tracking-wider">
                        {site.server_ip}
            </span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="copy-btn bg-white/10 border-none text-white w-8 h-8 rounded-md cursor-pointer flex items-center justify-center transition-all duration-300 hover:bg-white hover:text-bg-dark"
                        aria-label="复制 IP"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M5 15H4C3.46957 15 2.96086 14.7893 2.58579 14.4142C2.21071 14.0391 2 13.5304 2 13V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            </div>
                  )}
                  {i === 2 && (
                    <span className="highlight-text block font-bold text-accent-gold mt-[15px] text-[1.1rem] relative z-[1]">
                      祝您游戏愉快！
            </span>
                  )}
        </div>
        </ScrollFadeUp>

              {i < help.steps.length - 1 && (
                <div className="step-arrow hidden lg:flex items-center justify-center text-white/30 pt-[100px]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12H19" />
                    <path d="M12 5L19 12L12 19" />
        </svg>
      </div>
              )}
      </div>
          ))}
    </div>

        {/* 服务器 MOTD 在线查询 */}
        <div className="relative z-[2] mt-14 max-w-[640px] mx-auto text-left">
          <ScrollFadeUp>
            <h3 className="text-[clamp(1.3rem,3vw,1.6rem)] font-bold text-white mb-2 text-center text-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              服务器状态在线查询
            </h3>
            <p className="text-[0.95rem] text-white/70 mb-5 text-center">
              输入任意服务器地址即可查询 MOTD、版本与在线人数（由 MineBBS MOTD API 提供）
            </p>
            <div className="[&_input]:bg-white/10 [&_input]:border [&_input]:border-white/15 [&_input]:rounded-[10px] [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:text-white [&_input]:placeholder:text-white/40 [&_input]:text-[0.9rem] [&_input]:focus:outline-none [&_input]:focus:border-accent-emerald/60 [&_button]:bg-accent-emerald [&_button]:text-white [&_button]:border-0 [&_button]:rounded-[10px] [&_button]:px-5 [&_button]:py-2.5 [&_button]:font-semibold [&_button]:cursor-pointer [&_button]:hover:bg-[#00c464] [&_button]:transition-colors [&_button]:disabled:opacity-50">
              <MotdQuery defaultHost={site.server_ip} />
            </div>
          </ScrollFadeUp>
        </div>

        <div id="launchers" className="launcher-section relative z-[2] mt-20 scroll-mt-24">
          <ScrollFadeUp>
            <h3 className="text-[clamp(1.4rem,3vw,1.8rem)] font-bold text-white mb-2 text-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              选择一个你喜欢的启动器
            </h3>
            <p className="text-[1rem] text-white/75 mb-6 text-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
              官方渠道与备用网盘均可下载，任选其一
            </p>
            <div className="mb-10">
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/30 border border-white/15 backdrop-blur-sm">
                {(
                  [
                    { key: "netdisk", label: "我们的网盘", hint: "与第一步相同的网盘" },
                    { key: "official", label: "官方源", hint: "启动器官网" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDownloadSource(item.key)}
                    aria-pressed={downloadSource === item.key}
                    className={`px-5 py-2 rounded-full text-[0.9rem] font-semibold transition-all duration-300 border-0 cursor-pointer ${
                      downloadSource === item.key
                        ? "bg-accent-green text-bg-dark shadow-[0_4px_14px_rgba(0,230,118,0.35)]"
                        : "bg-transparent text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    title={item.hint}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {downloadSource === "netdisk" && sharedPassword && (
                <p className="text-[0.82rem] text-white/55 mt-3 mb-0">
                  网盘下载密码：<span className="text-accent-gold font-semibold">{sharedPassword}</span>
                </p>
              )}
            </div>
          </ScrollFadeUp>

          <div className="launcher-grid grid gap-6 sm:grid-cols-2 lg:grid-cols-4 max-w-[1200px] mx-auto">
            {help.launchers.map((launcher, i) => (
              <ScrollFadeUp key={launcher.name} delay={((i + 1) * 100) as 100 | 200 | 300 | 400}>
                <div className="launcher-card group relative bg-white/5 backdrop-blur-glass border border-white/10 rounded-2xl p-[24px] text-left h-full flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:bg-white/[0.08] hover:border-accent-gold/40 hover:shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-accent-gold/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[1.15rem] font-bold text-white">{launcher.name}</h4>
                    {launcher.tag && (
                      <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded-full text-bg-dark bg-accent-green">
                        {launcher.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.88rem] text-white/65 mb-5 leading-relaxed flex-1">
                    {launcher.desc}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {linksOf(launcher).map((link) => (
                      <a
                        key={link.label + link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-2 bg-white/10 hover:bg-white hover:text-bg-dark border border-white/10 rounded-lg px-3.5 py-2.5 text-[0.88rem] font-semibold text-white transition-all duration-300 no-underline"
                      >
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate">{link.label}</span>
                          {link.note && (
                            <span className="mt-0.5 text-[0.72rem] font-normal text-accent-gold group-hover:text-bg-dark/70">
                              {link.note}
                            </span>
                          )}
                        </span>
                        <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17L17 7" />
                          <path d="M7 7H17V17" />
                        </svg>
                      </a>
                    ))}
                    {linksOf(launcher).length === 0 && (
                      <p className="text-[0.82rem] text-white/45 m-0">
                        {downloadSource === "official"
                          ? "该启动器暂无官方下载链接，请切换到「我们的网盘」"
                          : "该启动器暂无网盘链接，请切换到「官方源」"}
                      </p>
                    )}
                  </div>
                </div>
              </ScrollFadeUp>
            ))}
          </div>
        </div>
  </div>
</section>
  );
}
