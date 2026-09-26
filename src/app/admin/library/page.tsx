"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Empty, ErrorNote, SuccessNote } from "@/components/ui";

interface LibItem {
  key: string;
  url: string;
  size: number;
  uploaded: string | null;
}


export default function AdminLibraryPage() {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<LibItem[]>("/upload/admin/library"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api<{ url: string }>("/upload/image", { method: "POST", body: fd });
      setSuccess("图片已上传");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (key: string) => {
    if (!confirm("确定删除这张图片？此操作不可撤销。")) return;
    setError("");
    setSuccess("");
    try {
      await api("/upload/admin/library/delete", { method: "POST", body: JSON.stringify({ key }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
    setCopied(url);
    setTimeout(() => setCopied(""), 1500);
  };

  const filtered = (items ?? []).filter((i) => !keyword || i.key.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[1.35rem] font-bold text-slate-900">图片管理</h1>
          <label className="cursor-pointer">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.88rem] font-semibold hover:bg-[#059669] transition-colors">
              {uploading ? "上传中..." : "+ 上传图片"}
            </span>
          </label>
        </div>

        {/* 检索区 */}
        <div className="bg-white border border-slate-200 rounded-[14px] p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索文件名..."
            className="w-full sm:w-[300px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.9rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
          />
        </div>

        <ErrorNote message={error} />
        {success && <div className="mb-4"><SuccessNote message={success} /></div>}

        {items === null ? (
          <div className="bg-white border border-slate-200 rounded-[14px]"><Empty text="加载中..." /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-[14px]"><Empty text="暂无图片，点击右上角上传" /></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((i) => (
              <div key={i.key} className="bg-white border border-slate-200 rounded-[12px] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.url} alt={i.key} className="w-full h-32 object-cover" loading="lazy" />
                <div className="p-2.5">
                  <div className="font-mono text-[0.68rem] text-slate-500 truncate" title={i.key}>{i.key.split("/").pop()}</div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => copy(i.url)}
                      className="px-2 py-1 rounded-[6px] bg-slate-50 border border-slate-200 text-[0.72rem] text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      {copied === i.url ? "已复制" : "复制链接"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i.key)}
                      className="px-2 py-1 rounded-[6px] bg-red-50 border border-red-200 text-[0.72rem] text-red-600 hover:bg-red-100 cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}