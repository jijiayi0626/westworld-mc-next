"use client";

import { useState } from "react";
import Link from "next/link";
import { UserShell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { Badge, Btn, Card, ErrorNote, Field, Input, PageHeader, SuccessNote, TextArea, fmtTime, StatusBadge } from "@/components/ui";

export default function UserHomePage() {
  const { user, refresh } = useAuth();
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return <UserShell><></></UserShell>;

  const uploadAvatar = async (file: File) => {
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await api<{ url: string }>("/upload/avatar", { method: "POST", body: fd });
      setAvatar(data.url);
      setSuccess("头像已上传，点击「保存资料」生效");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api("/user/profile", { method: "POST", body: JSON.stringify({ bio, avatar }) });
      setSuccess("资料已保存");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const quickLinks = [
    { href: "/user/application", label: "入服申请", desc: "申请白名单", color: "#ecfdf5", text: "#047857" },
    { href: "/user/tickets", label: "我的工单", desc: "提交与跟进问题", color: "#eff6ff", text: "#1d4ed8" },
    { href: "/user/ai", label: "AI 助手", desc: "咨询服务器问题", color: "#f5f3ff", text: "#6d28d9" },
    { href: "/user/orders", label: "我的订单", desc: "查看商城订单", color: "#fef9c3", text: "#a16207" },
  ];

  return (
    <UserShell>
      <PageHeader title="个人中心" desc={`欢迎回来，${user.username}`} right={<StatusBadge status={user.status} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 左侧：账号信息 */}
        <Card className="lg:col-span-1 h-fit">
          <div className="flex flex-col items-center text-center gap-3 pb-5 border-b border-slate-200">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="头像" className="w-20 h-20 rounded-full object-cover border-2 border-accent-emerald/40" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-3xl font-extrabold text-white">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-lg font-bold text-slate-800">{user.username}</div>
              <div className="text-[0.8rem] text-slate-500 mt-0.5">{user.email}</div>
            </div>
            {user.role === "admin" && <Badge color="yellow">管理员</Badge>}
          </div>

          <ul className="mt-5 flex flex-col gap-3 text-[0.85rem]">
            <Row label="注册时间" value={fmtTime(user.created_at)} />
            <Row label="最近登录" value={fmtTime(user.last_login_at)} />
            <Row label="登录 IP" value={user.last_login_ip || "-"} />
            <Row label="绑定游戏名" value={user.mc_username || "未绑定"} />
            {user.mc_uuid && <Row label="绑定 UUID" value={user.mc_uuid} mono />}
          </ul>

          <Link href="/user/security" className="block mt-5 text-center">
            <Btn variant="ghost" className="w-full">安全设置（改密 / 绑定微软）</Btn>
          </Link>
        </Card>

        {/* 右侧：快捷入口 + 资料编辑 */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            {quickLinks.map((q) => (
              <Link key={q.href} href={q.href}>
                <div className="rounded-[14px] border border-slate-100 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-md hover:-translate-y-0.5" style={{ background: q.color }}>
                  <div className="text-[1rem] font-bold" style={{ color: q.text }}>{q.label}</div>
                  <div className="text-[0.82rem] mt-1" style={{ color: q.text, opacity: 0.75 }}>{q.desc}</div>
                </div>
              </Link>
            ))}
          </div>

          <Card>
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">编辑资料</h3>
            <div className="flex flex-col gap-4">
              <Field label="头像" hint="支持 PNG/JPG/WEBP，小于 2MB；上传后自动填入 URL">
                <div className="flex items-center gap-3">
                  <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://... 或点击右侧上传" />
                  <label className="flex-shrink-0 cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAvatar(f);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.85rem] font-semibold hover:bg-[#059669] transition-colors">
                      {uploading ? "上传中..." : "上传头像"}
                    </span>
                  </label>
                </div>
              </Field>
              <Field label="个性签名">
                <TextArea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="介绍一下自己吧~（200 字内）" maxLength={200} />
              </Field>
              <ErrorNote message={error} />
              <SuccessNote message={success} />
              <div>
                <Btn onClick={saveProfile} disabled={saving}>{saving ? "保存中..." : "保存资料"}</Btn>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </UserShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-slate-600 text-right break-all ${mono ? "font-mono text-[0.78rem]" : ""}`}>{value}</span>
    </li>
  );
}