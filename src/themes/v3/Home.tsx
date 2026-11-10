"use client";

import Link from "next/link";
import { useState } from "react";
import { useSiteContent } from "@/components/SiteContentProvider";

const BENTO = [
  {
    tag: "SURVIVAL",
    title: "纯净生存",
    desc: "原版核心玩法，保留红石与刷怪机制，只做必要的性能优化。",
    accent: "violet",
    span: "wide",
  },
  {
    tag: "BUILD",
    title: "建筑与创作",
    desc: "领地保护、创意工坊与定期建筑赛，作品会被收录进服务器画廊。",
    accent: "cyan",
    span: "",
  },
  {
    tag: "SOCIAL",
    title: "社区与组队",
    desc: "论坛、群聊、好友与私信一应俱全，找队友不用再翻聊天记录。",
    accent: "blue",
    span: "",
  },
  {
    tag: "EVENT",
    title: "每周活动",
    desc: "周末副本、寻宝与 PVP 竞技轮换开放，参与即可获得积分。",
    accent: "pink",
    span: "",
  },
  {
    tag: "STABLE",
    title: "稳定与安全",
    desc: "自动备份、实时监控与白名单审核，24 小时在线状态可查。",
    accent: "green",
    span: "wide",
  },
];

const STATS = [
  { label: "版本", value: "1.20.x" },
  { label: "模式", value: "生存 / 建筑" },
  { label: "在线时段", value: "7 × 24" },
  { label: "社区", value: "开放注册" },
];

export default function HomeV3() {
  const { site } = useSiteContent();
  const [copied, setCopied] = useState(false);
  const address = site.server_port ? `${site.server_ip}:${site.server_port}` : site.server_ip;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="m3-home">
      <div className="m3-aurora" aria-hidden="true">
        <span className="m3-blob m3-blob-a" />
        <span className="m3-blob m3-blob-b" />
        <span className="m3-blob m3-blob-c" />
      </div>

      <section className="m3-hero">
        <span className="m3-eyebrow">
          <i aria-hidden="true" />
          {site.hero_badge || "MC 生存服务器 · 长期开放"}
        </span>
        <h1 className="m3-title">
          在方块世界里
          <br />
          建一座<span className="m3-grad">属于你的城</span>
        </h1>
        <p className="m3-sub">{site.hero_subtitle || site.description}</p>

        <div className="m3-hero-actions">
          <Link href="/help" className="m3-btn m3-btn-primary">
            开始游玩
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <button type="button" className="m3-btn m3-btn-ip" onClick={copy}>
            <code>{address}</code>
            <span>{copied ? "已复制" : "复制 IP"}</span>
          </button>
        </div>

        <div className="m3-stats">
          {STATS.map((s) => (
            <div key={s.label} className="m3-stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="m3-section">
        <div className="m3-section-head">
          <span className="m3-kicker">WHY US</span>
          <h2>不只是一个服务器</h2>
          <p>稳定的线上环境、认真维护的社区，以及一群愿意一起把世界建大的玩家。</p>
        </div>

        <div className="m3-bento">
          {BENTO.map((b, i) => (
            <article key={b.title} className={`m3-card m3-${b.accent} ${b.span === "wide" ? "m3-wide" : ""}`}>
              <div className="m3-card-top">
                <span className="m3-card-tag">{b.tag}</span>
                <span className="m3-card-num">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="m3-split">
        <div className="m3-split-text">
          <span className="m3-kicker">GET STARTED</span>
          <h2>三步进入西域之光</h2>
          <ol className="m3-steps">
            <li>
              <span>01</span>
              <div>
                <strong>注册账号</strong>
                <p>支持邮箱注册，QQ 邮箱会自动同步头像。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>提交入服申请</strong>
                <p>填写游戏名与简单介绍，管理员会尽快审核。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>连接服务器</strong>
                <p>在多人游戏中添加服务器地址即可开始。</p>
              </div>
            </li>
          </ol>
          <Link href="/help" className="m3-link-arrow">
            查看完整新手指引
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17 17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="m3-terminal" aria-hidden="true">
          <div className="m3-terminal-bar">
            <span />
            <span />
            <span />
            <em>server.properties</em>
          </div>
          <pre>
{`> status
online   · 2 players
version  · 1.20.x
uptime   · 99.9%

> join
ip       · ${address}
mode     · survival
region   · cn

> welcome
正在生成你的第一个区块...`}
          </pre>
        </div>
      </section>

      <section className="m3-cta">
        <div>
          <h2>世界已经开服，就差你了</h2>
          <p>加入 QQ 群 838177210，和两百多位玩家一起开荒。</p>
        </div>
        <div className="m3-cta-actions">
          <Link href="/login" className="m3-btn m3-btn-primary">
            立即注册
          </Link>
          <Link href="/community" className="m3-btn m3-btn-ghost">
            逛逛社区
          </Link>
        </div>
      </section>
    </div>
  );
}
