"use client";

import { useEffect } from "react";

/** 论坛已统一到官网 /forum；保留此路由仅做跳转（兼容旧书签） */
export default function UserForumRedirect() {
  useEffect(() => {
    window.location.replace("/forum");
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center font-mono text-[0.8rem] uppercase tracking-[0.2em] text-slate-400">
      Redirecting to /forum…
    </div>
  );
}
