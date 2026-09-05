import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteContentProvider } from "@/components/SiteContentProvider";
import { defaultContent } from "@/lib/content";

const { site } = defaultContent;

export const metadata: Metadata = {
  title: "我的世界Westworld西域之光",
  description: site.description,
  keywords: site.keywords,
  authors: [{ name: "小狐狸生存服团队" }],
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🟩</text></svg>"
        />
      </head>
      <body>
        <AuthProvider>
          <SiteContentProvider>
            <Navbar />
            <main>{children}</main>
            <Footer />
          </SiteContentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}