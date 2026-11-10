"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, ErrorNote, SuccessNote } from "@/components/ui";
import { THEME_META } from "@/themes/registry";
import type { Setting } from "./shared";

export default function AppearanceTab() {
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [themeBusy, setThemeBusy] = useState(false);
  const [slots, setSlots] = useState<string[]>(THEME_META.map((t) => t.key));

  const load = useCallback(async () => {
    try {
      setList(await api<Setting[]>("/admin/settings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const res = await api<{ theme: string; slots: string[] }>("/content/theme");
        if (Array.isArray(res.slots) && res.slots.length) setSlots(res.slots);
      } catch {
        /* 读取失败时默认两套都显示 */
      }
    })();
  }, [load]);

  const visibleThemes = THEME_META.filter((t) => slots.includes(t.key));

  const currentTheme = list?.find((s) => s.key === "frontend_theme")?.value || THEME_META[0]?.key || "v1";

  const saveTheme = async (next: string) => {
    if (next === currentTheme || themeBusy) return;
    setError("");
    setSuccess("");
    setThemeBusy(true);
    try {
      await api("/admin/settings", {
        method: "POST",
        body: JSON.stringify({ key: "frontend_theme", value: next }),
      });
      const name = THEME_META.find((t) => t.key === next)?.name || next;
      setSuccess(`前台模板已切换到「${name}」，前台刷新后即刻生效`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换失败");
    } finally {
      setThemeBusy(false);
    }
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">前台页面模板</h3>
        <p className="text-[0.85rem] text-slate-500 mb-5">
          选择前台展示使用的页面模板，保存后前台刷新即可切换，无需重新部署。每个模板都是独立的主题文件，
          切换时会直接替换挂载的页面组件，而不是用 CSS 隐藏另一套结构。可用模板由环境变量
          <span className="mx-1 font-mono text-slate-600">THEME_SLOTS</span>
          控制（例如 <span className="font-mono text-slate-600">v1,v2</span>）。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleThemes.map((t) => {
            const isCurrent = currentTheme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                disabled={themeBusy}
                onClick={() => saveTheme(t.key)}
                className={`text-left rounded-[14px] border-2 p-5 transition-all ${
                  isCurrent ? "border-accent-emerald bg-emerald-50/60" : "border-slate-200 hover:border-slate-300"
                } ${themeBusy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[1rem] font-bold text-slate-800">{t.name}</span>
                  {isCurrent && <Badge color="green">使用中</Badge>}
                </div>
                <p className="text-[0.85rem] text-slate-500 leading-relaxed">{t.desc}</p>
                <div className="mt-4 flex gap-2">
                  {t.swatch.map((c) => (
                    <span key={c} className="w-6 h-6 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}
