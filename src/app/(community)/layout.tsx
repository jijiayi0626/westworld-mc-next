import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "西域社区 - Westworld西域之光",
  description: "西域之光玩家社区：发布动态、社区群聊、好友私信与自建群组。",
};

// 社区使用独立全屏布局，不套官网导航栏与页脚
export default function CommunityLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
