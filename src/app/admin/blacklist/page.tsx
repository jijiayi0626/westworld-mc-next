"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, StatusBadge, SuccessNote, fmtTime } from "@/components/ui";

interface BlackItem {
  id: number;
  ip: string;
  reason: string;
  created_at: string;
}

interface SharedIp {
  ip: string;
  accounts: number;
  usernames: string;
  banned: number;
  first_seen?: string;
  last_seen: string | null;
}

interface SharedFingerprint {
  fingerprint: string;
  accounts: number;
  usernames: string;
  banned: number;
}

interface RecentUser {
  id: number;
  username: string;
  email: string;
  status: string;
  register_ip: string;
  created_at: string;
}

interface RiskLog {
  id: number;
  action: string;
  ip: string;
  detail: string;
  created_at: string;
  username: string | null;
}

interface RiskData {
  score: number;
  level: { label: string; tone: "red" | "amber" | "blue" | "green"; desc: string };
  factors: { label: string; points: number; detail: string }[];
  stats: { total: number; banned: number; admins: number; new_24h: number; new_7d: number; active_7d: number };
  pending_apps: number;
  open_tickets: number;
  blacklist: BlackItem[];
  shared_register_ips: SharedIp[];
  shared_login_ips: SharedIp[];
  shared_fingerprints: SharedFingerprint[];
  recent_registrations: RecentUser[];
  recent_logs: RiskLog[];
  rate_limits: { key: string; count: number; expires_at: number }[];
}

