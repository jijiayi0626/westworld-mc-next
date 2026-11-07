import type { Metadata } from "next";
import CommunityApp from "@/components/community/CommunityApp";

export const metadata: Metadata = {
  title: "西域社区 - Westworld西域之光",
  description: "发布动态、加入社区群、添加好友并互发私信，和西域之光的玩家一起交流。",
};

export default function CommunityPage() {
  return <CommunityApp />;
}
