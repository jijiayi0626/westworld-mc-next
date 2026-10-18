import type { Metadata } from "next";
import FrontShell from "@/components/front/FrontShell";
import { defaultContent } from "@/lib/content";

const { site } = defaultContent;

export const metadata: Metadata = {
  title: "我的世界Westworld西域之光",
  description: site.description,
  keywords: site.keywords,
  authors: [{ name: site.name }],
};

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <FrontShell>{children}</FrontShell>;
}