const TONE: Record<string, { panel: string; badge: string; num: string }> = {
  red: { panel: "bg-red-50 border-red-200", badge: "bg-red-600", num: "text-red-700" },
  amber: { panel: "bg-amber-50 border-amber-200", badge: "bg-amber-500", num: "text-amber-700" },
  blue: { panel: "bg-sky-50 border-sky-200", badge: "bg-sky-500", num: "text-sky-700" },
  green: { panel: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-600", num: "text-emerald-700" },
};

const ACTION_LABEL: Record<string, string> = {
  register: "注册",
  login: "登录",
  reset_password: "重置密码",
  forgot_password: "找回密码",
};

export default function AdminBlacklistPage() {
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<"register" | "login" | "fingerprint">("register");

  const load = useCallback(async () => {
    try {
      setRisk(await api<RiskData>("/admin/risk"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/blacklist", { method: "POST", body: JSON.stringify({ ip: ip.trim(), reason: reason.trim() }) });
      setSuccess(`已封禁 ${ip.trim()}`);
      setIp("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: BlackItem) => {
    setError("");
    setSuccess("");
    try {
      await api("/admin/blacklist/delete", { method: "POST", body: JSON.stringify({ id: b.id }) });
      setSuccess(`已移除 ${b.ip}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const quickBlock = async (targetIp: string, why: string) => {
    if (!confirm(`确认将 ${targetIp} 加入黑名单？\n原因：${why}\n\n若为 NAT / 校园网出口 IP，可能影响大量正常用户。`)) return;
    setError("");
    setSuccess("");
    try {
      await api("/admin/blacklist", { method: "POST", body: JSON.stringify({ ip: targetIp, reason: why }) });
      setSuccess(`已封禁 ${targetIp}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "封禁失败");
    }
  };

  const sharedList = risk
    ? tab === "register"
      ? risk.shared_register_ips
      : tab === "login"
        ? risk.shared_login_ips
        : []
    : [];
  const tone = TONE[risk?.level.tone ?? "green"];

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h1 className="text-[1.35rem] font-bold text-slate-900">风控看板</h1>
            <p className="text-[0.82rem] text-slate-400 mt-1">多账号关联、黑名单与近期注册行为一览，评分仅作排查参考。</p>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => void load()}>刷新数据</Btn>
        </div>

        <ErrorNote message={error} />
        <SuccessNote message={success} />

        {risk === null ? (
          <Empty text="正在计算风险评分..." />
        ) : (
          <>
            <div className={`border rounded-[14px] p-5 mb-5 ${tone.panel}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                <div className="flex items-center gap-4">
                  <div className={`w-20 h-20 rounded-full bg-white/70 border ${tone.panel} flex flex-col items-center justify-center flex-shrink-0`}>
                    <span className={`text-[1.9rem] font-extrabold leading-none ${tone.num}`}>{risk.score}</span>
                    <span className="text-[0.68rem] text-slate-500 mt-1">风险分</span>
                  </div>
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-full ${tone.badge} text-white text-[0.85rem] font-semibold`}>
                      {risk.level.label}
                    </span>
                    <p className="text-[0.86rem] text-slate-600 mt-2 max-w-xl">{risk.level.desc}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:ml-auto">
                  {risk.factors.length === 0 ? (
                    <span className="px-3 py-1.5 rounded-full bg-white/70 text-emerald-700 text-[0.8rem] border border-emerald-200">未发现异常信号</span>
                  ) : (
                    risk.factors.map((f) => (
                      <span key={f.label} title={f.detail} className="px-3 py-1.5 rounded-full bg-white/80 text-slate-700 text-[0.8rem] border border-white/80">
                        {f.label} <b className="text-slate-900">+{f.points}</b>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
              {[
                { label: "账号总数", value: risk.stats.total, tone: "slate" },
                { label: "7 日活跃", value: risk.stats.active_7d, tone: "green" },
                { label: "封禁账号", value: risk.stats.banned, tone: "pink" },
                { label: "24h 新注册", value: risk.stats.new_24h, tone: "blue" },
                { label: "待审核申请", value: risk.pending_apps, tone: "amber" },
                { label: "未关闭工单", value: risk.open_tickets, tone: "amber" },
              ].map((c) => (
                <div key={c.label} className={`stat-card sc-${c.tone} rounded-[12px] p-3 ${c.tone === "slate" ? "text-slate-700" : ""}`}>
                  <div className="text-[1.5rem] font-extrabold">{c.value}</div>
                  <div className="text-[0.76rem] font-medium mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>

            <Card className="mb-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h3 className="text-[1.05rem] font-bold text-slate-800">多账号关联</h3>
                  <p className="text-[0.78rem] text-slate-400 mt-0.5">同一 IP 或浏览器指纹下出现多个账号时列出；移动网络与公共网络可能造成误判。</p>
                </div>
                <div className="flex gap-1 p-1 bg-slate-50 rounded-[10px]">
                  {[
                    { key: "register" as const, label: "注册 IP", count: risk.shared_register_ips.length },
                    { key: "login" as const, label: "登录 IP", count: risk.shared_login_ips.length },
                    { key: "fingerprint" as const, label: "设备指纹", count: risk.shared_fingerprints.length },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className={`px-3 py-1.5 rounded-[8px] text-[0.8rem] font-semibold cursor-pointer ${
                        tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t.label} {t.count > 0 && <span className="text-slate-400">({t.count})</span>}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "fingerprint" ? (
                risk.shared_fingerprints.length === 0 ? (
                  <Empty text="未发现共用设备指纹的账号" />
                ) : (
                  <div className="flex flex-col divide-y divide-slate-100">
                    {risk.shared_fingerprints.map((f) => (
                      <div key={f.fingerprint} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-mono text-[0.8rem] text-slate-600 truncate max-w-[420px]">{f.fingerprint}</div>
                          <div className="mt-1 text-[0.78rem] text-slate-500">
                            {f.accounts} 个账号：{f.usernames} {f.banned > 0 && <Badge color="red">含 {f.banned} 个封禁</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : sharedList.length === 0 ? (
                <Empty text="未发现共用 IP 的账号" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.86rem]">
                    <thead>
                      <tr className="text-left text-slate-500 text-[0.78rem] bg-slate-50 border-b border-slate-200">
                        <th className="py-2.5 px-3">IP</th>
                        <th className="py-2.5 px-3">账号</th>
                        <th className="py-2.5 px-3">关联账号</th>
                        <th className="py-2.5 px-3">最近活跃</th>
                        <th className="py-2.5 px-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sharedList.map((s) => (
                        <tr key={s.ip} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-700">{s.ip}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {s.accounts} 个 {s.banned > 0 && <Badge color="red">封禁 {s.banned}</Badge>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-[340px]">
                            <div className="truncate" title={s.usernames}>{s.usernames}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{fmtTime(s.last_seen)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <Btn
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                void quickBlock(
                                  s.ip,
                                  tab === "register" ? "多账号共用注册 IP" : "多账号共用登录 IP",
                                )
                              }
                            >
                              拉黑
                            </Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
              <Card>
                <h3 className="text-[1.05rem] font-bold text-slate-800 mb-3">最近注册</h3>
                {risk.recent_registrations.length === 0 ? (
                  <Empty text="暂无注册记录" />
                ) : (
                  <div className="flex flex-col divide-y divide-slate-100">
                    {risk.recent_registrations.map((u) => (
                      <div key={u.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[0.88rem] font-medium text-slate-800 truncate">{u.username}</div>
                          <div className="text-[0.75rem] text-slate-500 truncate">{u.email} · <span className="font-mono">{u.register_ip || "未知 IP"}</span></div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <StatusBadge status={u.status} />
                          <div className="text-[0.72rem] text-slate-400 mt-1">{fmtTime(u.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h3 className="text-[1.05rem] font-bold text-slate-800 mb-3">最近账号行为</h3>
                {risk.recent_logs.length === 0 ? (
                  <Empty text="暂无行为记录" />
                ) : (
                  <div className="flex flex-col divide-y divide-slate-100">
                    {risk.recent_logs.map((l) => (
                      <div key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[0.86rem] text-slate-700">
                            <b>{l.username || "未知用户"}</b> · {ACTION_LABEL[l.action] || l.action}
                          </div>
                          <div className="text-[0.74rem] text-slate-500 truncate">{l.detail || "—"} · <span className="font-mono">{l.ip || "—"}</span></div>
                        </div>
                        <span className="text-[0.72rem] text-slate-400 flex-shrink-0">{fmtTime(l.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">IP 黑名单</h3>
          <form onSubmit={add} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="IP 地址">
                <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="如 1.2.3.4" maxLength={45} required />
              </Field>
              <Field label="原因">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="封禁原因 (可选)" maxLength={200} />
              </Field>
            </div>
            <div>
              <button type="submit" disabled={busy} className="px-5 py-2 rounded-[10px] bg-[#ef4444] text-white text-[0.9rem] font-semibold hover:bg-[#dc2626] transition-colors disabled:opacity-50">
                {busy ? "封禁中..." : "封禁 IP"}
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">已封禁 IP</h3>
          {risk === null ? (
            <Empty text="加载中..." />
          ) : risk.blacklist.length === 0 ? (
            <Empty text="黑名单为空" />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {risk.blacklist.map((b) => (
                <div key={b.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-slate-800 font-medium">{b.ip}</div>
                    <div className="mt-1 text-[0.78rem] text-slate-500">{b.reason || "无原因"} · {fmtTime(b.created_at)}</div>
                  </div>
                  <Btn size="sm" variant="danger" onClick={() => void remove(b)}>移除</Btn>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
