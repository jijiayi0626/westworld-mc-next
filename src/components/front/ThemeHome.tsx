"use client";

import { useFrontTheme, useThemeSlots } from "@/components/FrontThemeProvider";
import { themeDef } from "@/themes/registry";

/**
 * 按当前主题挂载该主题包自己的首页组件（src/themes/<key>/Home.tsx）。
 * 只会渲染被选中的那一套组件，另一套不会出现在 DOM 里。
 */
export default function ThemeHome() {
  const theme = useFrontTheme();
  const slots = useThemeSlots();
  const active = slots.includes(theme) ? theme : slots[0] || "v1";
  const { Home } = themeDef(active);
  return <Home />;
}
