"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSiteContent } from "@/components/SiteContentProvider";

interface GameServer {
  id: number;
  server_name: string;
  host: string;
  port: number;
  status: string;
  version: string;
  players_online: number;
  max_players: number;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

function useServerStatus() {
  const [server, setServer] = useState<GameServer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/monitor/status");
        const body = (await res.json()) as { code: number; data: GameServer[] | null };
        if (cancelled) return;
        if (body.code === 0 && Array.isArray(body.data) && body.data.length > 0) {
          setServer(body.data[0]);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { server, failed };
}

function useAnnouncements(limit = 4) {
  const [list, setList] = useState<Announcement[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/announce");
        const body = (await res.json()) as { code: number; data: Announcement[] | null };
        if (!cancelled && body.code === 0 && Array.isArray(body.data)) {
          setList(body.data.slice(0, limit));
        }
      } catch {
        /* 忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);
  return list;
}

function formatDate(s: string) {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SectionHead({ no, title, sub }: { no: string; title: string; sub?: string }) {
  return (
    <div className="fw2-section-head">
      <div className="fw2-section-no">{no}</div>
      <h2 className="fw2-section-title">{title}</h2>
      {sub && <p className="fw2-section-sub">{sub}</p>}
    </div>
  );
}

/** Hero：暗夜绿光首屏 */
function HeroV2() {
  const { site, hero, gallery } = useSiteContent();
  const { server, failed } = useServerStatus();
  const [copied, setCopied] = useState(false);

  const online = server?.status === "online";

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(site.server_ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 忽略 */
    }
  };

  const stats: { label: string; value: string; tone?: "online" | "offline" }[] = [
    { label: "服务器地址", value: site.server_ip },
    {
      label: "在线玩家",
      value: failed ? "—" : !server ? "获取中" : `${server.players_online ?? 0} / ${server.max_players ?? "?"}`,
      tone: online ? "online" : failed ? undefined : "offline",
    },
    { label: "服务器版本", value: server?.version || "原版生存" },
    { label: "支持平台", value: "Java · 基岩" },
    { label: "收录截图", value: `${gallery.items.length} 张` },
  ];

  return (
    <header className="fw2-hero" style={{ backgroundImage: `url('${hero.bg_image}')` }}>
      <div className="fw2-hero-grid" aria-hidden="true" />
      <div className="container-mc fw2-hero-inner">
        <div className="fw2-eyebrow">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
          </svg>
          {site.hero_badge}
        </div>

        <div className="fw2-status-pill">
          <span className={`fw2-dot ${failed || !server ? "is-idle" : online ? "is-on" : "is-off"}`} />
          {failed ? (
            "服务器状态暂不可用"
          ) : !server ? (
            "正在获取服务器状态..."
          ) : online ? (
            <>
              服务器在线，当前 <b>{server.players_online ?? 0}</b> 名玩家
            </>
          ) : (
            "服务器离线"
          )}
        </div>

        <h1 className="fw2-hero-title">
          欢迎来到 <em>{site.hero_title}</em>
        </h1>
        <p className="fw2-hero-sub">{site.hero_subtitle}</p>

        <div className="fw2-chips">
          {site.hero_features.map((f) => (
            <span key={f} className="fw2-chip">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {f}
            </span>
          ))}
        </div>

        <div className="fw2-hero-actions">
          <button type="button" className="fw2-btn fw2-btn-primary" onClick={copyIp}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {copied ? <path d="M20 6 9 17l-5-5" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
            </svg>
            {copied ? "已复制服务器地址" : "复制服务器地址"}
          </button>
          <Link href="#v2-community" className="fw2-btn fw2-btn-ghost">
            加入社区
          </Link>
        </div>
      </div>

      <div className="fw2-statbar">
        <div className="fw2-statbar-inner">
          {stats.map((s) => (
            <div className="fw2-stat" key={s.label}>
              <span className="fw2-stat-label">{s.label}</span>
              <span className={`fw2-stat-value ${s.tone === "online" ? "is-online" : s.tone === "offline" ? "is-offline" : ""}`}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

/** 公告 */
function AnnouncementsV2() {
  const list = useAnnouncements(4);
  if (list.length === 0) return null;

  return (
    <section className="fw2-section" id="v2-notice">
      <div className="container-mc">
        <SectionHead no="01 / NOTICE" title="最新公告" sub="服务器动态与活动资讯，第一时间掌握" />
        <div className="fw2-grid fw2-grid-2">
          {list.map((a) => (
            <Link key={a.id} href={`/forum?focus=home-${a.id}`} className="fw2-card fw2-notice">
              <div className="fw2-notice-meta">
                <span className="fw2-tag">公告</span>
                <span className="fw2-notice-time">{formatDate(a.created_at)}</span>
              </div>
              <h3 className="fw2-card-title">{a.title}</h3>
              <p className="fw2-card-desc fw2-clamp-2">{a.content}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 服务器配置 */
function SpecsV2() {
  const { specs } = useSiteContent();
  return (
    <section className="fw2-section" id="v2-specs">
      <div className="container-mc">
        <SectionHead no="02 / HARDWARE" title={specs.title} sub={specs.subtitle} />
        <div className="fw2-grid fw2-grid-4">
          {specs.items.map((s, i) => (
            <div className="fw2-card" key={i}>
              <div className="fw2-card-icon">
                <img src={s.icon} alt={s.title} loading="lazy" />
              </div>
              <div className="fw2-card-value">{s.value}</div>
              <h3 className="fw2-card-title">{s.title}</h3>
              <p className="fw2-card-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 下载 / 加入步骤 */
function HelpV2() {
  const { help, site } = useSiteContent();
  const [copied, setCopied] = useState(false);

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(site.server_ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <section className="fw2-section" id="v2-help">
      <div className="container-mc">
        <SectionHead no="03 / GET STARTED" title={help.title} sub={help.subtitle} />
        <div className="fw2-grid fw2-grid-3">
          {help.steps.map((step, i) => (
            <div className="fw2-card" key={i}>
              <div className="fw2-step-no">{step.number}</div>
              <h3 className="fw2-card-title">{step.title}</h3>
              <p className="fw2-card-desc">{step.desc}</p>
              {i === 1 && (
                <button type="button" className="fw2-ipbox" onClick={copyIp}>
                  <span className="fw2-ipbox-text">{site.server_ip}</span>
                  <span className="fw2-ipbox-copy">{copied ? "已复制" : "复制"}</span>
                </button>
              )}
              {step.cta && i === 0 && (
                <a href={step.cta_href || "#"} className="fw2-btn fw2-btn-ghost fw2-btn-sm fw2-mt">
                  {step.cta}
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="fw2-launchers">
          {help.launchers.map((l) => (
            <div className="fw2-launcher" key={l.name}>
              <div className="fw2-launcher-head">
                <span className="fw2-launcher-name">{l.name}</span>
                {l.tag && <span className="fw2-tag">{l.tag}</span>}
              </div>
              {l.links.map((link) => (
                <a key={link.label + link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="fw2-launcher-link">
                  <span>{link.label}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 17 17 7M7 7h10v10" />
                  </svg>
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 游戏特色 */
function FeaturesV2() {
  const { features } = useSiteContent();
  return (
    <section className="fw2-section" id="v2-features">
      <div className="container-mc">
        <SectionHead no="04 / FEATURES" title={features.title} sub={features.subtitle} />
        <div className="fw2-grid fw2-grid-3">
          {features.items.map((f, i) => (
            <div className="fw2-card fw2-feature" key={i}>
              <div className="fw2-card-icon fw2-card-icon-lg">
                <img src={f.icon} alt={f.title} loading="lazy" />
              </div>
              <h3 className="fw2-card-title">{f.title}</h3>
              <p className="fw2-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 相册 */
function GalleryV2() {
  const { gallery } = useSiteContent();
  const shots = gallery.items.slice(0, 8);
  return (
    <section className="fw2-section" id="v2-gallery">
      <div className="container-mc">
        <div className="fw2-section-head fw2-head-row">
          <div>
            <div className="fw2-section-no">05 / GALLERY</div>
            <h2 className="fw2-section-title">{gallery.title}</h2>
            <p className="fw2-section-sub">{gallery.subtitle}</p>
          </div>
          <Link href="/gallery" className="fw2-btn fw2-btn-ghost fw2-btn-sm">
            查看全部相册
          </Link>
        </div>
        <div className="fw2-gallery-grid">
          {shots.map((g, i) => (
            <Link key={i} href="/gallery" className="fw2-shot" title={g.desc}>
              <img src={g.src} alt={g.desc || "游戏截图"} loading="lazy" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 管理团队 */
function TeamV2() {
  const { team } = useSiteContent();
  return (
    <section className="fw2-section" id="v2-team">
      <div className="container-mc">
        <SectionHead no="06 / TEAM" title={team.title} sub={team.subtitle} />
        <div className="fw2-team-grid">
          {team.members.map((m, i) => (
            <div className="fw2-member" key={i}>
              <div className="fw2-member-avatar">
                <img src={m.avatar} alt={`${m.name}头像`} loading="lazy" />
              </div>
              <h3 className="fw2-member-name">{m.name}</h3>
              <div className="fw2-member-role">{m.role}</div>
              <p className="fw2-card-desc">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 加入社区 */
function CommunityV2() {
  const { community } = useSiteContent();
  return (
    <section className="fw2-section" id="v2-community">
      <div className="container-mc">
        <SectionHead no="07 / COMMUNITY" title={community.title} sub={community.subtitle} />
        <div className="fw2-community-grid">
          {community.groups.map((g, i) => (
            <div className="fw2-card fw2-community" key={i}>
              <div className="fw2-card-icon">
                <img src={g.icon} alt={g.title} loading="lazy" />
              </div>
              <h3 className="fw2-card-title">{g.title}</h3>
              <p className="fw2-card-desc">{g.desc}</p>
              <div className="fw2-qr">
                <img src={community.qr_image} alt={`${g.title}二维码`} loading="lazy" />
              </div>
              <a href={g.btn_href} className="fw2-btn fw2-btn-primary fw2-btn-sm">
                {g.btn_text}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomeV2() {
  return (
    <>
      <HeroV2 />
      <AnnouncementsV2 />
      <SpecsV2 />
      <HelpV2 />
      <FeaturesV2 />
      <GalleryV2 />
      <TeamV2 />
      <CommunityV2 />
    </>
  );
}
