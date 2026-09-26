"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollFadeUpProps {
  children: ReactNode;
  delay?: 0 | 100 | 200 | 300 | 400 | 500 | 600;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

export default function ScrollFadeUp({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: ScrollFadeUpProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const delayClass = delay > 0 ? `delay-${delay}` : "";
  const Component = Tag as unknown as React.ElementType;

  return (
    <Component
      ref={ref as React.RefObject<HTMLElement>}
      className={`scroll-fade-up ${revealed ? "revealed" : ""} ${delayClass} ${className}`}
    >
      {children}
   </Component>
  );
}
