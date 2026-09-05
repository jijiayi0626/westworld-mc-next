"use client";

import ScrollFadeUp from "./ScrollFadeUp";
import { useSiteContent } from "./SiteContentProvider";
import { galleryLocations } from "@/lib/content";

export default function GalleryGrid() {
  const { gallery } = useSiteContent();

  return (
    <section id="gallery" className="gallery-grid-section bg-bg-dark py-[100px]">
      <div className="container-mc">
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
                className="break-inside-avoid mb-4 rounded-xl overflow-hidden bg-white/5 border border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)] hover:border-white/25"
              >
                <img
                  src={img.src}
                  alt={img.desc}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto block"
                />
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
    </section>
  );
}