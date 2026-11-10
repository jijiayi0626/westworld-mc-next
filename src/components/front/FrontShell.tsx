"use client";

import { useEffect, useState, type ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import NavV2 from "@/components/front/v2/NavV2";
import FooterV2 from "@/components/front/v2/FooterV2";
import { useFrontTheme } from "@/components/FrontThemeProvider";

/**
 * 前台外壳：按当前主题挂载对应的导航与页脚主题文件。
 * 首帧先渲染模板一（与静态 HTML 一致），挂载后再切到实际主题，避免 hydration 冲突。
 */
export default function FrontShell({ children }: { children: ReactNode }) {
  const theme = useFrontTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const v2 = mounted && theme === "v2";

  return (
    <>
      <div className="front-shell" data-front={v2 ? "v2" : "v1"}>
        {v2 ? <NavV2 /> : <Navbar />}
      </div>

      <main className="front-main">{children}</main>

      <div className="front-shell" data-front={v2 ? "v2" : "v1"}>
        {v2 ? <FooterV2 /> : <Footer />}
      </div>
    </>
  );
}
