import type { ReactNode } from "react";
import { BodyClass } from "@/components/BodyClass";
import { APPEARANCE_BOOT } from "@/lib/appearance-boot";

// 用户中心：使用原版 user/css 体系
// FOUC 防护：渲染前恢复外观设置（用户偏好 > 后台样式，见 lib/appearance-boot.ts）
export const metadata = {
  title: "用户中心 - Westworld西域之光",
};

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT }} />
      <link rel="stylesheet" href="/css/user.css" />
      <link rel="stylesheet" href="/css/theme-classic.css" />
      <link rel="stylesheet" href="/css/mobile.css" />
      <link rel="stylesheet" href="/css/shell.css" />
      <BodyClass cls="user-page" />
      {children}
    </>
  );
}