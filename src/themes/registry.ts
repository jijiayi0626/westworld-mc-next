"use client";

import type { ComponentType, ReactNode } from "react";
import { THEMES, type GeneratedTheme } from "./generated";

export type ThemeKey = string;

export interface ThemeMeta {
  key: string;
  name: string;
  desc: string;
  version: string;
  swatch: string[];
  css: string;
}

export interface ThemeDef extends ThemeMeta {
  Layout: ComponentType<{ children: ReactNode }>;
  Home: ComponentType;
}

/**
 * 主题注册表来自 scripts/build-themes.mjs 生成的 generated.ts。
 * 每个主题都是 src/themes/<key>/ 下的独立包（Layout / Home / theme.css / theme.json），
 * THEME_SLOTS 决定构建时打包哪几套；后台「外观模板」决定运行时挂载哪一套。
 */
const LIST: ThemeDef[] = THEMES as ThemeDef[];

export const THEME_META: ThemeMeta[] = LIST.map((t) => ({
  key: t.key,
  name: t.name,
  desc: t.desc,
  version: t.version,
  swatch: t.swatch,
  css: t.css,
}));

export const ALL_THEME_KEYS: ThemeKey[] = LIST.map((t) => t.key);
export const DEFAULT_THEME: ThemeKey = ALL_THEME_KEYS[0] ?? "v1";

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && ALL_THEME_KEYS.includes(value);
}

export function normalizeTheme(value: unknown): ThemeKey {
  return isThemeKey(value) ? value : DEFAULT_THEME;
}

/** 解析环境变量 THEME_SLOTS；非法值忽略，空值回退已构建的全部主题 */
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
  return LIST.find((t) => t.key === key) ?? LIST[0];
}
