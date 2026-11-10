"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ALL_THEME_KEYS, isThemeKey, normalizeSlots, normalizeTheme, type ThemeKey } from "@/themes/registry";
import { DEFAULT_FONT, fontDef, normalizeFont } from "@/lib/fonts";

export type FrontTheme = ThemeKey;

const CACHE_KEY = "front_theme_cache_v1";
const FONT_CACHE_KEY = "front_font_cache_v1";

const Ctx = createContext<FrontTheme>("v1");
const SlotsCtx = createContext<ThemeKey[]>([...ALL_THEME_KEYS]);

export function useFrontTheme(): FrontTheme {
  return useContext(Ctx);
}

/** 当前部署允许使用的主题（由环境变量 THEME_SLOTS 决定） */
export function useThemeSlots(): ThemeKey[] {
  return useContext(SlotsCtx);
}

/** 按字体选项插入对应的字体样式表（同一时间只保留一份） */
function applyFont(key: string): void {
  const def = fontDef(key);
  document.documentElement.setAttribute("data-font", key);
  const existing = document.getElementById("site-font-css") as HTMLLinkElement | null;
  if (!def.css) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.fontKey === key) return;
  existing?.remove();
  const link = document.createElement("link");
  link.id = "site-font-css";
  link.rel = "stylesheet";
  link.href = def.css;
  link.dataset.fontKey = key;
  document.head.appendChild(link);
}

function bootFont(): string {
  if (typeof document === "undefined") return DEFAULT_FONT;
  return normalizeFont(document.documentElement.getAttribute("data-font"));
}

/**
 * 前台模板 Provider。
 * 模板与字体都由后台「网站设置 → 外观模板」决定，可用模板由环境变量 THEME_SLOTS 决定。
 * 静态导出下无法按请求渲染，因此客户端拉取 /api/content/theme 并写入 <html>，
 * 结果缓存到 localStorage，回访用户首屏即可用上次模板与字体，避免闪烁。
 */
export function FrontThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<FrontTheme>(() => {
    if (typeof document === "undefined") return "v1";
    const boot = document.documentElement.getAttribute("data-frontend");
    return isThemeKey(boot) ? boot : "v1";
  });
  const [slots, setSlots] = useState<ThemeKey[]>(() => normalizeSlots(process.env.NEXT_PUBLIC_THEME_SLOTS));
  const [font, setFont] = useState<string>(() => bootFont());

  // 首帧就把缓存的字体套上（启动脚本已写入 data-font，这里补挂字体样式表）
  useEffect(() => {
    applyFont(font);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/theme");
        const body = (await res.json()) as {
          code: number;
          data?: { theme?: string; slots?: string[]; font?: string };
        };
        if (cancelled || body.code !== 0) return;
        const next = normalizeTheme(body.data?.theme);
        const nextFont = normalizeFont(body.data?.font);
        setTheme(next);
        setFont(nextFont);
        applyFont(nextFont);
        setSlots(normalizeSlots((body.data?.slots ?? []).join(",")));
        try {
          localStorage.setItem(CACHE_KEY, next);
          localStorage.setItem(
            FONT_CACHE_KEY,
            JSON.stringify({ key: nextFont, css: fontDef(nextFont).css || "" }),
          );
        } catch {
          /* 忽略写入失败 */
        }
      } catch {
        /* 网络异常时沿用缓存/默认值 */
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
