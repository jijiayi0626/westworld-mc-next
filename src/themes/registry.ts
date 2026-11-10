"use client";

import type { ComponentType } from "react";
import HomeThemeV1 from "./v1/Home";
import HomeThemeV2 from "./v2/Home";

export type ThemeKey = "v1" | "v2";

export interface ThemeDef {
  key: ThemeKey;
  name: string;
  desc: string;
  swatch: string[];
  Home: ComponentType;
}

/**
 * 主题注册表：每个主题都是一个独立的页面组件文件（src/themes/<key>/），
 * 切换主题时直接换掉挂载的组件文件，而不是靠 CSS 隐藏另一套结构。
 * 哪些主题可用由环境变量 THEME_SLOTS 控制（例如 "v1,v2"）。
 */
export const THEMES: ThemeDef[] = [
  {
    key: "v1",
    name: "模板一 · 经典",
    desc: "深色玻璃质感 + 翠绿点缀，全屏 Hero 大图与卡片式区块，信息密度高、氛围浓厚。",
    swatch: ["#0f172a", "#10b981", "#ffffff"],
    Home: HomeThemeV1,
  },
  {
    key: "v2",
    name: "模板二 · 暗夜绿光",
    desc: "极夜底色 + 网格霓虹绿光，序号化窄栏排版、数据化状态条，更克制现代的科技风。",
    swatch: ["#05080a", "#2ce88a", "#35d6d0"],
    Home: HomeThemeV2,
  },
];

export const ALL_THEME_KEYS: ThemeKey[] = THEMES.map((t) => t.key);
export const DEFAULT_THEME: ThemeKey = "v1";

export function isThemeKey(value: unknown): value is ThemeKey {
  return value === "v1" || value === "v2";
}

export function normalizeTheme(value: unknown): ThemeKey {
  return isThemeKey(value) ? value : DEFAULT_THEME;
}

/** 解析环境变量 THEME_SLOTS；非法值忽略，空值回退全部主题 */
export function normalizeSlots(raw: unknown): ThemeKey[] {
  const text = String(raw ?? "").trim();
  if (!text) return [...ALL_THEME_KEYS];
  const keys = text
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(isThemeKey);
  const unique = [...new Set(keys)];
  return unique.length ? unique : [...ALL_THEME_KEYS];
}

export function themeDef(key: string): ThemeDef {
  return THEMES.find((t) => t.key === key) ?? THEMES[0];
}
