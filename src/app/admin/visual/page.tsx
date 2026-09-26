"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, ErrorNote, PageHeader, SuccessNote } from "@/components/ui";
import { defaultContent, type SiteContent } from "@/lib/content";
import { SiteContentProvider } from "@/components/SiteContentProvider";
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
import type { Setter } from "@/components/content-editors";

import Hero from "@/components/Hero";
import SpecsSection from "@/components/SpecsSection";
import HelpSteps from "@/components/HelpSteps";
import FeaturesSection from "@/components/FeaturesSection";
import GalleryCarousel from "@/components/GalleryCarousel";
import TeamCarousel from "@/components/TeamCarousel";
import ContactForm from "@/components/ContactForm";
import CommunitySection from "@/components/CommunitySection";

const blocks: { key: string; label: string }[] = [
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

export default function AdminVisualPage() {
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

  const set: Setter = (key, value) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api("/content/admin/site", { method: "POST", body: JSON.stringify({ content }) });
      setSuccess("已保存，前台刷新即生效");
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

  return (
    <AdminShell>
      <PageHeader
        title="可视化编辑"
        desc="左侧选择区块，中间实时预览，右侧编辑字段；保存后前台刷新即生效"
        right={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={reset}>恢复默认</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? "保存中..." : "保存全部"}</Btn>
          </div>
        }
      />

      <ErrorNote message={error} />
      {success && <div className="mb-4"><SuccessNote message={success} /></div>}

      {loading ? (
        <div className="rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm bg-white">
          加载内容中...
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-190px)]">
          {/* 左：区块列表 */}
          <aside className="lg:w-44 flex-shrink-0">
            <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {blocks.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setTab(b.key)}
                  className={`flex-shrink-0 px-3.5 py-2.5 rounded-[10px] text-left text-[0.85rem] font-semibold cursor-pointer border transition-all duration-200 whitespace-nowrap lg:whitespace-normal ${
                    tab === b.key
                      ? "bg-accent-emerald text-white border-accent-emerald shadow-[0_4px_12px_rgba(16,185,129,0.35)]"
                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </aside>

          {/* 中：实时预览 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 rounded-t-[14px] bg-[#0b1220] border border-b-0 border-white/10 text-[0.8rem] text-slate-400">
              <span>实时预览（仅示意，完整页面请访问前台）</span>
              <span className="text-emerald-400">● 已同步编辑内容</span>
            </div>
            <div className="visual-preview flex-1 min-h-[420px] lg:min-h-0 bg-[#0f172a] rounded-b-[14px] border border-white/10 overflow-y-auto">
              <SiteContentProvider value={content}>
                <Hero />
                <SpecsSection />
                <HelpSteps />
                <FeaturesSection />
                <GalleryCarousel />
                <TeamCarousel />
                <ContactForm />
                <CommunitySection />
              </SiteContentProvider>
            </div>
          </div>

          {/* 右：字段表单 */}
          <aside className="lg:w-[360px] flex-shrink-0 lg:overflow-y-auto lg:max-h-[calc(100vh-190px)]">
            <div className="rounded-[14px] bg-white border border-slate-200 p-4">
              <h3 className="text-[0.95rem] font-bold text-slate-800 mb-3 flex items-center gap-2">
                编辑「{blocks.find((b) => b.key === tab)?.label}」
              </h3>
              {tab === "site" && <SiteEditor content={content} set={set} />}
              {tab === "hero" && <HeroEditor content={content} set={set} />}
              {tab === "specs" && <SpecsEditor content={content} set={set} />}
              {tab === "help" && <HelpEditor content={content} set={set} />}
              {tab === "features" && <FeaturesEditor content={content} set={set} />}
              {tab === "gallery" && <GalleryEditor content={content} set={set} />}
              {tab === "team" && <TeamEditor content={content} set={set} />}
              {tab === "contact" && <ContactEditor content={content} set={set} />}
              {tab === "community" && <CommunityEditor content={content} set={set} />}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Btn onClick={save} disabled={saving} className="w-full">
                  {saving ? "保存中..." : "保存全部修改"}
                </Btn>
              </div>
            </div>
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
