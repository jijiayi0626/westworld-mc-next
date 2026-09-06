import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { defaultContent } from "@/lib/content";

const { site } = defaultContent;

export const metadata: Metadata = {
  title: "我的世界Westworld西域之光",
  description: site.description,
  keywords: site.keywords,
  authors: [{ name: "小狐狸生存服团队" }],
};

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  );
}