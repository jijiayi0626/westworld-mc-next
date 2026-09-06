import type { ReactNode } from "react";
import { BodyClass } from "@/components/BodyClass";

// 管理后台：使用原版 admin/css 体系
export const metadata = {
  title: "管理后台 - Westworld西域之光",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href="/css/admin.css" />
      <BodyClass cls="admin-page" />
      {children}
    </>
  );
}