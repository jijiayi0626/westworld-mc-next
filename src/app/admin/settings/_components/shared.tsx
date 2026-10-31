"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/Shell";
import { PageHeader } from "@/components/ui";

export interface Setting {
  key: string;
  value: string;
}

export interface Integrations {
  microsoft: {
    enabled: boolean;
    client_id: string;
    client_secret_set: boolean;
    callback_url: string;
  };
  upop: {
    enabled: boolean;
    client_id: string;
    client_secret_set: boolean;
    authorize_url: string;
    token_url: string;
    userinfo_url: string;
    scope: string;
    callback_url: string;
  };
  inu: {
    enabled: boolean;
    client_id: string;
    client_secret_set: boolean;
    redirect_uri: string;
    scopes: string;
    origin: string;
    bound_users: number;
  };
}

export interface MailConfigView {
  provider: string;
  from: string;
  resend_key_set: boolean;
  resend_key_count: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass_set: boolean;
  smtp_ssl: boolean;
  events?: Record<string, boolean>;
  notify_emails?: string;
}

export interface PayConfigView {
  enabled: boolean;
  api_url: string;
  pid: string;
  key_set: boolean;
  types: string[];
  sitename: string;
  configured: boolean;
  types_available: { key: string; label: string }[];
  notify_url: string;
  return_url: string;
}

export const UPOP_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "upop_enabled", label: "启用 UPOP 绑定", hint: "true / false" },
  { key: "upop_client_id", label: "Client ID" },
  { key: "upop_client_secret", label: "Client Secret" },
  { key: "upop_authorize_url", label: "授权端点", hint: "https://.../oauth2/authorize" },
  { key: "upop_token_url", label: "令牌端点", hint: "https://.../oauth2/token" },
  { key: "upop_userinfo_url", label: "用户信息端点", hint: "https://.../oauth2/userinfo" },
  { key: "upop_scope", label: "授权 Scope", hint: "默认 openid profile" },
  { key: "upop_user_id_field", label: "用户 ID 字段", hint: "userinfo 中的唯一 ID 字段，默认 id" },
  { key: "upop_username_field", label: "用户名字段", hint: "默认 username" },
];

// 前台可选模板（取值写入 site_settings.frontend_theme）
export const FRONT_THEMES: { key: "v1" | "v2"; name: string; desc: string; swatch: string[] }[] = [
  {
    key: "v1",
    name: "模板一 · 经典",
    desc: "深色玻璃质感 + 翠绿点缀，全屏 Hero 大图与卡片式区块，信息密度高、氛围浓厚。",
    swatch: ["#0f172a", "#10b981", "#ffffff"],
  },
  {
    key: "v2",
    name: "模板二 · 暗夜绿光",
    desc: "极夜底色 + 网格霓虹绿光，序号化窄栏排版、数据化状态条，更克制现代的科技风。",
    swatch: ["#05080a", "#2ce88a", "#35d6d0"],
  },
];

export const SETTINGS_TABS: { key: string; href: string; label: string }[] = [
  { key: "basic", href: "/admin/settings/basic", label: "基础配置" },
  { key: "appearance", href: "/admin/settings/appearance", label: "外观模板" },
  { key: "forum", href: "/admin/settings/forum", label: "论坛与聊天" },
  { key: "mail", href: "/admin/settings/mail", label: "邮件服务" },
  { key: "payment", href: "/admin/settings/payment", label: "支付配置" },
  { key: "integrations", href: "/admin/settings/integrations", label: "三方集成" },
];

export function StatusDot({ ok: good, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.85rem]">
      <span className={`w-2 h-2 rounded-full ${good ? "bg-emerald-500" : "bg-slate-300"}`} />
      <span className={good ? "text-slate-800" : "text-slate-400"}>{label}</span>
    </span>
  );
}

/** 各设置子页共用的外壳：标题 + 子页导航 */
export function SettingsPage({
  title,
  desc,
  active,
  children,
}: {
  title: string;
  desc: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <AdminShell>
      <PageHeader title={title} desc={desc} />
      <div className="flex flex-wrap gap-2 mb-5 p-1 bg-slate-50 rounded-[10px] w-fit">
        {SETTINGS_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`px-5 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all ${
              active === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </AdminShell>
  );
}
