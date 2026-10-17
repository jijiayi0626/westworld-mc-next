import type { Metadata } from "next";
import PublicForum from "@/components/PublicForum";

export const metadata: Metadata = {
  title: "论坛公告 - Westworld西域之光",
  description: "西域之光服务器官方公告与论坛动态，无需登录即可查看。",
};

export default function PublicForumPage() {
  return <PublicForum />;
}
