"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ALL_THEME_KEYS, THEME_META, normalizeSlots, normalizeTheme, type ThemeKey } from "@/themes/registry";

export type FrontTheme = ThemeKey;

const CACHE_KEY = "front_theme_cache_v1";
const LINK_PREFIX = "theme-css-";

const Ctx = createContext<FrontTheme>("v1");
const SlotsCtx = createContext<ThemeKey[]>([...ALL_THEME_KEYS]);

export function useFrontTheme(): FrontTheme {
  return useContext(Ctx);
}

/** 当前部署已构建的主题（构建时由 THEME_SLOTS 决定） */
export function useThemeSlots(): ThemeKey[] {
  return useContext(SlotsCtx);
}

/** 确保只加载当前主题自己的样式文件，其他主题 CSS 移除 */
function syncThemeCss(theme: ThemeKey) {
  const css = THEME_META.find((t) => t.key === theme)?.css || "";
  document.querySelectorAll("link[data-theme-css]").forEach((el) => {
    if (el.id !== LINK_PREFIX + theme) el.remove();
  });
  if (!css) return;
  const id = LINK_PREFIX + theme;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = css;
  link.setAttribute("data-theme-css", theme);
  document.head.appendChild(link);
}

/**
 * 前台模板 Provider。
 * 主题包位于 src/themes/<key>/，构建时由 THEME_SLOTS 决定打包哪些；
 * 运行时后台「外观模板」决定挂载哪一套 Layout / Home / theme.css。
 */
export function FrontThemeProvider({ children }: { children: ReactNode }) {
  // 首屏初值直接取 <html data-frontend>（由 FRONT_THEME_BOOT 在渲染前写入缓存值）
  const [theme, setTheme] = useState<FrontTheme>(() => {
    if (typeof document === "undefined") return "v1";
    return normalizeTheme(document.documentElement.getAttribute("data-frontend"));
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

  // 同步到 <html>，并切换该主题自己的样式文件
  useEffect(() => {
    document.documentElement.setAttribute("data-frontend", theme);
    syncThemeCss(theme);
  }, [theme]);

  return (
    <Ctx.Provider value={theme}>
      <SlotsCtx.Provider value={slots}>{children}</SlotsCtx.Provider>
    </Ctx.Provider>
  );
}
