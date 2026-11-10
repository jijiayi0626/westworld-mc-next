"use client";

import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/** 模板一 · 经典：主题自有导航与页脚，切换主题时整套替换 */
export default function LayoutV1({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="front-shell" data-front="v1">
        <Navbar />
      </div>
      <main className="front-main">{children}</main>
      <div className="front-shell" data-front="v1">
        <Footer />
      </div>
    </>
  );
}
