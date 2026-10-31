"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/Shell";
import { Card, PageHeader } from "@/components/ui";

// 旧入口 /admin/settings 已拆分为独立子页，访问时自动跳到「基础配置」
export default function AdminSettingsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/settings/basic");
  }, [router]);

  return (
    <AdminShell>
      <PageHeader title="网站设置" desc="设置项已拆分为独立页面" />
      <Card>
        <p className="text-[0.9rem] text-slate-500 mb-3">正在跳转到「基础配置」…</p>
        <div className="flex flex-wrap gap-2 text-[0.88rem]">
          <Link href="/admin/settings/basic" className="text-emerald-600 hover:underline">基础配置</Link>
          <Link href="/admin/settings/appearance" className="text-emerald-600 hover:underline">外观模板</Link>
          <Link href="/admin/settings/forum" className="text-emerald-600 hover:underline">论坛与聊天</Link>
          <Link href="/admin/settings/mail" className="text-emerald-600 hover:underline">邮件服务</Link>
          <Link href="/admin/settings/payment" className="text-emerald-600 hover:underline">支付配置</Link>
          <Link href="/admin/settings/integrations" className="text-emerald-600 hover:underline">三方集成</Link>
        </div>
      </Card>
    </AdminShell>
  );
}
