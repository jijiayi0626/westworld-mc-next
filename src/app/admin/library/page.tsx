"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Empty, ErrorNote, SuccessNote } from "@/components/ui";
import { Modal } from "@/components/motion";

interface LibItem {
  key: string;
  url: string;
  size: number;
  uploaded: string | null;
  system?: boolean;
  in_use?: boolean;
  name?: string;
}


export default function AdminLibraryPage() {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [copied, setCopied] = useState("");
  const [tab, setTab] = useState<"mine" | "system">("mine");
  const [preview, setPreview] = useState<LibItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (which: "mine" | "system" = "mine") => {
    try {
      setItems(null);
      setItems(await api<LibItem[]>(`/upload/admin/library?tab=${which}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

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
      await load("mine");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: LibItem) => {
    if (item.system) {
      setError("系统默认图片不可删除（页面引用它，删除会导致显示异常）");
      return;
    }
    if (item.in_use && !confirm("这张图片似乎正在被页面引用，删除后可能导致显示异常。仍要删除？")) return;
    if (!confirm("确定删除这张图片？此操作不可撤销。")) return;
    setError("");
    setSuccess("");
    try {
      await api("/upload/admin/library/delete", { method: "POST", body: JSON.stringify({ key: item.key }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  // 扫描并清理未被任何页面/内容引用的孤儿图片
  const cleanupOrphans = async () => {
    setError("");
    setSuccess("");
    setCleaning(true);
    try {
      const r = await api<{ orphans: LibItem[]; total: number; scanned: number }>("/upload/admin/library/orphans");
      if (r.total === 0) {
        setSuccess(`已扫描 ${r.scanned} 张图片，没有发现未使用的图片`);
        return;
      }
      const preview = r.orphans.slice(0, 6).map((o) => `· ${o.key}`).join("\n");
      if (!confirm(`发现 ${r.total} 张未被引用的图片（共扫描 ${r.scanned} 张），清理后将永久删除：\n\n${preview}${r.total > 6 ? `\n… 其余 ${r.total - 6} 张` : ""}\n\n确认清理？`)) {
        setSuccess(`发现 ${r.total} 张未使用图片，已取消清理`);
        return;
      }
      const done = await api<{ total: number; skipped: { key: string; reason: string }[] }>("/upload/admin/library/cleanup", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSuccess(`已清理 ${done.total} 张未使用图片${done.skipped.length ? `，${done.skipped.length} 张被跳过（仍被引用或删除失败）` : ""}`);
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : "清理失败");
    } finally {
      setCleaning(false);
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

  // 重命名（image_meta 存储，不影响文件本身；回车保存，Esc 取消）
  const rename = async (item: LibItem, name: string) => {
    setError("");
    setSuccess("");
    try {
      await api("/upload/admin/library/rename", { method: "POST", body: JSON.stringify({ key: item.key, name }) });
      setSuccess(name ? `已命名为「${name}」` : "已清除名称");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重命名失败");
    }
  };

  const startRename = (item: LibItem) => {
    const input = window.prompt("设置图片名称（留空清除）", item.name || "");
    if (input === null) return;
    void rename(item, input.trim());
  };

  const filtered = (items ?? []).filter((i) => !keyword || i.key.toLowerCase().includes(keyword.toLowerCase()));

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[1.35rem] font-bold text-slate-900">图片管理</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void cleanupOrphans()}
              disabled={cleaning || uploading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-white border border-slate-200 text-slate-600 text-[0.86rem] font-semibold hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
            >
              {cleaning ? "扫描中..." : "清理未使用图片"}
            </button>
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
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.88rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors">
              {uploading ? "上传中..." : "+ 上传图片"}
            </span>
          </label>
          </div>
        </div>

        {/* 分类 Tab + 检索区 */}
        <div className="bg-white border border-slate-200 rounded-[14px] p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([
              { key: "mine", label: "我上传的图片" },
              { key: "system", label: "系统默认图片" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-[0.85rem] font-medium transition-colors cursor-pointer ${tab === t.key ? "bg-[color:var(--green,#10b981)] text-white" : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
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
              <div key={i.key} className="relative bg-white border border-slate-200 rounded-[12px] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.url}
                  alt={i.name || i.key}
                  className="w-full h-32 object-cover cursor-zoom-in"
                  loading="lazy"
                  onClick={() => setPreview(i)}
                />
                <div className="absolute top-1.5 left-1.5 flex gap-1">
                  {i.system && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-900/70 text-white text-[0.62rem] font-medium backdrop-blur-sm">系统</span>
                  )}
                  {i.in_use && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/85 text-white text-[0.62rem] font-medium">使用中</span>
                  )}
                  {!i.system && i.in_use === false && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500/85 text-white text-[0.62rem] font-medium" title="未检测到引用，可清理">未使用</span>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-[0.78rem] text-slate-800 font-medium truncate" title={i.name || i.key}>{i.name || "未命名"}</div>
                  <div className="font-mono text-[0.64rem] text-slate-400 truncate" title={i.key}>{i.key.split("/").pop()}</div>
                  <div className="flex items-center justify-between gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => copy(i.url)}
                      className="px-1.5 py-1 rounded-[6px] bg-slate-50 border border-slate-200 text-[0.7rem] text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      {copied === i.url ? "已复制" : "链接"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(i)}
                      className="px-1.5 py-1 rounded-[6px] bg-slate-50 border border-slate-200 text-[0.7rem] text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      命名
                    </button>
                    {i.system ? (
                      <span
                        className="px-1.5 py-1 rounded-[6px] bg-slate-50 border border-slate-200 text-[0.7rem] text-slate-300 select-none"
                        title="系统默认图片不可删除"
                      >
                        受保护
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="px-1.5 py-1 rounded-[6px] bg-red-50 border border-red-200 text-[0.7rem] text-red-600 hover:bg-red-100 cursor-pointer"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 大图预览 */}
        <Modal
          open={!!preview}
          onClose={() => setPreview(null)}
          overlayClassName="z-[999] bg-black/80 cursor-zoom-out"
          panelClassName="max-w-[92vw] max-h-[88vh] flex flex-col gap-3"
        >
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name || preview.key}
                className="max-w-[92vw] max-h-[76vh] object-contain rounded-[12px] shadow-2xl"
              />
              <div className="flex items-center justify-between gap-3 text-white/85 text-[0.82rem] flex-wrap">
                <span className="truncate">{preview.name || "未命名"} · {preview.key}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copy(preview.url)}
                    className="px-3 py-1.5 rounded-[8px] bg-white/15 hover:bg-white/25 cursor-pointer"
                  >
                    {copied === preview.url ? "已复制" : "复制链接"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = preview;
                      setPreview(null);
                      startRename(current);
                    }}
                    className="px-3 py-1.5 rounded-[8px] bg-white/15 hover:bg-white/25 cursor-pointer"
                  >
                    命名
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="px-3 py-1.5 rounded-[8px] bg-white/15 hover:bg-white/25 cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Modal>
      </div>
    </AdminShell>
  );
}