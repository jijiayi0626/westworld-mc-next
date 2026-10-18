import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NavV2 from "@/components/front/v2/NavV2";
import FooterV2 from "@/components/front/v2/FooterV2";

/**
 * 前台外壳：同时渲染模板一 / 模板二两套导航与页脚，
 * 由 <html data-frontend> + CSS 决定显示哪一套（见 public/css/front-v2.css）。
 * 采用「双份 DOM + CSS 切换」而非运行时 React 分支，可在静态导出下避免
 * 首屏闪烁与 hydration 不一致。
 */
export default function FrontShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="front-shell" data-front="v1">
        <Navbar />
      </div>
      <div className="front-shell" data-front="v2">
        <NavV2 />
      </div>

      <main className="front-main">{children}</main>

      <div className="front-shell" data-front="v1">
        <Footer />
      </div>
      <div className="front-shell" data-front="v2">
        <FooterV2 />
      </div>
    </>
  );
}
