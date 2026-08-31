"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, PageHeader, StatusBadge, fmtTime } from "@/components/ui";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminUsersPage() {
  const [list, setList] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);

  const load = useCallback(async () => {
    try {
      setList(await api<AdminUser[]>("/admin/users"));
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

  return (
    <AdminShell>
      <PageHeader title="用户管理" desc="封禁 / 解封 / 设置管理员" />

      <Card>
        <ErrorNote message={error} />
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无用户" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[0.88rem]">
              <thead>
                <tr className="text-left text-slate-500 text-[0.8rem] border-b border-white/10">
                  <th className="py-2.5 pr-3">ID</th>
                  <th className="py-2.5 pr-3">用户名</th>
                  <th className="py-2.5 pr-3">邮箱</th>
                  <th className="py-2.5 pr-3">角色</th>
                  <th className="py-2.5 pr-3">状态</th>
                  <th className="py-2.5 pr-3">注册时间</th>
                  <th className="py-2.5 pr-3">最近登录</th>
                  <th className="py-2.5">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {list.map((u) => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="py-3 pr-3 font-mono text-slate-500">{u.id}</td>
                    <td className="py-3 pr-3 font-medium text-white">{u.username}</td>
                    <td className="py-3 pr-3 text-slate-400">{u.email}</td>
                    <td className="py-3 pr-3">
                      {u.role === "admin" ? <Badge color="yellow">管理员</Badge> : <Badge color="gray">用户</Badge>}
                    </td>
                    <td className="py-3 pr-3"><StatusBadge status={u.status} /></td>
                    <td className="py-3 pr-3 text-slate-400">{fmtTime(u.created_at)}</td>
                    <td className="py-3 pr-3 text-slate-400">{fmtTime(u.last_login_at)}</td>
                    <td className="py-3">
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
