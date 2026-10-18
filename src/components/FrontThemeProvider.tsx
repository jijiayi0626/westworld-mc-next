"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type FrontTheme = "v1" | "v2";

const CACHE_KEY = "front_theme_cache_v1";

const Ctx = createContext<FrontTheme>("v1");

export function useFrontTheme(): FrontTheme {
  return useContext(Ctx);
}

/**
 * 前台模板 Provider。
 * 启用的模板由后台「网站设置 → 外观模板」决定（site_settings.frontend_theme），
 * 静态导出下无法按请求渲染，因此这里在客户端拉取 /api/content/theme 并同步到
 * <html data-frontend>，同时把结果缓存到 localStorage，回访用户首屏即可用上次模板，
 * 避免「先 v1 再跳 v2」的闪烁。
 */
export function FrontThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<FrontTheme>("v1");

  useEffect(() => {
    // 首屏先采用缓存值（静态导出的 HTML 默认 v1）
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached === "v2" || cached === "v1") setTheme(cached);
    } catch {
      /* 隐私模式下忽略 */
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/theme");
        const body = (await res.json()) as { code: number; data?: { theme?: string } };
        if (cancelled || body.code !== 0) return;
        const next: FrontTheme = body.data?.theme === "v2" ? "v2" : "v1";
        setTheme(next);
        try {
          localStorage.setItem(CACHE_KEY, next);
        } catch {
          /* 忽略写入失败 */
        }
      } catch {
        /* 网络异常时沿用缓存/默认模板 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 同步到 <html>，供 front-v2.css 的 [data-frontend="v2"] 作用域命中
  useEffect(() => {
    document.documentElement.setAttribute("data-frontend", theme);
  }, [theme]);

  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}
