import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { SiteContentProvider } from "@/components/SiteContentProvider";
import { FrontThemeProvider } from "@/components/FrontThemeProvider";
import { FRONT_THEME_BOOT } from "@/lib/appearance-boot";
import { FaviconSync } from "@/components/FaviconSync";
import { BOOT_SPLASH_CSS, BOOT_SCRIPT } from "@/lib/boot-splash";

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
        <style dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: FRONT_THEME_BOOT }} />
        <link rel="stylesheet" href="/css/front.css" />
        <link rel="stylesheet" href="/css/mobile.css" />
        <link
          id="site-favicon"
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🟩</text></svg>"
        />
      </head>
      <body>
        <div id="boot-splash" aria-hidden="true">
          <div className="boot-ring" />
          <p>西域之光 · 加载中</p>
        </div>
        <FaviconSync />
        <AuthProvider>
          <SiteContentProvider>
            <FrontThemeProvider>{children}</FrontThemeProvider>
          </SiteContentProvider>
        </AuthProvider>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </body>
    </html>
  );
}