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
}

interface UserStats {
  total: number;
  week_new: number;
  banned: number;
  pending_applications: number;
}

export default function AdminUsersPage() {
  const [list, setList] = useState<AdminUser[] | null>(null);
  const { user: me } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const [users, st] = await Promise.all([
        api<AdminUser[]>("/admin/users"),
        api<UserStats>("/admin/users/stats"),
      ]);
      setList(users);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const resetPassword = async () => {
    if (!resetTarget) return;
    if (resetPwd.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    setError("");
    setBusyId(resetTarget.id);
    try {
      await api(`/admin/users/${resetTarget.id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: resetPwd }) });
      setResetTarget(null);
      setResetPwd("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重置失败");
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
            <button type="button" onClick={() => void load()} className="px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.88rem] font-semibold hover:bg-[#059669] transition-colors">查询</button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="px-3.5 py-1.5 rounded-[8px] bg-[#10b981] text-white text-[0.85rem] font-semibold hover:bg-[#059669] transition-colors">批量通知</button>
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
                    <th className="py-3 px-4">资料完整度</th>
                    <th className="py-3 px-4">注册时间</th>
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
                      <td className="py-3 px-4 text-slate-500">{u.email}</td>
                      <td className="py-3 px-4"><StatusBadge status={u.status} /></td>
                      <td className="py-3 px-4">{u.app_status ? <StatusBadge status={u.app_status} /> : <Badge color="gray">未申请</Badge>}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full bg-[#10b981]" style={{ width: `${u.profile_pct}%` }} />
                          </div>
                          <span className="text-[0.78rem] text-slate-500">{u.profile_pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500">{fmtTime(u.created_at)}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {u.status === "banned" ? (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { status: "active" })}>解封</Btn>
                          ) : (
                            <Btn size="sm" variant="danger" disabled={busyId === u.id} onClick={() => change(u.id, { status: "banned" })}>封禁</Btn>
                          )}
                          {u.role === "admin" ? (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { role: "user" })}>取消管理员</Btn>
                          ) : (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => change(u.id, { role: "admin" })}>设为管理员</Btn>
                          )}
                          {u.id !== me?.id && u.role !== "admin" && (
                            <Btn size="sm" variant="ghost" disabled={busyId === u.id} onClick={() => { setResetTarget(u); setResetPwd(""); }}>重置密码</Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 重置密码弹窗 */}
        {resetTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setResetTarget(null)}>
            <div className="bg-white rounded-[16px] p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">重置密码：{resetTarget.username}</h3>
              <input
                type="text"
                value={resetPwd}
                onChange={(e) => setResetPwd(e.target.value)}
                placeholder="输入新密码（至少 6 位）"
                className="w-full bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2.5 text-slate-800 text-[0.9rem] focus:outline-none focus:border-[#3b82f6]"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 rounded-[10px] bg-slate-100 text-slate-700 text-[0.88rem] font-semibold hover:bg-slate-200 cursor-pointer">取消</button>
                <button type="button" onClick={() => void resetPassword()} disabled={busyId === resetTarget.id} className="px-4 py-2 rounded-[10px] bg-[#10b981] text-white text-[0.88rem] font-semibold hover:bg-[#059669] cursor-pointer disabled:opacity-50">{busyId === resetTarget.id ? "重置中..." : "确认重置"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}