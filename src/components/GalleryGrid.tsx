"use client";

import { useState } from "react";
import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";
import { Modal } from "./motion";
import { galleryLocations } from "@/lib/content";

interface GalleryItem {
  src: string;
  desc: string;
}

export default function GalleryGrid() {
  const { gallery } = useSiteContent();
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);

  return (
    <section
      id="gallery"
      className="gallery-grid-section relative bg-bg-dark bg-fixed bg-cover bg-center overflow-hidden py-[100px]"
      style={{ backgroundImage: `url('${gallery.bg_image}')` }}
    >
      <div className="absolute inset-0 z-[1] bg-bg-dark/55 backdrop-blur-[2px]" />
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

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:balance]">
          {gallery.items.map((img, i) => {
            const loc = galleryLocations[img.src];
            return (
              <figure
                key={i}
                className="group break-inside-avoid mb-4 rounded-2xl overflow-hidden bg-white/5 border border-white/10 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_rgba(0,0,0,0.5)] hover:border-accent-emerald/40 cursor-zoom-in"
                onClick={() => setLightbox(img)}
              >
                <div className="overflow-hidden relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.desc}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto block transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
                <figcaption className="px-3.5 py-3 text-[0.85rem] text-white/70 leading-relaxed">
                  {img.desc}
                  {loc && (
                    <span className="inline-block ml-2 px-2 py-0.5 rounded-full bg-accent-emerald/20 text-accent-emerald text-[0.75rem] font-semibold align-middle">
                      {loc}
                    </span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>

      {/* 灯箱：点击放大查看 */}
      <Modal
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        overlayClassName="z-[2000] bg-black/90 backdrop-blur-sm p-4 md:p-10 cursor-zoom-out"
        panelClassName="max-w-full max-h-full flex flex-col gap-3"
        label={lightbox?.desc || "图片预览"}
      >
        {lightbox ? (
          <>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white cursor-pointer flex items-center justify-center transition-colors hover:bg-white/25"
              aria-label="关闭预览"
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="currentColor"
                  d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
            <figure className="max-w-full max-h-full flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.src}
                alt={lightbox.desc}
                className="max-w-full max-h-[82vh] w-auto mx-auto object-contain rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
              />
              {lightbox.desc && (
                <figcaption className="text-center text-white/80 text-[0.9rem]">
                  {lightbox.desc}
                  {galleryLocations[lightbox.src] && (
                    <span className="inline-block ml-2 px-2 py-0.5 rounded-full bg-accent-emerald/20 text-accent-emerald text-[0.75rem] font-semibold align-middle">
                      {galleryLocations[lightbox.src]}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          </>
        ) : null}
      </Modal>
    </section>
  );
}