import type { ReactNode } from "react";

// 用户中心：使用原版 user/css 体系
export const metadata = {
  title: "用户中心 - Westworld西域之光",
};

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/css/user.css" />
      {children}
    </>
  );
}