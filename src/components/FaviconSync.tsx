"use client";

import { useEffect } from "react";

/** 读取后台配置的站点图标并替换页面 favicon */
export function FaviconSync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/favicon")
      .then((res) => res.json() as Promise<{ data?: { url?: string } }>)
      .then((body) => {
        const url = body?.data?.url;
        if (cancelled || !url) return;
        document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = url;
        document.head.appendChild(link);
      })
      .catch(() => {
        /* 图标加载失败时保留默认图标 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
