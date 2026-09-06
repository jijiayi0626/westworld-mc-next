import type { ReactNode } from "react";

// 登录页独立样式：使用原版浅色登录面板（admin/login.css 体系），不与前台导航/深色主题混用
export const metadata = {
  title: "登录 - Westworld西域之光",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/css/admin.css" />
      {children}
    </>
  );
}