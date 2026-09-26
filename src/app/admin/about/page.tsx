"use client";

import { AdminShell } from "@/components/Shell";
import { Card } from "@/components/ui";

const PROJECT = {
  name: "westworld-mc-next",
  title: "Westworld 西域之光 · 官方网站",
  repo: "https://github.com/jijiayi0626/westworld-mc-next",
  author: "jijiayi0626",
  email: "mr_jijiayi@outlook.com",
  stack: "Next.js + Tailwind CSS · Cloudflare Workers (Hono) · D1 · R2",
  version: "v2.4.0",
  desc: "本网站为基于 Next.js 的官方宣传站点，与旧版 PHP 项目（mc-original）无任何关系。内容由后台「内容管理」「可视化编辑」动态配置，前台刷新即时生效。",
};

export default function AdminAboutPage() {
  return (
    <AdminShell>
      <div className="px-6 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-2">关于本站</h1>
        <p className="text-slate-500 text-[0.9rem] mb-6">本站是一个开源项目，以下信息为静态展示。</p>

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
      </div>
    </AdminShell>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="py-3 flex gap-4">
      <span className="text-slate-400 text-[0.8rem] w-20 flex-shrink-0 pt-0.5">{label}</span>
      {link && /^https?:\/\//.test(value) ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline break-all">{value}</a>
      ) : (
        <span className="text-slate-800 break-all">{value}</span>
      )}
    </div>
  );
}