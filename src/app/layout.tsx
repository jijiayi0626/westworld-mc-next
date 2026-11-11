import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteContentProvider } from "@/components/SiteContentProvider";
import { FrontThemeProvider } from "@/components/FrontThemeProvider";
import { FRONT_THEME_BOOT } from "@/lib/appearance-boot";
import { FaviconSync } from "@/components/FaviconSync";

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
        <script dangerouslySetInnerHTML={{ __html: FRONT_THEME_BOOT }} />
        <link rel="stylesheet" href="/css/front.css" />
        <link rel="stylesheet" href="/css/mobile.css" />
        <link rel="stylesheet" href="/css/fonts.css" />
        <link
          id="site-favicon"
          rel="icon"
          type="image/png"
          href="/static/uploads/favicon-rounded.png"
        />
      </head>
      <body>
        <FaviconSync />
        <AuthProvider>
          <SiteContentProvider>
            <FrontThemeProvider>{children}</FrontThemeProvider>
          </SiteContentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}