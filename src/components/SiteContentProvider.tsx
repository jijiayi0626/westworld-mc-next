"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultContent, type SiteContent } from "@/lib/content";

const Ctx = createContext<SiteContent>(defaultContent);

export function useSiteContent(): SiteContent {
  return useContext(Ctx);
}

// 深合并：以 base 为主，overlay 中存在的键覆盖（数组整体替换）
function deepMerge<T>(base: T, overlay: unknown): T {
  if (overlay === null || overlay === undefined) return base;
  if (Array.isArray(base) || Array.isArray(overlay)) {
    return (Array.isArray(overlay) ? overlay : base) as T;
  }
  if (typeof base === "object" && typeof overlay === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(overlay as Record<string, unknown>)) {
      const v = (overlay as Record<string, unknown>)[k];
      if (v === null || v === undefined) continue;
      out[k] = deepMerge(out[k], v);
    }
    return out as T;
  }
  return (typeof overlay === typeof base ? overlay : base) as T;
}

/**
 * 站点内容 Provider。
 * - 默认模式：启动后从 /api/content/site 拉取覆盖值并深合并默认值。
 * - 受控模式：传入 value 时直接使用该值（可视化编辑器实时预览用），不发起请求。
 */
export function SiteContentProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: SiteContent;
}) {
  const [content, setContent] = useState<SiteContent>(defaultContent);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/site");
        const body = (await res.json()) as { code: number; data: unknown };
        if (!cancelled && body.code === 0 && body.data) {
          setContent(deepMerge(defaultContent, body.data));
        }
      } catch {
        // 网络异常时保持默认值
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  return <Ctx.Provider value={value ?? content}>{children}</Ctx.Provider>;
}
