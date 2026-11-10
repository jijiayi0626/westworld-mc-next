"use client";

import type { ReactNode } from "react";
import Nav from "./Nav";
import Footer from "./Footer";

/** 模板二 · 暗夜绿光：主题自有导航与页脚，切换主题时整套替换 */
export default function LayoutV2({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="front-shell" data-front="v2">
        <Nav />
      </div>
      <main className="front-main">{children}</main>
      <div className="front-shell" data-front="v2">
        <Footer />
      </div>
    </>
  );
}
