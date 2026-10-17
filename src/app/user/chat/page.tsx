"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserShell } from "@/components/Shell";

/** 聊天室已并入论坛：/user/chat → /user/forum?tab=chat */
export default function UserChatRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/user/forum?tab=chat");
  }, [router]);

  return (
    <UserShell>
      <div className="px-6 py-6 max-w-[860px] mx-auto text-slate-500 text-[0.9rem]">
        聊天室已并入「论坛」，正在跳转…
      </div>
    </UserShell>
  );
}
