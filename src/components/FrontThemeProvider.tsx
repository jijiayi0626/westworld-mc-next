"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ALL_THEME_KEYS, normalizeSlots, normalizeTheme, type ThemeKey } from "@/themes/registry";

export type FrontTheme = ThemeKey;

const CACHE_KEY = "front_theme_cache_v1";

const Ctx = createContext<FrontTheme>("v1");
const SlotsCtx = createContext<ThemeKey[]>([...ALL_THEME_KEYS]);

export function useFrontTheme(): FrontTheme {
  return useContext(Ctx);
}

/** 当前部署允许使用的主题（由环境变量 THEME_SLOTS 决定） */
export function useThemeSlots(): ThemeKey[] {
  return useContext(SlotsCtx);
}

/**
 * 前台模板 Provider。
 * 启用的模板由后台「网站设置 → 外观模板」决定（site_settings.frontend_theme），
 * 可用模板由环境变量 THEME_SLOTS 决定。静态导出下无法按请求渲染，因此这里在客户端
 * 拉取 /api/content/theme 并同步到 <html data-frontend>，同时把结果缓存到 localStorage，
 * 回访用户首屏即可用上次模板，避免「先 v1 再跳 v2」的闪烁。
 */
export function FrontThemeProvider({ children }: { children: ReactNode }) {
  // 首屏初值直接取 <html data-frontend>（由 FRONT_THEME_BOOT 在渲染前写入缓存值），
  // 避免「先 v1 再跳 v2」的闪烁。
  const [theme, setTheme] = useState<FrontTheme>(() => {
    if (typeof document === "undefined") return "v1";
    return document.documentElement.getAttribute("data-frontend") === "v2" ? "v2" : "v1";
  });
  const [slots, setSlots] = useState<ThemeKey[]>(() => normalizeSlots(process.env.NEXT_PUBLIC_THEME_SLOTS));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/theme");
        const body = (await res.json()) as { code: number; data?: { theme?: string; slots?: string[] } };
        if (cancelled || body.code !== 0) return;
        const next = normalizeTheme(body.data?.theme);
        setTheme(next);
        setSlots(normalizeSlots((body.data?.slots ?? []).join(",")));
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

  // 同步到 <html>，供前台主题样式作用域命中
  useEffect(() => {
    document.documentElement.setAttribute("data-frontend", theme);
  }, [theme]);

  return (
    <Ctx.Provider value={theme}>
      <SlotsCtx.Provider value={slots}>{children}</SlotsCtx.Provider>
    </Ctx.Provider>
  );
}
