"use client";

import { useEffect } from "react";

/** 给 body 设置类名（如 user-page / admin-page），供分区 CSS 命中 body 级规则 */
export function BodyClass({ cls }: { cls: string }) {
  useEffect(() => {
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [cls]);
  return null;
}