"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFrontTheme, useThemeSlots } from "@/components/FrontThemeProvider";
import { themeDef } from "@/themes/registry";

/**
 * 前台外壳：按当前主题挂载该主题包自己的 Layout（导航 + 页脚 + 页面骨架）。
 * 主题包位于 src/themes/<key>/，可用主题由构建时的 THEME_SLOTS 决定。
 * 首帧先渲染默认主题（与静态 HTML 一致），挂载后再切到实际主题，避免 hydration 冲突。
 */
export default function FrontShell({ children }: { children: ReactNode }) {
  const theme = useFrontTheme();
  const slots = useThemeSlots();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = mounted && slots.includes(theme) ? theme : slots[0] || "v1";
  const { Layout } = themeDef(active);

  return <Layout>{children}</Layout>;
}
