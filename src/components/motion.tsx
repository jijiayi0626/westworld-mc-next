"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, type ReactNode } from "react";

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
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
}) {
  // 关闭时调用方通常已把数据置空；缓存最后一次内容，让退场动画仍有内容可渲染
  const cache = useRef<ReactNode>(children);
  if (children !== null && children !== undefined && children !== false) {
    cache.current = children;
  }
  const body = children ?? cache.current;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 flex items-center justify-center p-4 ${overlayClassName}`}
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
