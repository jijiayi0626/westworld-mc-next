"use client";

import { useCallback, useEffect, useState } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Card, Empty, PageHeader, fmtTime } from "@/components/ui";

interface Log {
  id: number;
  action: string;
  ip: string;
  ua: string;
  detail: string;
  created_at: string;
}

const actionLabel: Record<string, string> = {
  register: "注册",
  login: "登录",
  logout: "登出",
  forgot_password: "找回密码",
  reset_password: "重置密码",
  change_password: "修改密码",
  bind_microsoft: "绑定微软",
  unbind_microsoft: "解绑微软",
};

export default function LogsPage() {
  const [list, setList] = useState<Log[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Log[]>("/user/logs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <UserShell>
      <PageHeader title="操作日志" desc="账号最近 50 条操作记录" />

      <Card>
        {error && <div className="mb-3 text-red-300 text-[0.85rem]">{error}</div>}
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="暂无操作记录" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.88rem]">
              <thead>
                <tr className="text-slate-500 text-[0.78rem] border-b border-slate-200">
                  <th className="py-2.5 pr-3 font-medium">时间</th>
                  <th className="py-2.5 pr-3 font-medium">操作</th>
                  <th className="py-2.5 pr-3 font-medium">详情</th>
                  <th className="py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((l) => (
                  <tr key={l.id} className="text-slate-600">
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-500">{fmtTime(l.created_at)}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{actionLabel[l.action] || l.action}</td>
                    <td className="py-3 pr-3 text-slate-500">{l.detail || "-"}</td>
                    <td className="py-3 whitespace-nowrap font-mono text-[0.78rem] text-slate-500">{l.ip || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </UserShell>
  );
}