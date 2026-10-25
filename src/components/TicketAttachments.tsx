"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

export interface TicketAttachment {
  key: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (a: TicketAttachment): boolean => a.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(a.key);

/** 附件展示：图片显示缩略图，PDF / ZIP 显示文件链接 */
export function AttachmentList({ items }: { items: TicketAttachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((a) => (
        <a
          key={a.key}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="group block border border-slate-200 rounded-[8px] overflow-hidden bg-white hover:border-emerald-300 transition-colors"
          title={a.name}
        >
          {isImage(a) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.name} loading="lazy" className="w-24 h-24 object-cover" />
          ) : (
            <span className="flex flex-col items-center justify-center w-24 h-24 px-1 text-center gap-1">
              <span className="text-[0.68rem] font-bold text-slate-500">{a.key.toLowerCase().endsWith(".zip") ? "ZIP" : "PDF"}</span>
              <span className="text-[0.66rem] text-slate-600 line-clamp-2 break-all">{a.name}</span>
              <span className="text-[0.62rem] text-slate-400">{fmtSize(a.size)}</span>
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

/** 附件上传：最多 max 个，单文件 10MB，支持图片 / PDF / ZIP */
export function AttachmentUploader({
  value,
  onChange,
  max = 5,
  disabled,
}: {
  value: TicketAttachment[];
  onChange: (next: TicketAttachment[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    const remain = max - value.length;
    if (remain <= 0) {
      setError(`最多上传 ${max} 个附件`);
      return;
    }
    const chosen = Array.from(files).slice(0, remain);
    setUploading(true);
    const uploaded: TicketAttachment[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        setProgress(`上传中 ${i + 1}/${chosen.length}...`);
        const fd = new FormData();
        fd.append("file", chosen[i]);
        const r = await api<TicketAttachment>("/upload/ticket-file", { method: "POST", body: fd });
        uploaded.push(r);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (key: string) => {
    onChange(value.filter((a) => a.key !== key));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-slate-200 bg-white text-[0.82rem] font-medium text-slate-600 hover:bg-slate-50 transition-colors ${uploading || disabled || value.length >= max ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/zip"
            className="hidden"
            disabled={uploading || disabled || value.length >= max}
            onChange={(e) => void pick(e.target.files)}
          />
          {uploading ? progress || "上传中..." : "添加附件"}
        </label>
        <span className="text-[0.72rem] text-slate-400">
          图片 / PDF / ZIP，单个 ≤ 10MB，最多 {max} 个（{value.length}/{max}）
        </span>
      </div>
      {error && <div className="text-[0.78rem] text-red-500">{error}</div>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((a) => (
            <div key={a.key} className="relative border border-slate-200 rounded-[8px] overflow-hidden bg-white">
              {isImage(a) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="w-20 h-20 object-cover" />
              ) : (
                <span className="flex flex-col items-center justify-center w-20 h-20 px-1 text-center">
                  <span className="text-[0.66rem] font-bold text-slate-500">{a.key.toLowerCase().endsWith(".zip") ? "ZIP" : "PDF"}</span>
                  <span className="text-[0.62rem] text-slate-600 line-clamp-2 break-all">{a.name}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAt(a.key)}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/55 text-white text-[0.7rem] leading-none flex items-center justify-center cursor-pointer hover:bg-black/75"
                title="移除附件"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
