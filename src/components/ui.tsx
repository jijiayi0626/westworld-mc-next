"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// —— 通用小部件，统一用户中心 / 管理后台的视觉风格 ——

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-card p-5 md:p-6 ${className}`}>{children}</div>
  );
}

export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-[1.5rem] md:text-2xl font-extrabold text-white">{title}</h1>
        {desc && <p className="text-slate-400 text-[0.9rem] mt-1">{desc}</p>}
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
      "bg-gradient-to-br from-accent-emerald to-[#059669] text-white hover:shadow-[0_8px_20px_rgba(16,185,129,0.4)] hover:-translate-y-px",
    danger: "bg-gradient-to-br from-red-500 to-red-600 text-white hover:shadow-[0_8px_20px_rgba(239,68,68,0.35)]",
    ghost:
      "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/25",
    subtle: "bg-white/10 text-white hover:bg-white/20",
  };
  const sizes: Record<BtnSize, string> = {
    sm: "px-3 py-1.5 text-[0.82rem] rounded-[8px]",
    md: "px-4 py-2 text-[0.9rem] rounded-[10px]",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

const fieldCls =
  "w-full bg-black/30 border border-white/10 rounded-[10px] px-4 py-2.5 text-white text-[0.95rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]";

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
      <span className="text-slate-400 text-[0.85rem] font-medium ml-1">{label}</span>
      {children}
      {hint && <span className="text-slate-500 text-[0.78rem] ml-1">{hint}</span>}
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
    <select
      {...props}
      className={`${fieldCls} [&>option]:bg-[#1a1a2e] [&>option]:text-white ${props.className || ""}`}
    />
  );
}

export function Badge({ color = "gray", children }: { color?: "green" | "red" | "yellow" | "blue" | "gray"; children: ReactNode }) {
  const map = {
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    yellow: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    gray: "bg-white/10 text-slate-300 border-white/15",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[0.75rem] font-semibold border ${map[color]}`}>
      {children}
    </span>
  );
}

export function Spinner({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="py-14 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
      <span className="inline-block w-6 h-6 rounded-full border-2 border-white/20 border-t-accent-emerald animate-spin" />
      {text}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-4 py-3 rounded-[10px] bg-red-500/10 border border-red-500/30 text-red-300 text-[0.88rem]">
      {message}
    </div>
  );
}

export function SuccessNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="px-4 py-3 rounded-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[0.88rem]">
      {message}
    </div>
  );
}

export function Empty({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="py-14 text-center text-slate-500 text-sm">{text}</div>
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