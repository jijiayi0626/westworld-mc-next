"use client";

import { useState } from "react";
import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";
import { galleryLocations } from "@/lib/content";

export default function GalleryCarousel() {
  const { gallery } = useSiteContent();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [level, setLevel] = useState<"全部" | "6.0" | "7.0">("全部");
  const [location, setLocation] = useState<string | null>(null);

  const versionOf = (src: string) => (src.includes("/gallery/6.0/") ? "6.0" : "7.0");
  const locations = Array.from(
    new Set(gallery.items.map((g) => galleryLocations[g.src]).filter(Boolean) as string[])
  );
  const mainTabs = ["全部", "6.0", "7.0"] as const;

  const filtered =
    level === "全部"
      ? gallery.items
      : level === "6.0"
        ? gallery.items.filter((g) => versionOf(g.src) === "6.0")
        : location
          ? gallery.items.filter((g) => galleryLocations[g.src] === location)
          : gallery.items.filter((g) => versionOf(g.src) === "7.0");

  const go = (dir: 1 | -1) => {
    if (fading || filtered.length === 0) return;
    setFading(true);
    setTimeout(() => {
      setIndex((prev) => (prev + dir + filtered.length) % filtered.length);
      setFading(false);
    }, 300);
  };

  const safeIndex = filtered.length === 0 ? 0 : index % filtered.length;
  const current = filtered[safeIndex];

  const switchLevel = (tab: "全部" | "6.0" | "7.0") => {
    if (tab === level) return;
    setFading(true);
    setTimeout(() => {
      setLevel(tab);
      setLocation(null);
      setIndex(0);
      setFading(false);
    }, 300);
  };

  const switchLocation = (loc: string | null) => {
    if (loc === location) return;
    setFading(true);
    setTimeout(() => {
      setLocation(loc);
      setIndex(0);
      setFading(false);
    }, 300);
  };

  return (
    <section
      id="gallery"
      className="gallery-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: `url('${gallery.bg_image}')` }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/60 backdrop-blur-[5px]" />
      <div className="container-mc relative z-[2]">
        <ScrollFadeUp>
          <div className="section-header mb-10 text-center">
            <h2 className="section-title text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold text-white mb-3 text-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
              {gallery.title}
            </h2>
            <p className="section-subtitle text-[1.1rem] text-white/80 max-w-[600px] mx-auto">
              {gallery.subtitle}
            </p>
          </div>
        </ScrollFadeUp>

        <ScrollFadeUp delay={200}>
          <div className="gallery-tabs flex flex-wrap justify-center gap-2.5 mb-4">
            {mainTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchLevel(tab)}
                className={`px-5 py-2 rounded-full text-[0.9rem] font-semibold cursor-pointer border transition-all duration-300 ${
                  level === tab
                    ? "bg-accent-emerald text-white border-accent-emerald shadow-[0_4px_15px_rgba(16,185,129,0.35)]"
                    : "bg-white/5 text-white/70 border-white/15 hover:bg-white/15 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {level === "7.0" && (
            <div className="gallery-location-tabs flex flex-wrap justify-center gap-2.5 mb-8">
              <button
                type="button"
                onClick={() => switchLocation(null)}
                className={`px-4 py-1.5 rounded-full text-[0.85rem] font-medium cursor-pointer border transition-all duration-300 ${
                  location === null
                    ? "bg-white/90 text-bg-dark border-white"
                    : "bg-white/5 text-white/70 border-white/15 hover:bg-white/15 hover:text-white"
                }`}
              >
                全部地点
              </button>
              {locations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => switchLocation(loc)}
                  className={`px-4 py-1.5 rounded-full text-[0.85rem] font-medium cursor-pointer border transition-all duration-300 ${
                    location === loc
                      ? "bg-white/90 text-bg-dark border-white"
                      : "bg-white/5 text-white/70 border-white/15 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </ScrollFadeUp>

        <div className="gallery-carousel-container max-w-[1000px] mx-auto mt-4 relative">
          <div className="gallery-carousel-wrapper w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative border border-white/10">
            <img
              src={current.src}
              alt="Gallery Display"
              decoding="async"
              className={`gallery-active-image w-full h-full object-cover transition-opacity duration-300 ${
                fading ? "opacity-0" : "opacity-100"
              }`}
            />
          </div>

          <div className="gallery-controls flex justify-between items-center mt-5 px-2.5">
            <div className="gallery-text-content text-white/90 text-[1rem] max-w-[70%] leading-relaxed text-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              <p>{current.desc}</p>
            </div>
            <div className="gallery-nav-buttons flex gap-4">
              <button
                type="button"
                onClick={() => go(-1)}
                className="nav-btn w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white cursor-pointer flex items-center justify-center transition-all duration-300 backdrop-blur-sm hover:bg-white hover:text-bg-dark hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] active:scale-95"
                aria-label="上一张"
              >
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="nav-btn w-12 h-12 rounded-full bg-white/10 border border-white/20 text-white cursor-pointer flex items-center justify-center transition-all duration-300 backdrop-blur-sm hover:bg-white hover:text-bg-dark hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.3)] active:scale-95"
                aria-label="下一张"
              >
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}