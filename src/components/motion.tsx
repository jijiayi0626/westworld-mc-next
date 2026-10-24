"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

export { motion };

// 统一缓动：接近 ease-out 的贝塞尔，后台场景克制、不抢交互
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 列表 / Tab 切换容器：key 变化时旧内容淡出、新内容淡入上移。
 * initial={false} 让首次挂载不播动画，避免进页面时整块闪烁。
 */
export function SwitchFade({
  switchKey,
  children,
  className = "",
}: {
  switchKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={switchKey}
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 弹窗：遮罩淡入 + 面板轻微缩放上移，关闭时反向播放。
 * overlayClassName / panelClassName 完全交给调用方，保证不影响现有样式。
 */
export function Modal({
  open,
  onClose,
  children,
  overlayClassName = "",
  panelClassName = "",
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
  /** 无障碍名称（读屏用） */
  label?: string;
}) {
  // 关闭时调用方通常已把数据置空；缓存最后一次内容，让退场动画仍有内容可渲染
  const cache = useRef<ReactNode>(children);
  if (children !== null && children !== undefined && children !== false) {
    cache.current = children;
  }
  const body = children ?? cache.current;

  // Esc 关闭 + 打开期间锁定背景滚动（onClose 用 ref 保存，避免每次渲染重装监听）
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 flex items-center justify-center p-4 ${overlayClassName}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className={panelClassName}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
