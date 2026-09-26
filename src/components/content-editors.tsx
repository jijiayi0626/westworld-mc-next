"use client";

import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Btn, Card, Field, Input, TextArea } from "@/components/ui";
import type { SiteContent } from "@/lib/content";

export type Setter = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) => void;

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {children}
    </Field>
  );
}

export function Txt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export function LongTxt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <TextArea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

// 图片 URL 输入框 + 从图库选择
export function ImgTxt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ url: string; key: string }[] | null>(null);
  const [libError, setLibError] = useState("");

  const openLib = async () => {
    setOpen(true);
    setLibError("");
    try {
      setItems(await api<{ url: string; key: string }[]>("/upload/admin/library"));
    } catch (e) {
      setLibError(e instanceof Error ? e.message : "图库加载失败");
      setItems([]);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button
          type="button"
          onClick={() => void openLib()}
          className="flex-shrink-0 px-3 py-2 rounded-[10px] bg-slate-100 border border-slate-200 text-slate-600 text-[0.82rem] font-semibold hover:bg-slate-200 cursor-pointer"
        >
          图库
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-[16px] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">从图库选择图片</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer text-xl leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {libError && <p className="text-red-500 text-[0.85rem] mb-3">{libError}</p>}
              {items === null ? (
                <p className="text-slate-400 text-sm text-center py-10">加载中...</p>
              ) : items.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-10">图库为空，请先到「图片管理」上传图片</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {items.map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => { onChange(i.url); setOpen(false); }}
                      className="rounded-[10px] overflow-hidden border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.url} alt={i.key} className="w-full h-20 object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-5">
      <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4 border-b border-slate-200 pb-3">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

export function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const update = (i: number, v: string) => onChange(items.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-slate-500 text-[0.85rem] font-medium ml-1">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={item} onChange={(e) => update(i, e.target.value)} />
          <Btn size="sm" variant="danger" onClick={() => remove(i)}>删</Btn>
        </div>
      ))}
      <div>
        <Btn size="sm" variant="ghost" onClick={add}>+ 添加</Btn>
      </div>
    </div>
  );
}

export function ObjectsEditor<T extends Record<string, unknown>>({
  label,
  fields,
  items,
  onChange,
}: {
  label: string;
  fields: { key: string; label: string; image?: boolean }[];
  items: T[];
  onChange: (v: T[]) => void;
}) {
  const update = (i: number, key: string, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? ({ ...x, [key]: v } as T) : x)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, ""])) as T]);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-slate-500 text-[0.85rem] font-medium ml-1">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="bg-slate-50 border border-slate-200 rounded-[10px] p-3 flex flex-col gap-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {fields.map((f) =>
              f.image ? (
                <ImgTxt
                  key={f.key}
                  value={(item[f.key] as string) ?? ""}
                  onChange={(v) => update(i, f.key, v)}
                  placeholder={f.label}
                />
              ) : (
                <Input
                  key={f.key}
                  placeholder={f.label}
                  value={(item[f.key] as string) ?? ""}
                  onChange={(e) => update(i, f.key, e.target.value)}
                />
              ),
            )}
          </div>
          <div className="flex justify-end">
            <Btn size="sm" variant="danger" onClick={() => remove(i)}>删除</Btn>
          </div>
        </div>
      ))}
      <div>
        <Btn size="sm" variant="ghost" onClick={add}>+ 添加{label}</Btn>
      </div>
    </div>
  );
}
