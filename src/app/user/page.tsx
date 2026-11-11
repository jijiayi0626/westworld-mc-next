"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserShell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import ServerStatus from "@/components/ServerStatus";
import { api } from "@/lib/api";
import { Badge, Btn, Card, ErrorNote, Field, Input, PageHeader, SuccessNote, TextArea, fmtTime, StatusBadge } from "@/components/ui";

export default function UserHomePage() {
  const { user, refresh } = useAuth();
  const [bio, setBio] = useState(user?.bio || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [mcName, setMcName] = useState("");
  const [qqId, setQqId] = useState("");
  const [discord, setDiscord] = useState("");
  const [appStatus, setAppStatus] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  // 首次拿到异步加载的 user 后同步一次，避免硬刷新后表单为空、保存时把资料覆盖掉
  const loadedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    setBio(user.bio || "");
    setAvatar(user.avatar || "");
    setMcName(user.mc_username || "");
    setQqId(user.qq || "");
    setDiscord(user.discord || "");
    // 入服申请状态用于新人任务：失败不影响页面
    api<{ status: string }[]>("/application/mine")
      .then((rows) => setAppStatus(rows[0]?.status || ""))
      .catch(() => setAppStatus(""));
  }, [user]);

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
      await api("/user/profile", { method: "POST", body: JSON.stringify({ bio, avatar, qq: qqId, discord, mc_username: mcName }) });
      setSuccess("资料已保存");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const quickLinks = [
    { href: "/user/application", label: "入服申请", desc: "申请白名单" },
    { href: "/user/tickets", label: "我的工单", desc: "提交与跟进问题" },
    { href: "/user/ai", label: "AI 助手", desc: "咨询服务器问题" },
    { href: "/user/orders", label: "我的订单", desc: "查看商城订单" },
    { href: "/user/points", label: "积分中心", desc: `${user.points ?? 0} 积分` },
  ];

  // 新人任务：与 PHP 版一致的 6 项引导，全部由真实资料计算，不做假进度
  const tasks = [
    { label: "上传头像", done: !!user.avatar },
    { label: "填写个性签名", done: !!user.bio },
    { label: "绑定游戏名", done: !!user.mc_username },
    { label: "绑定 QQ", done: !!user.qq },
    { label: "绑定 Discord", done: !!user.discord },
    { label: "通过入服申请", done: appStatus === "approved" },
  ];
  const doneCount = tasks.filter((t) => t.done).length;
  const percent = Math.round((doneCount / tasks.length) * 100);

  return (
    <UserShell>
      <PageHeader title="个人中心" desc={`欢迎回来，${user.username}`} right={<StatusBadge status={user.status} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：账号信息 */}
        <Card className="lg:col-span-1 h-fit">
          <div className="flex flex-col items-center text-center gap-3 pb-6 border-b border-slate-200">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="头像" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center text-3xl font-extrabold text-white">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-lg font-bold text-slate-800">{user.username}</div>
              <div className="text-[0.8rem] text-slate-500 mt-1">{user.email}</div>
            </div>
            {user.role === "admin" && <Badge color="gray">管理员</Badge>}
          </div>

          <ul className="mt-6 flex flex-col gap-3 text-[0.85rem]">
            <Row label="注册时间" value={fmtTime(user.created_at)} />
            <Row label="社区积分" value={`${user.points ?? 0} 分`} />
            <Row label="最近登录" value={fmtTime(user.last_login_at)} />
            <Row label="登录 IP" value={user.last_login_ip || "-"} />
            <Row label="绑定游戏名" value={user.mc_username || "未绑定"} />
            {user.mc_uuid && <Row label="绑定 UUID" value={user.mc_uuid} mono />}
          </ul>

          <Link href="/user/security" className="block mt-6 text-center">
            <Btn variant="ghost" className="w-full">安全设置（改密 / 绑定微软）</Btn>
          </Link>
        </Card>

        {/* 右侧：快捷入口 + 资料编辑 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[1.05rem] font-bold text-slate-800">新人任务</h3>
              <span className="text-[0.85rem] font-semibold text-slate-700 tabular-nums">{doneCount} / {tasks.length}</span>
            </div>
            <p className="text-[0.8rem] text-slate-500 mb-3">完善资料后即可获得更完整的社区体验</p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
              <div className="h-full bg-slate-900 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tasks.map((t) => (
                <li key={t.label} className="flex items-center gap-2 text-[0.85rem]">
                  <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full ${t.done ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>
                    {t.done ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="w-1 h-1 rounded-full bg-current" />
                    )}
                  </span>
                  <span className={t.done ? "text-slate-400 line-through" : "text-slate-700"}>{t.label}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-2">快捷入口</h3>
            <ul className="flex flex-col">
              {quickLinks.map((q) => (
                <li key={q.href} className="border-b border-slate-100 last:border-b-0">
                  <Link href={q.href} className="flex items-center justify-between gap-3 py-3 group">
                    <span className="min-w-0">
                      <span className="block text-[0.95rem] font-semibold text-slate-800">{q.label}</span>
                      <span className="block text-[0.82rem] text-slate-500 mt-1">{q.desc}</span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-400" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <ServerStatus variant="panel" />

          <Card>
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">编辑资料</h3>
            <div className="flex flex-col gap-4">
              <Field label="头像" hint="支持 PNG/JPG/WEBP，小于 2MB；上传后自动填入 URL">
                <div className="flex items-center gap-3">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="头像预览" className="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0" />
                  ) : null}
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
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-slate-900 text-white text-[0.85rem] font-semibold hover:bg-slate-800 transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      {uploading ? "上传中..." : "上传头像"}
                    </span>
                  </label>
                </div>
              </Field>
              <Field label="游戏名（Minecraft ID）" hint="3-16 位字母/数字/下划线；留空保存可解绑，入服申请通过后会自动绑定">
                <Input
                  value={mcName}
                  onChange={(e) => setMcName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))}
                  placeholder="例如 Steve"
                  autoComplete="off"
                />
              </Field>
              <Field label="QQ 号" hint="填写后自动使用 QQ 高清头像（640px），仅用于社区联系，不公开显示">
                <Input
                  value={qqId}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 12);
                    setQqId(next);
                    if (next && (!avatar || avatar.startsWith("https://q.qlogo.cn/"))) {
                      setAvatar(`https://q.qlogo.cn/headimg_dl?dst_uin=${next}&spec=640`);
                    }
                  }}
                  placeholder="例如 10001"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Discord" hint="填写用户名或 ID">
                <Input value={discord} onChange={(e) => setDiscord(e.target.value.slice(0, 50))} placeholder="例如 name#1234" />
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