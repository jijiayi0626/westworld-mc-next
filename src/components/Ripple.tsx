"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";

/**
 * 鸿蒙风格水波涟漪包装器。
 * 用法：<Ripple><button>...</button></Ripple> 或 <Ripple className="...">任意内容</Ripple>
 * 点击时在触点生成扩散波纹（纯 CSS 动画 .ripple-ink）。
 */
export default function Ripple({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span" | "li" | "a";
}) {
  const ref = useRef<HTMLElement | null>(null);

  const onPointerDown = (e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ink = document.createElement("span");
    ink.className = "ripple-ink";
    ink.style.width = `${size}px`;
    ink.style.height = `${size}px`;
    ink.style.left = `${x}px`;
    ink.style.top = `${y}px`;
    el.appendChild(ink);
    setTimeout(() => ink.remove(), 600);
  };

  const Component = Tag as unknown as React.ElementType;

  return (
    <Component
      ref={ref as React.RefObject<HTMLElement>}
      className={`ripple-host ${className}`}
      onPointerDown={onPointerDown}
    >
      {children}
    </Component>
  );
}
