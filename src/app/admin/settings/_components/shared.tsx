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

// 前台可选模板由 src/themes/*/theme.json 决定，构建时由 THEME_SLOTS 过滤，
// 后台外观页直接读取 @/themes/registry 的 THEME_META。

export const SETTINGS_TABS: { key: string; href: string; label: string }[] = [
  { key: "basic", href: "/admin/settings/basic", label: "基础配置" },
  { key: "appearance", href: "/admin/settings/appearance", label: "外观模板" },
  { key: "forum", href: "/admin/settings/forum", label: "社区与聊天" },
  { key: "mail", href: "/admin/settings/mail", label: "邮件服务" },
  { key: "payment", href: "/admin/settings/payment", label: "支付配置" },
  { key: "integrations", href: "/admin/settings/integrations", label: "三方集成" },
];

export function StatusDot({ ok: good, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.85rem]">
      <span className={`w-2 h-2 rounded-full ${good ? "bg-emerald-500" : "bg-slate-300"}`} />
      <span className={good ? "text-emerald-600" : "text-slate-400"}>{label}</span>
    </span>
  );
}

/** 设置页分组堆叠容器 */
export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="settings-stack">{children}</div>;
}

/** 分组：标题在上，内容逐行展开，不使用外层卡片 */
export function SettingsGroup({
  title,
  desc,
  aside,
  actions,
  children,
}: {
  title: string;
  desc?: string;
  aside?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <div className="settings-group__head">
        <div className="min-w-0">
          <h2 className="settings-group__title">{title}</h2>
          {desc && <p className="settings-group__desc">{desc}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="settings-group__body">{children}</div>
      {actions && <div className="settings-group__actions">{actions}</div>}
    </section>
  );
}

/** 单项设置：名称在左、控件在右、一项一行 */
export function SettingRow({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__name">{label}</div>
        {hint && <div className="settings-row__hint">{hint}</div>}
      </div>
      <div className={`settings-row__control${wide ? " settings-row__control--wide" : ""}`}>{children}</div>
    </div>
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
      <div className="flex flex-wrap gap-1 mb-8 w-fit">
        {SETTINGS_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`px-4 py-2 rounded-[12px] text-[0.88rem] font-semibold transition-colors duration-150 ${
              active === t.key ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm" : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
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
