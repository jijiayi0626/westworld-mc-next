"use client";

import { useEffect, useState } from "react";
import { useFrontTheme, useThemeSlots } from "@/components/FrontThemeProvider";
import { themeDef } from "@/themes/registry";

/**
 * 按当前主题挂载对应主题文件。
 * 只有被选中的那一套组件会真正渲染，避免两套 DOM 同时存在于页面里。
 * 首帧先渲染模板一（与服务端静态 HTML 一致），挂载后再切到实际主题，避免 hydration 冲突。
 */
export default function ThemeHome() {
  const theme = useFrontTheme();
  const slots = useThemeSlots();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = mounted && slots.includes(theme) ? theme : slots[0] || "v1";
  const Component = themeDef(active).Home;
  return <Component />;
}
