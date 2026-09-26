"use client";

import type { SiteContent } from "@/lib/content";
import {
  Row,
  Txt,
  LongTxt,
  ImgTxt,
  Section,
  ListEditor,
  ObjectsEditor,
  type Setter,
} from "@/components/content-editors";

export function SiteEditor({ content, set }: { content: SiteContent; set: Setter }) {
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

export function HeroEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const h = content.hero;
  return (
    <Section title="Hero 背景图">
      <Row label="背景图 URL" hint="支持 /static/...（R2）或外链">
        <ImgTxt value={h.bg_image} onChange={(v) => set("hero", { ...h, bg_image: v })} />
      </Row>
    </Section>
  );
}

export function SpecsEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const s = content.specs;
  const upd = (patch: Partial<SiteContent["specs"]>) => set("specs", { ...s, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={s.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={s.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={s.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="配置项">
        <ObjectsEditor
          label="配置项"
          fields={[
            { key: "icon", label: "图标 URL", image: true },
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

export function HelpEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const h = content.help;
  const upd = (patch: Partial<SiteContent["help"]>) => set("help", { ...h, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={h.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={h.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
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

export function FeaturesEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const f = content.features;
  const upd = (patch: Partial<SiteContent["features"]>) => set("features", { ...f, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={f.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={f.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={f.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="特色项">
        <ObjectsEditor
          label="特色项"
          fields={[
            { key: "icon", label: "图标 URL", image: true },
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

export function GalleryEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const g = content.gallery;
  const upd = (patch: Partial<SiteContent["gallery"]>) => set("gallery", { ...g, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={g.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={g.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={g.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
      </Section>
      <Section title="图片列表">
        <ObjectsEditor
          label="截图"
          fields={[
            { key: "src", label: "图片 URL", image: true },
            { key: "desc", label: "描述" },
          ]}
          items={g.items}
          onChange={(items) => upd({ items })}
        />
      </Section>
    </>
  );
}

export function TeamEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const t = content.team;
  const upd = (patch: Partial<SiteContent["team"]>) => set("team", { ...t, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={t.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={t.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
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
            { key: "avatar", label: "头像 URL", image: true },
            { key: "contact_href", label: "联系方式链接" },
          ]}
          items={t.members}
          onChange={(items) => upd({ members: items })}
        />
      </Section>
    </>
  );
}

export function ContactEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const c = content.contact;
  return (
    <Section title="联系我们区块">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Row label="标题"><Txt value={c.title} onChange={(v) => set("contact", { ...c, title: v })} /></Row>
        <Row label="背景图 URL"><ImgTxt value={c.bg_image} onChange={(v) => set("contact", { ...c, bg_image: v })} /></Row>
      </div>
      <Row label="副标题"><LongTxt value={c.subtitle} onChange={(v) => set("contact", { ...c, subtitle: v })} /></Row>
    </Section>
  );
}

export function CommunityEditor({ content, set }: { content: SiteContent; set: Setter }) {
  const c = content.community;
  const upd = (patch: Partial<SiteContent["community"]>) => set("community", { ...c, ...patch });
  return (
    <>
      <Section title="区块标题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Row label="标题"><Txt value={c.title} onChange={(v) => upd({ title: v })} /></Row>
          <Row label="背景图 URL"><ImgTxt value={c.bg_image} onChange={(v) => upd({ bg_image: v })} /></Row>
        </div>
        <Row label="副标题"><LongTxt value={c.subtitle} onChange={(v) => upd({ subtitle: v })} /></Row>
        <Row label="二维码图片 URL"><ImgTxt value={c.qr_image} onChange={(v) => upd({ qr_image: v })} /></Row>
      </Section>
      <Section title="社区群">
        <ObjectsEditor
          label="群组"
          fields={[
            { key: "icon", label: "图标 URL", image: true },
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
