"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Input, PageHeader, SuccessNote, TextArea } from "@/components/ui";
import { defaultContent, type SiteContent } from "@/lib/content";

// —— 通用小组件 ——

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {children}
    </Field>
  );
}

function Txt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

function LongTxt({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <TextArea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-5">
      <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4 border-b border-slate-200 pb-3">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

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

type Setter = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) => void;

function SiteEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const s = content.site;
  const upd = (patch: Partial<SiteContent["site"]>) => set("site", { ...s, ...patch });
  return (
    <>
      <Section title="基本信息">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="站点名（页脚 logo）"><Txt value={s.name} onChange={(v) => upd({ name: v })} /></Row>
          <Row label="导航品牌名"><Txt value={s.nav_brand} onChange={(v) => upd({ nav_brand: v })} /></Row>
          <Row label="服务器地址（IP:端口）"><Txt value={s.server_ip} onChange={(v) => upd({ server_ip: v })} /></Row>
          <Row label="端口"><Txt value={s.server_port} onChange={(v) => upd({ server_port: v })} /></Row>
        </div>
        <Row label="站点描述"><LongTxt value={s.description} onChange={(v) => upd({ description: v })} /></Row>
        <Row label="SEO 关键词"><LongTxt value={s.keywords} onChange={(v) => upd({ keywords: v })} /></Row>
      </Section>
      <Section title="首页 Hero 文案">
        <Row label="徽章文字"><Txt value={s.hero_badge} onChange={(v) => upd({ hero_badge: v })} /></Row>
        <Row label="主标题"><Txt value={s.hero_title} onChange={(v) => upd({ hero_title: v })} /></Row>
        <Row label="副标题"><LongTxt value={s.hero_subtitle} onChange={(v) => upd({ hero_subtitle: v })} /></Row>
        <ListEditor
          label="特性标签（每行一个）"
          items={s.hero_features}
          onChange={(items) => upd({ hero_features: items })}
        />
      </Section>
      <Section title="页脚">
        <Row label="页脚描述"><LongTxt value={s.footer_description} onChange={(v) => upd({ footer_description: v })} /></Row>
        <Row label="版权行"><Txt value={s.footer_copyright} onChange={(v) => upd({ footer_copyright: v })} /></Row>
        <Row label="免责声明（可留空）"><LongTxt value={s.footer_disclaimer} onChange={(v) => upd({ footer_disclaimer: v })} /></Row>
        <ObjectsEditor
          label="友情链接"
          fields={[{ key: "name", label: "名称" }, { key: "url", label: "URL" }]}
          items={s.friend_links}
          onChange={(items) => upd({ friend_links: items })}
        />
      </Section>
    </>
  );
}

function HeroEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const h = content.hero;
  return (
    <Section title="Hero 背景图">
      <Row label="背景图 URL" hint="支持 /static/...（R2）或外链">
        <Txt value={h.bg_image} onChange={(v) => set("hero", { ...h, bg_image: v })} />
      </Row>
    </Section>
  );
}

function SpecsEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const s = content.specs;
  const upd = (patch: Partial<SiteContent["specs"]>) => set("specs", { ...s, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={s.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={s.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={s.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="配置项">
        <ObjectsEditor
          label="配置项"
          fields={[
            { key: "icon", label: "图标 URL" },
            { key: "title", label: "名称" },
            { key: "value", label: "值" },
            { key: "desc", label: "描述" },
          ]}
          items={s.items}
          onChange={(items) => upd({ items })}
        />
      </Section>
    </>
  );
}

function HelpEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const h = content.help;
  const upd = (patch: Partial<SiteContent["help"]>) => set("help", { ...h, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={h.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={h.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={h.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="加入步骤">
        <ObjectsEditor
          label="步骤"
          fields={[
            { key: "number", label: "编号" },
            { key: "title", label: "标题" },
            { key: "desc", label: "描述" },
            { key: "cta", label: "按钮文字（可空）" },
            { key: "cta_href", label: "按钮链接（可空）" },
          ]}
          items={h.steps}
          onChange={(items) => upd({ steps: items })}
        />
      </Section>
      <Section title="启动器列表">
        <ObjectsEditor
          label="启动器"
          fields={[
            { key: "name", label: "名称" },
            { key: "tag", label: "标签（可空）" },
            { key: "desc", label: "描述" },
          ]}
          items={h.launchers}
          onChange={(items) => upd({ launchers: items })}
        />
      </Section>
    </>
  );
}

function FeaturesEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const f = content.features;
  const upd = (patch: Partial<SiteContent["features"]>) => set("features", { ...f, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={f.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={f.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={f.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="特色项">
        <ObjectsEditor
          label="特色项"
          fields={[
            { key: "icon", label: "图标 URL" },
            { key: "title", label: "名称" },
            { key: "desc", label: "描述" },
          ]}
          items={f.items}
          onChange={(items) => upd({ items })}
        />
      </Section>
    </>
  );
}

function GalleryEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const g = content.gallery;
  const upd = (patch: Partial<SiteContent["gallery"]>) => set("gallery", { ...g, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={g.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={g.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={g.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="图片列表">
        <ObjectsEditor
          label="截图"
          fields={[
            { key: "src", label: "图片 URL" },
            { key: "desc", label: "描述" },
          ]}
          items={g.items}
          onChange={(items) => upd({ items })}
        />
      </Section>
    </>
  );
}

function TeamEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const t = content.team;
  const upd = (patch: Partial<SiteContent["team"]>) => set("team", { ...t, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={t.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={t.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={t.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="团队成员">
        <ObjectsEditor
          label="成员"
          fields={[
            { key: "name", label: "名称" },
            { key: "role", label: "职位" },
            { key: "desc", label: "描述" },
            { key: "avatar", label: "头像 URL" },
            { key: "contact_href", label: "联系方式链接" },
          ]}
          items={t.members}
          onChange={(items) => upd({ members: items })}
        />
      </Section>
    </>
  );
}

function ContactEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const c = content.contact;
  return (
    <Section title="联系我们区块">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Row label="标题"><Txt value={c.title} onChange={(v) => set("contact", { ...c, title: v })} /></Row>
        <Row label="背景图 URL"><Txt value={c.bg_image} onChange={(v) => set("contact", { ...c, bg_image: v })} /></Row>
      </div>
      <Row label="副标题"><LongTxt value={c.subtitle} onChange={(v) => set("contact", { ...c, subtitle: v })} /></Row>
    </Section>
  );
}

function CommunityEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const c = content.community;
  const upd = (patch: Partial<SiteContent["community"]>) => set("community", { ...c, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={c.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><Txt value={c.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={c.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
        <Row label="二维码图片 URL"><Txt value={c.qr_image} onChange={(v) => upd({ qr_image: v })} /></Row>
      </Section>
      <Section title="社区群">
        <ObjectsEditor
          label="群组"
          fields={[
            { key: "icon", label: "图标 URL" },
            { key: "title", label: "名称" },
            { key: "desc", label: "描述" },
            { key: "btn_text", label: "按钮文字" },
            { key: "btn_class", label: "按钮样式类（qq-btn 或其他）" },
            { key: "btn_href", label: "按钮链接" },
          ]}
          items={c.groups}
          onChange={(items) => upd({ groups: items })}
        />
      </Section>
    </>
  );
}

// —— 通用列表/对象编辑器 ——

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
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

function ObjectsEditor<T extends Record<string, unknown>>({
  label,
  fields,
  items,
  onChange,
}: {
  label: string;
  fields: { key: string; label: string }[];
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
            {fields.map((f) => (
              <Input
                key={f.key}
                placeholder={f.label}
                value={(item[f.key] as string) ?? ""}
                onChange={(e) => update(i, f.key, e.target.value)}
              />
            ))}
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
