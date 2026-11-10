"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Card, ErrorNote, SuccessNote } from "@/components/ui";
import { THEME_META } from "@/themes/registry";
import { FONT_OPTIONS } from "@/lib/fonts";
import type { Setting } from "./shared";

export default function AppearanceTab() {
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [themeBusy, setThemeBusy] = useState(false);
  const [fontBusy, setFontBusy] = useState(false);
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
        /* 读取失败时显示全部已构建模板 */
      }
    })();
  }, [load]);

  const visibleThemes = THEME_META.filter((t) => slots.includes(t.key));

  const currentTheme = list?.find((s) => s.key === "frontend_theme")?.value || THEME_META[0]?.key || "v1";
  const currentFont = list?.find((s) => s.key === "site_font")?.value || "system";

  const save = async (
    key: "frontend_theme" | "site_font",
    value: string,
    label: string,
  ): Promise<void> => {
    setError("");
    setSuccess("");
    if (key === "frontend_theme") setThemeBusy(true);
    else setFontBusy(true);
    try {
      await api("/admin/settings", {
        method: "POST",
        body: JSON.stringify({ key, value }),
      });
      setSuccess(`已切换到「${label}」，前台刷新后即刻生效`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      if (key === "frontend_theme") setThemeBusy(false);
      else setFontBusy(false);
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
          控制（例如 <span className="font-mono text-slate-600">v1,v3</span>）。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleThemes.map((t) => {
            const isCurrent = currentTheme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                disabled={themeBusy}
                onClick={() => {
                  if (isCurrent) return;
                  void save("frontend_theme", t.key, t.name);
                }}
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

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">站点字体</h3>
        <p className="text-[0.85rem] text-slate-500 mb-5">
          切换全站显示字体（前台、用户中心、后台同时生效）。霞鹜文楷系列首次使用会从 CDN 加载字体文件，
          选中后会缓存到本地，下次打开不再重新下载。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FONT_OPTIONS.map((f) => {
            const isCurrent = currentFont === f.key;
            return (
              <button
                key={f.key}
                type="button"
                disabled={fontBusy}
                onClick={() => {
                  if (isCurrent) return;
                  void save("site_font", f.key, f.name);
                }}
                className={`text-left rounded-[14px] border-2 p-5 transition-all ${
                  isCurrent ? "border-accent-emerald bg-emerald-50/60" : "border-slate-200 hover:border-slate-300"
                } ${fontBusy ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[1rem] font-bold text-slate-800">{f.name}</span>
                  {isCurrent && <Badge color="green">使用中</Badge>}
                </div>
                <p className="text-[0.85rem] text-slate-500 leading-relaxed">{f.desc}</p>
                <div
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"
                  style={{ fontFamily: f.family }}
                >
                  西域之光 · 我的世界服务器
                  <br />
                  <span className="text-[0.8rem] text-slate-400">ABCDE abcde 0123456789</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </>
  );
}
