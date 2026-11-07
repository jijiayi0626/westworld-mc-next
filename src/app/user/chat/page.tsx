"use client";

import { useEffect } from "react";

/** 社区群已并入 /forum：/user/chat → /forum?view=community */
export default function UserChatRedirectPage() {
  useEffect(() => {
    window.location.replace("/forum?view=community");
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center font-mono text-[0.8rem] uppercase tracking-[0.2em] text-slate-400">
      Redirecting to chat…
    </div>
  );
}
