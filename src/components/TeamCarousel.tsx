"use client";

import { useEffect, useRef, useState } from "react";
import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";

const CARD_W = 280;
const GAP = 32;
const SPEED = 52;

export default function TeamCarousel() {
  const { team } = useSiteContent();
  const members = team.members;
  const items = [...members, ...members];
  const loopWidth = members.length * (CARD_W + GAP);
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const autoOnRef = useRef(true);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const loopPos = (pos: number) => {
    while (pos > 0) pos -= loopWidth;
    while (pos <= -loopWidth) pos += loopWidth;
    return pos;
  };

  const applyPos = (pos: number) => {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate3d(${pos}px,0,0)`;
    }
  };

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (autoOnRef.current) {
        posRef.current = loopPos(posRef.current - SPEED * dt);
        applyPos(posRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        autoOnRef.current = true;
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    autoOnRef.current = false;
    draggingRef.current = true;
    setDragging(true);
    startXRef.current = e.clientX;
    startPosRef.current = posRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    posRef.current = loopPos(startPosRef.current + dx);
    applyPos(posRef.current);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <section
      id="team"
      className="team-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: `url('${team.bg_image}')` }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/70 backdrop-blur-[5px]" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              {team.title}
            </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {team.subtitle}
            </p>
          </div>
        </ScrollFadeUp>

        <div
          ref={containerRef}
          className={`team-carousel-container max-w-full mt-12 relative py-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] select-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            ref={wrapperRef}
            className="team-carousel-wrapper flex gap-8 w-max"
            style={{ willChange: "transform" }}
          >
            {items.map((member, i) => (
              <div
                key={i}
                className="team-card flex-[0_0_280px] w-[280px] min-w-0 bg-transparent border-none rounded-[20px] px-[30px] py-10 text-center transition-all duration-300 flex flex-col items-center hover:-translate-y-2.5"
              >
                <div className="team-avatar w-[100px] h-[100px] rounded-full mb-5 overflow-hidden border-[3px] border-white/20 shadow-[0_5px_15px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-[#4ade80] hover:scale-105">
                  <img
                    src={member.avatar}
                    alt={`${member.name}头像`}
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="team-name text-[1.5rem] text-white mb-1.5">{member.name}</h3>
                <p className="team-role text-[0.9rem] text-[#4ade80] tracking-wider mb-4 font-semibold">
                  {member.role}
                </p>
                <p className="team-desc text-[0.95rem] text-white/70 leading-relaxed">
                  {member.desc}
                </p>
                <a
                  href={member.contact_href}
                  className="team-contact-btn inline-block mt-5 px-6 py-2.5 bg-white text-bg-dark font-bold no-underline rounded-full transition-all duration-300 opacity-0 translate-y-5 animate-fade-in-up-btn shadow-[0_4px_6px_rgba(0,0,0,0.1)] hover:-translate-y-1 hover:scale-105 hover:shadow-[0_10px_20px_rgba(255,255,255,0.3)] hover:bg-primary-hover"
                >
                  联系我
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
