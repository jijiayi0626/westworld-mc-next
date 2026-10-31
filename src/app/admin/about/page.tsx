"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { Card, Empty, ErrorNote } from "@/components/ui";
import { mdToHtml } from "@/lib/md";

const PROJECT = {
  name: "westworld-mc-next",
  title: "Westworld 西域之光 · 官方网站",
  repo: "https://github.com/jijiayi0626/westworld-mc-next",
  author: "jijiayi0626",
  email: "mr_jijiayi@outlook.com",
  stack: "Next.js + Tailwind CSS · Cloudflare Workers (Hono) · D1 ×2 · R2",
  version: "v0.7.1",
  desc: "本网站为全新重构项目，与旧版 PHP 项目（mc-original）无任何关系。内容由后台「内容管理」「可视化编辑」动态配置，前台刷新即时生效。",
};

type Tab = "info" | "readme" | "changelog";

export default function AdminAboutPage() {
  const [tab, setTab] = useState<Tab>("info");
  const [md, setMd] = useState<{ readme: string; changelog: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [readme, changelog] = await Promise.all([
        fetch("/docs/README.md").then((r) => (r.ok ? r.text() : Promise.reject(new Error("README 加载失败")))),
        fetch("/docs/CHANGELOG.md").then((r) => (r.ok ? r.text() : Promise.reject(new Error("更新日志加载失败")))),
      ]);
      setMd({ readme, changelog });
    } catch (e) {
      setError(e instanceof Error ? e.message : "文档加载失败");
    }
  }, []);

  useEffect(() => {
    if (tab !== "info" && !md) void load();
  }, [tab, md, load]);

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">关于本站</h1>

        {/* Tab 导航 */}
        <div className="flex gap-1 mb-5 bg-slate-100 rounded-[12px] p-1 w-fit max-w-full overflow-x-auto">
          {([
            { key: "info", label: "项目信息" },
            { key: "readme", label: "README" },
            { key: "changelog", label: "更新日志" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-[9px] text-[0.88rem] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <Card className="max-w-xl mb-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-md flex-shrink-0">
                {PROJECT.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[1.15rem] font-extrabold text-slate-900 truncate">{PROJECT.name}</div>
                <div className="text-slate-500 text-[0.9rem] truncate">{PROJECT.title}</div>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-slate-100 text-[0.95rem]">
              <InfoRow label="项目仓库" value={PROJECT.repo} link />
              <InfoRow label="开发者" value={PROJECT.author} />
              <InfoRow label="联系邮箱" value={PROJECT.email} />
              <InfoRow label="技术栈" value={PROJECT.stack} />
              <InfoRow label="版本" value={PROJECT.version} />
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 text-slate-500 text-[0.88rem] leading-relaxed">{PROJECT.desc}</div>
          </Card>
        )}

        {tab !== "info" && (
          <Card>
            <ErrorNote message={error} />
            {!md && !error ? (
              <Empty text="文档加载中..." />
            ) : (
              <div
                className="md-view text-[0.9rem] text-slate-700 leading-relaxed max-w-[860px]"
                dangerouslySetInnerHTML={{ __html: mdToHtml(tab === "readme" ? md!.readme : md!.changelog) }}
              />
            )}
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="py-3 flex items-center justify-between gap-4">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline truncate text-right">
          {value}
        </a>
      ) : (
        <span className="text-slate-800 font-medium truncate text-right">{value}</span>
      )}
    </div>
  );
}
