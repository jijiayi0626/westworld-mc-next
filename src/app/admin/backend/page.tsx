"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Select, SuccessNote } from "@/components/ui";

interface AdminStyle {
  sidebarCollapsed?: boolean;
  theme?: "light" | "dark" | "system";
  accent?: string;
}

const ACCENTS = [
  { name: "翡翠绿", value: "#10b981" },
  { name: "宝石蓝", value: "#3b82f6" },
  { name: "紫罗兰", value: "#8b5cf6" },
  { name: "琥珀金", value: "#f59e0b" },
  { name: "玫红", value: "#ec4899" },
  { name: "绯红", value: "#ef4444" },
];

const DEFAULT_STYLE: AdminStyle = { sidebarCollapsed: false, theme: "light", accent: "#10b981" };

export default function AdminBackendStylePage() {
  const [style, setStyle] = useState<AdminStyle | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 读取现有后台样式设置（site_settings.admin_style）
  useEffect(() => {
    (async () => {
      try {
        const list = await api<{ key: string; value: string }[]>("/admin/settings");
        const row = list.find((s) => s.key === "admin_style");
        if (row?.value) {
          setStyle({ ...DEFAULT_STYLE, ...JSON.parse(row.value) });
        } else {
          setStyle({ ...DEFAULT_STYLE });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
        setStyle({ ...DEFAULT_STYLE });
      }
    })();
  }, []);

  const save = async () => {
    if (!style) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/settings", {
        method: "POST",
        body: JSON.stringify({ key: "admin_style", value: JSON.stringify(style) }),
      });
      setSuccess("后台样式设置已保存，刷新即生效。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  if (!style) {
    return (
      <AdminShell>
        <div className="px-6 py-6">
          <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">后台样式</h1>
          <Card>加载中...</Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-2">后台样式</h1>
        <p className="text-slate-500 text-[0.9rem] mb-6">自定义后台与用户中心的界面外观（主题、主色、侧栏折叠）。</p>

        <Card className="mb-5">
          <div className="flex flex-col gap-5">
            <Field label="主题模式" hint="跟随系统：随设备亮暗自动切换。">
              <Select
                value={style.theme}
                onChange={(e) => setStyle({ ...style, theme: e.target.value as AdminStyle["theme"] })}
              >
                <option value="light">亮色</option>
                <option value="dark">暗色</option>
                <option value="system">跟随系统</option>
              </Select>
            </Field>

            <Field label="主色 / 强调色" hint="影响按钮、激活态、链接等主题色。">
              <div className="flex flex-wrap gap-3">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => setStyle({ ...style, accent: a.value })}
                    className={`h-10 px-4 rounded-[10px] text-white text-[0.85rem] font-semibold transition-all ${
                      style.accent === a.value ? "ring-2 ring-offset-2 ring-slate-400 scale-[1.04]" : "opacity-90 hover:opacity-100"
                    }`}
                    style={{ background: a.value }}
                  >
                    {a.name}
                  </button>
                ))}
                <label className="flex items-center gap-2 px-2 rounded-[10px] border border-slate-200 bg-white cursor-pointer">
                  <span className="text-slate-500 text-[0.85rem]">自定义</span>
                  <input
                    type="color"
                    value={style.accent}
                    onChange={(e) => setStyle({ ...style, accent: e.target.value })}
                    className="w-9 h-9 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              </div>
            </Field>

            <Field label="侧栏默认折叠" hint="桌面端打开后台时，侧栏默认收起为图标条还是展开全宽。">
              <Select
                value={style.sidebarCollapsed ? "1" : "0"}
                onChange={(e) => setStyle({ ...style, sidebarCollapsed: e.target.value === "1" })}
              >
                <option value="0">展开（显示完整文字）</option>
                <option value="1">折叠（仅显示图标）</option>
              </Select>
            </Field>
          </div>

          <ErrorNote message={error} />
          <SuccessNote message={success} />

          <div className="mt-6 flex gap-2">
            <Btn onClick={save} disabled={busy}>{busy ? "保存中..." : "保存设置"}</Btn>
            <Btn variant="ghost" onClick={() => setStyle({ ...DEFAULT_STYLE })}>恢复默认</Btn>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}