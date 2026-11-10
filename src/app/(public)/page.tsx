import ThemeHome from "@/components/front/ThemeHome";

/**
 * 首页只挂载当前主题的那一份组件文件（src/themes/<key>/Home.tsx）。
 * 可用主题由环境变量 THEME_SLOTS 控制，后台「网站设置 → 外观模板」负责切换。
 */
export default function HomePage() {
  return <ThemeHome />;
}
