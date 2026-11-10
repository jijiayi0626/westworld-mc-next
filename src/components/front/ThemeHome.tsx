"use client";

import { useEffect, useState } from "react";
import { useFrontTheme, useThemeSlots } from "@/components/FrontThemeProvider";
import { themeDef } from "@/themes/registry";

/**
 * 按当前主题挂载该主题包自己的首页组件（src/themes/<key>/Home.tsx）。
 * 首帧先渲染第一个主题（与静态 HTML 一致，避免 hydration 不一致），
 * 挂载后再切到后台实际启用的主题；未选中的主题不会出现在 DOM 里。
 */
export default function ThemeHome() {
  const theme = useFrontTheme();
  const slots = useThemeSlots();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = mounted && slots.includes(theme) ? theme : slots[0] || "v1";
  const { Home } = themeDef(active);
  return <Home />;
}
