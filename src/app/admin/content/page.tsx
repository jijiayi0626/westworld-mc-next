"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, PageHeader, SuccessNote } from "@/components/ui";
import { defaultContent, type SiteContent } from "@/lib/content";
import type { Setter } from "@/components/content-editors";
import {
  SiteEditor,
  HeroEditor,
  SpecsEditor,
  HelpEditor,
  FeaturesEditor,
  GalleryEditor,
  TeamEditor,
  ContactEditor,
  CommunityEditor,
} from "@/components/content-block-editors";

// —— 编辑器状态：直接把 SiteContent 当作可变对象 ——

export default function AdminContentPage() {
  const [content, setContent] = useState<SiteContent>(defaultContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState("site");

  const load = useCallback(async () => {
    try {
      const data = await api<SiteContent | null>("/content/site");
      if (data) setContent({ ...defaultContent, ...data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api("/content/admin/site", { method: "POST", body: JSON.stringify({ content }) });
      setSuccess("已保存，刷新页面即可生效");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!confirm("确定恢复为代码内置默认内容？当前所有自定义改动将丢失。")) return;
    setContent(structuredClone(defaultContent));
    setSuccess("");
    setError("");
  };

  const tabs: { key: string; label: string }[] = [
    { key: "site", label: "站点信息" },
    { key: "hero", label: "首页 Hero" },
    { key: "specs", label: "服务器配置" },
    { key: "help", label: "下载帮助" },
    { key: "features", label: "游戏特色" },
    { key: "gallery", label: "游戏截图" },
    { key: "team", label: "管理团队" },
    { key: "contact", label: "联系我们" },
    { key: "community", label: "社区" },
  ];

  return (
    <AdminShell>
      <PageHeader
        title="内容管理"
        desc="编辑站点各区块文案与图片，保存后前台刷新即生效"
        right={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={reset}>恢复默认</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? "保存中..." : "保存全部"}</Btn>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-[0.88rem] font-semibold cursor-pointer border transition-all duration-300 ${
              tab === t.key
                ? "bg-accent-emerald text-white border-accent-emerald shadow-[0_4px_15px_rgba(16,185,129,0.35)]"
                : "bg-slate-50 text-slate-800/70 border-slate-200 hover:bg-white/15 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />
      {success && <div className="mb-4"><SuccessNote message={success} /></div>}

      {loading ? (
        <Card><p className="text-slate-500 text-sm">加载中...</p></Card>
      ) : (
        <div className="flex flex-col gap-0">
          {tab === "site" && <SiteEditor content={content} set={set} />}
          {tab === "hero" && <HeroEditor content={content} set={set} />}
          {tab === "specs" && <SpecsEditor content={content} set={set} />}
          {tab === "help" && <HelpEditor content={content} set={set} />}
          {tab === "features" && <FeaturesEditor content={content} set={set} />}
          {tab === "gallery" && <GalleryEditor content={content} set={set} />}
          {tab === "team" && <TeamEditor content={content} set={set} />}
          {tab === "contact" && <ContactEditor content={content} set={set} />}
          {tab === "community" && <CommunityEditor content={content} set={set} />}
        </div>
      )}
    </AdminShell>
  );
}
