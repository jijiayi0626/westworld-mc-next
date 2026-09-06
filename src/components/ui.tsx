"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// —— 浅色管理面板通用小部件（对齐原版后台风格：白卡片 / 浅灰底 / 绿主色） ——

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-[14px] p-5 md:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[1.35rem] md:text-[1.5rem] font-extrabold text-slate-900">{title}</h1>
        {desc && <p className="text-slate-500 text-[0.9rem] mt-1">{desc}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "danger" | "ghost" | "subtle";

type BtnSize = "sm" | "md";

export function Btn({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  const styles: Record<BtnVariant, string> = {
    primary:
      "bg-[#10b981] text-white hover:bg-[#059669] shadow-[0_4px_6px_-1px_rgba(16,185,129,0.3)]",
    danger: "bg-[#ef4444] text-white hover:bg-[#dc2626]",
    ghost:
      "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  const sizes: Record<BtnSize, string> = {
    sm: "px-3 py-1.5 text-[0.82rem] rounded-[8px]",
    md: "px-4 py-2 text-[0.9rem] rounded-[10px]",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

const fieldCls =
  "w-full bg-white border border-slate-200 rounded-[10px] px-3.5 py-2.5 text-slate-800 text-[0.95rem] transition-all duration-300 focus:outline-none focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] placeholder:text-slate-400";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-left">
      <span className="text-slate-600 text-[0.85rem] font-medium ml-1">{label}</span>
      {children}
      {hint && <span className="text-slate-400 text-[0.78rem] ml-1">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldCls} ${props.className || ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldCls} resize-y min-h-[96px] ${props.className || ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${fieldCls} ${props.className || ""}`} />
  );
}

export function Badge({ color = "gray", children }: { color?: "green" | "red" | "yellow" | "blue" | "gray"; children: ReactNode }) {
  const map = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    yellow: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    gray: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[0.75rem] font-semibold border ${map[color]}`}>
      {children}
    </span>
  );
}

export function Spinner({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="py-14 text-center text-slate-500 text-sm flex flex-col items-center gap-3">
      <span className="inline-block w-6 h-6 rounded-full border-2 border-slate-200 border-t-[#10b981] animate-spin" />
      {text}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[0.88rem]">
      {message}
    </div>
  );
}

export function SuccessNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-4 py-3 rounded-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.88rem]">
      {message}
    </div>
  );
}

export function Empty({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="py-14 text-center text-slate-400 text-sm">{text}</div>
  );
}

/** D1 datetime('now') 为 UTC 字符串，转本地可读时间 */
export function fmtTime(v: string | null | undefined): string {
  if (!v) return "-";
  const t = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  if (Number.isNaN(t.getTime())) return v;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export function statusBadge(status: string): { color: "green" | "red" | "yellow" | "blue" | "gray"; label: string } {
  const map: Record<string, { color: "green" | "red" | "yellow" | "blue" | "gray"; label: string }> = {
    active: { color: "green", label: "正常" },
    banned: { color: "red", label: "已封禁" },
    pending: { color: "yellow", label: "待处理" },
    approved: { color: "green", label: "已通过" },
    rejected: { color: "red", label: "已拒绝" },
    open: { color: "blue", label: "待回复" },
    closed: { color: "gray", label: "已关闭" },
    published: { color: "green", label: "已发布" },
    draft: { color: "gray", label: "草稿" },
    archived: { color: "gray", label: "已归档" },
    paid: { color: "green", label: "已支付" },
    completed: { color: "blue", label: "已完成" },
    cancelled: { color: "gray", label: "已取消" },
    refunded: { color: "yellow", label: "已退款" },
    online: { color: "green", label: "在线" },
    offline: { color: "red", label: "离线" },
    new: { color: "yellow", label: "新留言" },
    replied: { color: "green", label: "已回复" },
    low: { color: "gray", label: "低" },
    normal: { color: "yellow", label: "中" },
    high: { color: "red", label: "高" },
    general: { color: "gray", label: "综合" },
    apply: { color: "blue", label: "入服" },
    bug: { color: "red", label: "Bug" },
    payment: { color: "green", label: "支付" },
    java: { color: "gray", label: "Java" },
    bedrock: { color: "blue", label: "基岩" },
  };
  return map[status] || { color: "gray", label: status };
}

export function StatusBadge({ status }: { status: string }) {
  const { color, label } = statusBadge(status);
  return <Badge color={color}>{label}</Badge>;
}