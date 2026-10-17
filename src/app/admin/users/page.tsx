"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { Badge, Btn, Empty, ErrorNote, StatusBadge, fmtTime } from "@/components/ui";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  mc_name: string | null;
  app_status: string | null;
  profile_pct: number;
  created_at: string;
  last_login_at: string | null;
  register_ip: string;
  last_login_ip: string;
  last_login_ua: string;
}

interface UserStats {
  total: number;
  week_new: number;
  banned: number;
  pending_applications: number;
}

/** 从 UA 解析浏览器与操作系统（管理后台展示用） */
function parseUa(ua: string): { browser: string; os: string } {
  if (!ua) return { browser: "未知", os: "未知" };
  let browser = "未知浏览器";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) browser = `Edge ${m[1].split(".")[0]}`;
  else if ((m = ua.match(/OPR\/([\d.]+)/))) browser = `Opera ${m[1].split(".")[0]}`;
  else if ((m = ua.match(/Chrome\/([\d.]+)/))) browser = `Chrome ${m[1].split(".")[0]}`;
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) browser = `Firefox ${m[1].split(".")[0]}`;
  else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) browser = `Safari ${m[1].split(".")[0]}`;
  else if (/MSIE|Trident/.test(ua)) browser = "Internet Explorer";
  let os = "未知系统";
  const and = ua.match(/Android ([\d.]+)/);
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.1/.test(ua)) os = "Windows 7";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (and) os = `Android ${and[1].split(".")[0]}`;
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return { browser, os };
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // 详情弹窗：查看 IP / UA / 注册与登录信息，并可改邮箱、重置密码
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [detailMsg, setDetailMsg] = useState<{ err: string; ok: string }>({ err: "", ok: "" });

  const load = useCallback(async () => {
    try {
      const [users, st] = await Promise.all([
        api<AdminUser[]>("/admin/users"),
        api<UserStats>("/admin/users/stats"),
      ]);
      setList(users);
      setStats(st);
      // 弹窗打开时同步最新数据
      setDetail((d) => (d ? users.find((u) => u.id === d.id) ?? null : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = (u: AdminUser) => {
    setDetail(u);
    setNewEmail(u.email);
    setNewPwd("");
    setDetailMsg({ err: "", ok: "" });
  };

  const change = async (id: number, body: { status?: string; role?: string }) => {
    setError("");
    setBusyId(id);
    try {
      await api(`/admin/users/${id}/status`, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId(0);
    }
  };

  const changeEmail = async () => {
    if (!detail) return;
    setDetailMsg({ err: "", ok: "" });
    setBusyId(detail.id);
    try {
      await api(`/admin/users/${detail.id}/update-email`, { method: "POST", body: JSON.stringify({ email: newEmail.trim() }) });
      setDetailMsg({ err: "", ok: "邮箱已更新" });
      await load();
    } catch (e) {
      setDetailMsg({ err: e instanceof Error ? e.message : "修改失败", ok: "" });
    } finally {
      setBusyId(0);
    }
  };

  const resetPassword = async () => {
    if (!detail) return;
    if (newPwd.length < 6) {
      setDetailMsg({ err: "新密码至少 6 位", ok: "" });
      return;
    }
    setDetailMsg({ err: "", ok: "" });
    setBusyId(detail.id);
    try {
      await api(`/admin/users/${detail.id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: newPwd }) });
      setDetailMsg({ err: "", ok: "密码已重置" });
      setNewPwd("");
    } catch (e) {
      setDetailMsg({ err: e instanceof Error ? e.message : "重置失败", ok: "" });
    } finally {
      setBusyId(0);
    }
  };

  const filtered = (list ?? []).filter((u) => {
    if (statusFilter && u.status !== statusFilter) return false;
    if (keyword && !`${u.username} ${u.email} ${u.mc_name ?? ""}`.toLowerCase().includes(keyword.toLowerCase())) return false;
    return true;
  });

  const statCards = [
    { label: "总用户数", value: stats?.total, bg: "#f0fdf4", color: "#15803d" },
    { label: "待审核申请", value: stats?.pending_applications, bg: "#fef9c3", color: "#a16207" },
    { label: "已封禁", value: stats?.banned, bg: "#fdf2f8", color: "#be185d" },
    { label: "本周新增", value: stats?.week_new, bg: "#e0f2fe", color: "#1d4ed8" },
  ];

  const detailUa = detail ? parseUa(detail.last_login_ua) : null;

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[1.35rem] font-bold text-slate-900">用户管理</h1>
        </div>

        <ErrorNote message={error} />

        {/* 检索区 */}
        <div className="bg-white border border-slate-200 rounded-[14px] p-4 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索用户名 / 游戏ID / 邮箱"
              className="flex-1 min-w-[220px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.9rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-[10px] px-3 py-2 text-[0.9rem] text-slate-700 focus:outline-none"
            >
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="banned">已封禁</option>
            </select>
            <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.88rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors">查询</button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="px-3.5 py-1.5 rounded-[8px] bg-[color:var(--green,#10b981)] text-white text-[0.85rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] transition-colors">批量通知</button>
            <span className="text-slate-400 text-[0.78rem]">按当前搜索和状态筛选发送，单次最多 500 人（邮件服务未配置时仅记录）</span>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-[14px] border border-slate-100 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" style={{ background: c.bg }}>
              <div className="text-[0.82rem] font-medium" style={{ color: c.color }}>{c.label}</div>
              <div className="text-[1.8rem] font-extrabold mt-1" style={{ color: c.color }}>{c.value ?? "—"}</div>
            </div>
          ))}
        </div>

        {/* 用户表格 */}
        <div className="bg-white border border-slate-200 rounded-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
          {filtered.length === 0 ? (
            <Empty text="暂无用户数据" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead>
                  <tr className="text-left text-slate-500 text-[0.8rem] bg-slate-50 border-b border-slate-200">
                    <th className="py-3 px-4">用户名</th>
                    <th className="py-3 px-4">游戏ID</th>
                    <th className="py-3 px-4">邮箱</th>
                    <th className="py-3 px-4">账号状态</th>
                    <th className="py-3 px-4">申请状态</th>
                    <th className="py-3 px-4">注册时间</th>
                    <th className="py-3 px-4">最后登录</th>
                    <th className="py-3 px-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {u.username}
                        {u.role === "admin" && <Badge color="yellow">管理员</Badge>}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{u.mc_name || "—"}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate" title={u.email}>{u.email}</td>
                      <td className="py-3 px-4"><StatusBadge status={u.status} /></td>
                      <td className="py-3 px-4">{u.app_status ? <StatusBadge status={u.app_status} /> : <Badge color="gray">未申请</Badge>}</td>
                      <td className="py-3 px-4 text-slate-500">{fmtTime(u.created_at)}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {u.last_login_at ? (
                          <>
                            {fmtTime(u.last_login_at)}
                            {u.last_login_ip && <div className="text-[0.72rem] text-slate-400 font-mono">{u.last_login_ip}</div>}
                          </>
                        ) : (
                          <span className="text-slate-300">从未登录</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Btn size="sm" variant="ghost" onClick={() => openDetail(u)}>详情</Btn>
                          {me?.id === u.id ? (
                            <span className="text-[0.78rem] text-slate-400">当前登录账号</span>
                          ) : u.status === "banned" ? (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { status: "active" })}>解封</Btn>
                          ) : (
                            <Btn size="sm" variant="danger" disabled={busyId === u.id} onClick={() => change(u.id, { status: "banned" })}>封禁</Btn>
                          )}
                          {me?.id !== u.id && (u.role === "admin" ? (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { role: "user" })}>取消管理员</Btn>
                          ) : (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { role: "admin" })}>设为管理员</Btn>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 用户详情弹窗：登录信息 + 改邮箱 + 重置密码 */}
        {detail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetail(null)}>
            <div className="bg-white rounded-[16px] p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[1.05rem] font-bold text-slate-800">
                  用户详情：{detail.username}
                  {detail.role === "admin" && <Badge color="yellow">管理员</Badge>}
                </h3>
                <button type="button" onClick={() => setDetail(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer" aria-label="关闭">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                </button>
              </div>

              {/* 登录与注册信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {[
                  { label: "注册时间", value: fmtTime(detail.created_at) },
                  { label: "注册 IP", value: detail.register_ip || "—" },
                  { label: "最后登录", value: detail.last_login_at ? fmtTime(detail.last_login_at) : "从未登录" },
                  { label: "最后登录 IP", value: detail.last_login_ip || "—" },
                  { label: "浏览器", value: detailUa?.browser ?? "—" },
                  { label: "操作系统", value: detailUa?.os ?? "—" },
                ].map((row) => (
                  <div key={row.label} className="bg-slate-50 rounded-[10px] px-3.5 py-2.5">
                    <div className="text-[0.72rem] text-slate-400 mb-0.5">{row.label}</div>
                    <div className="text-[0.88rem] text-slate-800 font-medium break-all">{row.value}</div>
                  </div>
                ))}
              </div>
              {detail.last_login_ua && (
                <div className="mb-4 px-3.5 py-2.5 rounded-[10px] bg-slate-50 border border-slate-100">
                  <div className="text-[0.72rem] text-slate-400 mb-0.5">完整 UA（最后登录）</div>
                  <div className="text-[0.72rem] text-slate-500 font-mono break-all leading-relaxed">{detail.last_login_ua}</div>
                </div>
              )}

              {/* 修改邮箱 */}
              <div className="border-t border-slate-100 pt-4 mb-4">
                <h4 className="text-[0.9rem] font-bold text-slate-700 mb-2.5">修改邮箱</h4>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="新邮箱地址"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-slate-800 text-[0.88rem] focus:outline-none focus:border-[#3b82f6]"
                  />
                  <button
                    type="button"
                    onClick={() => void changeEmail()}
                    disabled={busyId === detail.id || newEmail.trim() === detail.email}
                    className="px-4 py-2 rounded-[10px] bg-[color:var(--green,#10b981)] text-white text-[0.85rem] font-semibold hover:bg-[color:var(--green-dark,#059669)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    保存
                  </button>
                </div>
              </div>

              {/* 重置密码 */}
              {me?.id !== detail.id && detail.role !== "admin" && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-[0.9rem] font-bold text-slate-700 mb-2.5">重置密码</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="新密码（至少 6 位）"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-slate-800 text-[0.88rem] focus:outline-none focus:border-[#3b82f6]"
                    />
                    <button
                      type="button"
                      onClick={() => void resetPassword()}
                      disabled={busyId === detail.id || !newPwd}
                      className="px-4 py-2 rounded-[10px] bg-slate-700 text-white text-[0.85rem] font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      重置
                    </button>
                  </div>
                </div>
              )}

              {detailMsg.err && <div className="mt-3 px-3.5 py-2.5 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-[0.85rem]">{detailMsg.err}</div>}
              {detailMsg.ok && <div className="mt-3 px-3.5 py-2.5 rounded-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[0.85rem]">{detailMsg.ok}</div>}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
