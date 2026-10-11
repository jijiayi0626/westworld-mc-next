import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteContentProvider } from "@/components/SiteContentProvider";

export const metadata: Metadata = {
  title: "我的世界Westworld西域之光",
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
        <link rel="stylesheet" href="/css/front.css" />
        <link rel="stylesheet" href="/css/mobile.css" />
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🟩</text></svg>"
        />
      </head>
      <body>
        <AuthProvider>
          <SiteContentProvider>{children}</SiteContentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}