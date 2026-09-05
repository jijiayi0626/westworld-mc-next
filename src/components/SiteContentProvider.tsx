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

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContent>(defaultContent);

  useEffect(() => {
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
  }, []);

  return <Ctx.Provider value={content}>{children}</Ctx.Provider>;
}
