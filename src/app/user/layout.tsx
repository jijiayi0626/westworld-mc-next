import type { ReactNode } from "react";
import { BodyClass } from "@/components/BodyClass";

// 用户中心：使用原版 user/css 体系
// FOUC 防护：渲染前从 localStorage 恢复后台主题/主色（Shell 加载后写入缓存）
const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("admin_style_v1")||"null");if(!s)return;var r=document.documentElement;if(s.theme==="dark")r.setAttribute("data-theme","dark");else if(s.theme==="light")r.setAttribute("data-theme","light");else if(s.theme==="system")r.setAttribute("data-theme",window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(s.accent)r.style.setProperty("--green",s.accent);}catch(e){}})();`;

export const metadata = {
  title: "用户中心 - Westworld西域之光",
};

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <link rel="stylesheet" href="/css/user.css" />
      <link rel="stylesheet" href="/css/mobile.css" />
      <link rel="stylesheet" href="/css/shell.css" />
      <BodyClass cls="user-page" />
      {children}
    </>
  );
}