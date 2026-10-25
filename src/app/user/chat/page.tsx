"use client";

import { useEffect } from "react";

/** 聊天室已并入官网论坛：/user/chat → /forum?tab=chat */
export default function UserChatRedirectPage() {
  useEffect(() => {
    window.location.replace("/forum?tab=chat");
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center font-mono text-[0.8rem] uppercase tracking-[0.2em] text-slate-400">
      Redirecting to chat…
    </div>
  );
}
