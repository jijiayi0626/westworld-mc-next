"use client";

import { useState } from "react";

interface CopyIPProps {
  ip: string;
}

export default function CopyIP({ ip }: CopyIPProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = ip;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`boton-minecraft flex items-center gap-2.5 px-6 py-3 text-lg font-bold rounded-lg cursor-pointer transition-all duration-300 border-none h-14 ${
        copied
          ? "bg-slate-200 text-slate-900 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1)]"
          : "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:from-emerald-600 hover:to-green-700 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(16,185,129,0.36)] hover:border hover:border-emerald-400/30 active:scale-[0.98]"
      }`}
    >
      <svg viewBox="0 0 32 32" height="24" width="24" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 2H2v28h28z" fill={copied ? "#228b22" : "#52a535"} />
        <path
          d="M24.4 13.2h-5.6v.47h5.6zm-5.6 8.4h-5.6v.47h5.6zm2.8 2.8h-2.8v.47h2.8zm-8.4 0h-2.8v.47h2.8zm0-11.2H7.6v.47h5.6z"
          fill="#86d562"
        />
        <path d="M24.4 13.2V7.6h-5.6v5.6h-5.6V16h-2.8v8.4h2.8v-2.8h5.6v2.8h2.8V16h-2.8v-2.8zM13.2 7.6H7.6v5.6h5.6z" />
        <path
          d="M24.4 7.6h-5.6v.47h5.6zm-5.6 5.6h-5.6v.47h5.6zm-5.6-5.6H7.6v.47h5.6zm0 8.4h-2.8v.47h2.8zm8.4 0h-2.8v.47h2.8z"
          fill="#86d562"
        />
    </svg>
      <div className="relative flex justify-center items-center w-[140px] h-6 overflow-hidden">
        <span
          className={`absolute whitespace-nowrap transition-all duration-300 ${
            copied
              ? "opacity-0 -translate-y-1.5"
              : "opacity-100 translate-y-0 group-hover:opacity-0 group-hover:-translate-y-1.5"
          }`}
        >
          复制 IP 地址
      </span>
        <span
          className={`absolute whitespace-nowrap transition-all duration-300 ${
            copied ? "opacity-0 -translate-y-1.5" : "opacity-0 translate-y-1.5"
          }`}
        >
          点击复制
      </span>
        <span
          className={`absolute whitespace-nowrap transition-all duration-300 ${
            copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"
          }`}
        >
          已复制
      </span>
    </div>
  </button>
  );
}
