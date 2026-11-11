"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Btn, ErrorNote, SuccessNote } from "@/components/ui";
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
    <div className="pb-16">
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <section>
        <h2 className="text-[1.05rem] font-bold text-slate-900">前台页面模板</h2>
        <p className="mt-2 text-[0.88rem] text-slate-500 leading-relaxed">
          选择前台展示使用的页面模板，保存后前台刷新即可切换，无需重新部署。每个模板都是独立的主题文件，
          切换时会直接替换挂载的页面组件。可用模板由环境变量
          <span className="mx-1 font-mono text-slate-600">THEME_SLOTS</span>
          控制（例如 <span className="font-mono text-slate-600">v1,v3</span>）。
        </p>

        <div className="mt-5">
          {visibleThemes.map((t) => {
            const isCurrent = currentTheme === t.key;
            return (
              <div
                key={t.key}
                className="flex items-center justify-between gap-6 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[0.98rem] font-semibold text-slate-900">{t.name}</span>
                    <span className="flex gap-1.5">
                      {t.swatch.map((c) => (
                        <span key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.85rem] text-slate-500 leading-relaxed">{t.desc}</p>
                </div>
                <div className="shrink-0">
                  {isCurrent ? (
                    <span className="text-[0.85rem] text-slate-400">当前使用</span>
                  ) : (
                    <Btn
                      size="sm"
                      variant="ghost"
                      disabled={themeBusy}
                      onClick={() => void save("frontend_theme", t.key, t.name)}
                    >
                      切换
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[1.05rem] font-bold text-slate-900">站点字体</h2>
        <p className="mt-2 text-[0.88rem] text-slate-500 leading-relaxed">
          切换全站显示字体（前台、用户中心、后台同时生效）。霞鹜文楷系列首次使用会从 CDN 加载字体文件，
          选中后会缓存到本地，下次打开不再重新下载。
        </p>

        <div className="mt-5">
          {FONT_OPTIONS.map((f) => {
            const isCurrent = currentFont === f.key;
            return (
              <div
                key={f.key}
                className="flex items-center justify-between gap-6 py-4"
              >
                <div className="min-w-0">
                  <span className="text-[0.98rem] font-semibold text-slate-900">{f.name}</span>
                  <p className="mt-1 text-[0.85rem] text-slate-500 leading-relaxed">{f.desc}</p>
                  <div
                    className="mt-2 text-[0.9rem] text-slate-700 tabular-nums"
                    style={{ fontFamily: f.family }}
                  >
                    西域之光 · 我的世界服务器 0123456789
                  </div>
                </div>
                <div className="shrink-0">
                  {isCurrent ? (
                    <span className="text-[0.85rem] text-slate-400">当前使用</span>
                  ) : (
                    <Btn
                      size="sm"
                      variant="ghost"
                      disabled={fontBusy}
                      onClick={() => void save("site_font", f.key, f.name)}
                    >
                      切换
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
