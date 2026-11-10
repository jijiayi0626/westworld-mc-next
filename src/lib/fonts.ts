/**
 * 站点字体选项。
 * system 表示不加任何覆盖，沿用各主题自己的字体栈；
 * 其余选项由 public/css/fonts.css 按 <html data-font="..."> 生效。
 */
export interface FontOption {
  key: string;
  name: string;
  desc: string;
  /** 需要额外加载的字体样式表（可选） */
  css?: string;
  /** 生效的 font-family，仅用于后台预览 */
  family: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    key: "system",
    name: "系统默认",
    desc: "跟随各主题自带的字体栈，加载最快，不额外请求字体文件。",
    family: "system-ui, sans-serif",
  },
  {
    key: "wenkai",
    name: "霞鹜文楷",
    desc: "开源楷体，字形温润、有手写感，适合正文与长文阅读。首次使用需从 CDN 加载字体。",
    css: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css",
    family: '"LXGW WenKai"',
  },
  {
    key: "wenkai-screen",
    name: "霞鹜文楷 · 屏幕阅读版",
    desc: "针对屏幕显示调整字重与字距，小字号更清晰，适合以浏览为主的页面。",
    css: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/style.css",
    family: '"LXGW WenKai Screen"',
  },
  {
    key: "kaiti",
    name: "系统楷体",
    desc: "使用设备本地楷体（Windows 楷体 / macOS 楷体-简），零网络请求，效果因系统而异。",
    family: 'KaiTi, STKaiti, "楷体", serif',
  },
];

export const DEFAULT_FONT = "system";

export function isFontKey(value: unknown): value is string {
  return typeof value === "string" && FONT_OPTIONS.some((f) => f.key === value);
}

export function normalizeFont(value: unknown): string {
  return isFontKey(value) ? value : DEFAULT_FONT;
}

export function fontDef(key: string): FontOption {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}
