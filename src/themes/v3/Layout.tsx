"use client";

import type { ReactNode } from "react";
import NavV3, { FooterV3 } from "./Nav";

/** 模板三 · 极光幻境：悬浮胶囊导航 + 独立页脚，整包替换模板一的结构 */
export default function LayoutV3({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="front-shell" data-front="v3">
        <NavV3 />
      </div>
      <main className="front-main m3-main">{children}</main>
      <div className="front-shell" data-front="v3">
        <FooterV3 />
      </div>
    </>
  );
}
