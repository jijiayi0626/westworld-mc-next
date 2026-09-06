"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, PageHeader, StatusBadge, TextArea, fmtTime } from "@/components/ui";

interface Application {
  id: number;
  mc_name: string;
  type: string;
  intro: string;
  channel: string;
  status: string;
  created_at: string;
  review_note: string;
  sync_status: string;
  sync_log: string;
  ip: string;
  user_id: number;
  username: string;
}

interface RconConfig {
  enabled: boolean;
  host: string;
  port: number;
  has_password: boolean;
  approve_template: string;
  reject_template: string;
  timeout: number;
}

type Tab = "pending" | "approved" | "rejected";

const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "mc_name", label: "游戏 ID" },
  { key: "reason", label: "审核备注" },
  { key: "username", label: "网站用户名" },
  { key: "email", label: "用户邮箱" },
  { key: "app_id", label: "申请 ID" },
  { key: "user_id", label: "用户 ID" },
  { key: "source", label: "来源" },
];

const SAMPLE: Record<string, string> = {
  mc_name: "xiaohu_sever",
  reason: "资料不完整",
  username: "玩家小虎",
  email: "demo@example.com",
  app_id: "128",
  user_id: "42",
  source: "B站",
};

function syncBadge(s: string) {
  if (s === "synced") return <Badge color="green">已同步</Badge>;
  if (s === "failed") return <Badge color="red">同步失败</Badge>;
  if (s === "skipped") return <Badge color="gray">已跳过</Badge>;
  if (s === "off") return <Badge color="gray">未开启</Badge>;
  return null;
}

// —— RCON 向导：仿原版「白名单自动同步向导」样式 ——

function RconWizard() {
  const [cfg, setCfg] = useState<RconConfig | null>(null);
  const [password, setPassword] = useState("");
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [clearPwd, setClearPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const approveRef = useRef<HTMLInputElement>(null);
  const rejectRef = useRef<HTMLInputElement>(null);
  const [lastFocusTarget, setLastFocusTarget] = useState<"approve" | "reject">("approve");

  const load = useCallback(async () => {
    try {
      setCfg(await api<RconConfig>("/rcon/whitelist-config"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "配置加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!cfg) {
    return <Card><p className="text-slate-400 text-sm">加载配置中...</p></Card>;
  }

  const set = (patch: Partial<RconConfig>) => setCfg((prev) => (prev ? { ...prev, ...patch } : prev));

  const onFocus = (target: "approve" | "reject") => {
    setLastFocusTarget(target);
  };

  const insertPlaceholder = (ph: string) => {
    const input = lastFocusTarget === "reject" ? rejectRef.current : approveRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + ph + input.value.slice(end);
    const pos = start + ph.length;
    input.focus();
    try {
      input.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const renderPreview = (tpl: string) => {
    let out = tpl || "";
    for (const { key } of PLACEHOLDERS) out = out.split(`{${key}}`).join(SAMPLE[key] ?? "");
    return out || "(空)";
  };

  const save = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await api("/rcon/whitelist-config", {
        method: "POST",
        body: JSON.stringify({
          enabled: cfg.enabled,
          host: cfg.host,
          port: cfg.port,
          approve_template: cfg.approve_template,
          reject_template: cfg.reject_template,
          timeout: cfg.timeout,
          password_present: passwordDirty || clearPwd,
          password: clearPwd ? "" : password,
        }),
      });
      setSuccess("配置已保存");
      setPassword("");
      setPasswordDirty(false);
      setClearPwd(false);
      const fresh = await api<RconConfig>("/rcon/whitelist-config");
      setCfg(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setError("");
    setSuccess("");
    setTestResult(null);
    setTesting(true);
    try {
      const data = await api<{ connected: boolean; output: string }>("/rcon/whitelist-test", {
        method: "POST",
        body: JSON.stringify({
          host: cfg.host,
          port: cfg.port,
          password,
          use_saved: !password && !passwordDirty,
          timeout: cfg.timeout,
        }),
      });
      setTestResult({ ok: true, message: data.output ? `连接成功，返回：${data.output.slice(0, 120)}` : "连接成功" });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "连接失败" });
    } finally {
      setTesting(false);
    }
  };

  const inputBase =
    "w-full bg-black/30 border border-white/10 rounded-[10px] px-4 py-2.5 text-white text-[0.95rem] transition-all duration-300 focus:outline-none focus:border-accent-emerald focus:bg-black/50";
  const labelBase = "text-slate-400 text-[0.82rem] font-medium mb-1.5 block";

  return (
    <Card className="mb-5">
      <details className="group" open>
        <summary className="cursor-pointer flex items-center justify-between gap-3 font-extrabold text-white list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-accent-emerald inline-block" />
            白名单自动同步向导（RCON）
          </span>
          <span className="text-[0.82rem] text-slate-500 font-medium group-open:hidden">可选功能，点击展开</span>
          <span className="text-[0.82rem] text-slate-500 font-medium hidden group-open:inline">点击收起</span>
        </summary>

        <div className="mt-4 flex flex-col gap-4">
          {/* 橙色：服务器设置说明 */}
          <div className="rounded-[14px] px-4 py-3 bg-[#fff7ed] border border-[#fed7aa]">
            <strong className="block text-[#c2410c] mb-2">服务器只要这样设置</strong>
            <div className="bg-[#fff] border border-[#ffedd5] rounded-[10px] px-4 py-3 font-mono text-[0.84rem] leading-[1.8] text-[#7c2d12]">
              enable-rcon=true<br />
              rcon.port=25575<br />
              rcon.password=自己设置一个密码
            </div>
            <p className="mt-2 text-[#9a3412] text-[0.82rem] leading-relaxed">
              保存后重启服务器，并仅向网站服务器 IP 放行这个端口，不要直接暴露到公网。
            </p>
          </div>

          {/* 绿色：自动执行开关 + 连接信息 */}
          <div className="rounded-[14px] px-4 py-3 bg-[#f0fdf4] border border-[#bbf7d0]">
            <label className="flex items-center justify-between gap-3 cursor-pointer mb-3">
              <strong className="text-[#15803d] text-[0.95rem]">审核后自动执行命令</strong>
              <button
                type="button"
                role="switch"
                aria-checked={cfg.enabled}
                onClick={() => set({ enabled: !cfg.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-300 cursor-pointer ${cfg.enabled ? "bg-emerald-500" : "bg-white/20"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${cfg.enabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_1fr_auto] gap-3">
              <div>
                <label className={labelBase}>服务器地址</label>
                <input
                  className={inputBase}
                  value={cfg.host}
                  onChange={(e) => set({ host: e.target.value })}
                  placeholder="IP 或域名"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelBase}>端口</label>
                <input
                  type="number"
                  className={inputBase}
                  min={1}
                  max={65535}
                  value={cfg.port}
                  onChange={(e) => set({ port: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelBase}>密码</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    className={`${inputBase} pr-16`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordDirty(true);
                      setClearPwd(false);
                    }}
                    placeholder={cfg.has_password && !passwordDirty ? "已保存，留空不改" : "RCON 密码"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    title="显示/隐藏"
                    className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm cursor-pointer"
                  >
                    {showPwd ? "🙈" : "👁"}
                  </button>
                  {cfg.has_password && (
                    <button
                      type="button"
                      onClick={() => {
                        setClearPwd(true);
                        setPassword("");
                        setPasswordDirty(true);
                      }}
                      title="清除已保存的密码"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-300 text-sm cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {clearPwd && <small className="text-red-400 mt-1 block text-[0.75rem]">保存后将清除已保存的 RCON 密码</small>}
              </div>
              <div className="flex items-end pb-0.5">
                <Btn variant="ghost" onClick={test} disabled={testing} className="whitespace-nowrap">
                  {testing ? "测试中..." : "测试连接"}
                </Btn>
              </div>
            </div>

            {testResult && (
              <div
                className={`mt-3 px-4 py-3 rounded-[10px] border text-[0.85rem] ${
                  testResult.ok
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : "text-red-700 bg-red-50 border-red-200"
                }`}
                role="status"
              >
                {testResult.ok ? "✓ " : "✕ "}
                {testResult.message}
              </div>
            )}
            <p className="mt-2 text-[#64748b] text-[0.82rem] leading-relaxed">
              可直接测试当前输入，无需先保存。不开自动同步也能用，审核后仍可查看同步命令记录。
            </p>
          </div>

          {/* 灰色：命令模板 */}
          <div className="rounded-[14px] px-4 py-3 bg-[#f8fafc] border border-[#e2e8f0]">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <strong className="text-[#334155] text-[0.95rem]">自定义命令模板</strong>
              <span className="text-[#94a3b8] text-[0.8rem]">不同白名单插件改这里即可</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px] gap-3">
              <div>
                <label className={labelBase}>通过时执行</label>
                <input
                  ref={approveRef}
                  className={inputBase}
                  value={cfg.approve_template}
                  onChange={(e) => set({ approve_template: e.target.value })}
                  onFocus={() => onFocus("approve")}
                  placeholder="/whitelist add {mc_name}"
                />
              </div>
              <div>
                <label className={labelBase}>拒绝时执行</label>
                <input
                  ref={rejectRef}
                  className={inputBase}
                  value={cfg.reject_template}
                  onChange={(e) => set({ reject_template: e.target.value })}
                  onFocus={() => onFocus("reject")}
                  placeholder="/whitelist remove {mc_name}"
                />
              </div>
              <div>
                <label className={labelBase}>超时秒数</label>
                <input
                  type="number"
                  className={inputBase}
                  min={1}
                  max={60}
                  value={cfg.timeout}
                  onChange={(e) => set({ timeout: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="mt-2.5 text-[#64748b] text-[0.8rem]">点击下方占位符插入到光标位置：</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => insertPlaceholder(`{${p.key}}`)}
                  className="px-2.5 py-1 rounded-md text-[0.78rem] font-mono bg-white border border-slate-200 text-slate-600 cursor-pointer hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                  title={p.label}
                >
                  {"{"}{p.key}{"}"}
                  <span className="ml-1 text-[0.7rem] text-slate-400 font-normal not-italic">{p.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 bg-[#0f172a] rounded-[10px] px-4 py-3 font-mono text-[0.84rem] text-slate-200 leading-[1.8]">
              <div className="text-slate-400 text-[0.76rem] mb-1.5">实时预览（用示例数据替换占位符）</div>
              <div>
                通过时：<span className="text-emerald-400">{renderPreview(cfg.approve_template)}</span>
              </div>
              <div>
                拒绝时：<span className="text-rose-400">{renderPreview(cfg.reject_template)}</span>
              </div>
            </div>
            <p className="mt-2 text-[#94a3b8] text-[0.8rem]">
              示例：<code className="font-mono">/whitelist add {"{mc_name}"}</code>、<code className="font-mono">/easywl approve {"{mc_name}"}</code>、
              <code className="font-mono">/lp user {"{mc_name}"} parent add default</code>、<code className="font-mono">/vmc reject {"{mc_name}"} {"{reason}"}</code>
            </p>
          </div>

          <ErrorNote message={error} />
          {success && <div className="px-4 py-3 rounded-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[0.88rem]">{success}</div>}

          <div className="flex justify-end">
            <Btn onClick={save} disabled={saving}>{saving ? "保存中..." : "保存配置"}</Btn>
          </div>
        </div>
      </details>
    </Card>
  );
}

export default function AdminApplicationsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [list, setList] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(0);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Application[]>(`/application/admin/list?status=${tab}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: number, status: "approved" | "rejected") => {
    setError("");
    setBusyId(id);
    try {
      await api(`/application/admin/${id}/review`, { method: "POST", body: JSON.stringify({ status, note: note.trim() }) });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审核失败");
    } finally {
      setBusyId(0);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "待审核" },
    { key: "approved", label: "已通过" },
    { key: "rejected", label: "已拒绝" },
  ];

  return (
    <AdminShell>
      <PageHeader title="入服审核" desc="审核玩家白名单申请，可配置 RCON 自动同步" />

      <div className="flex gap-2 mb-5 p-1 bg-white/5 rounded-[10px] w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all cursor-pointer ${
              tab === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <RconWizard />
      <ErrorNote message={error} />

      {tab === "pending" && (
        <Card className="mb-4">
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-slate-400 text-[0.85rem] font-medium ml-1">审核备注（选填，随操作一并提交）</span>
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="如通过原因 / 拒绝理由..." maxLength={1000} />
          </label>
        </Card>
      )}

      {list === null ? (
        <Empty text="加载中..." />
      ) : list.length === 0 ? (
        <Empty text={`暂无${tab === "pending" ? "待审核" : tab === "approved" ? "已通过" : "已拒绝"}的申请`} />
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-white font-semibold text-[1.02rem]">{a.mc_name}</span>
                  <Badge color={a.type === "bedrock" ? "blue" : "gray"}>{a.type === "bedrock" ? "基岩版" : "Java"}</Badge>
                  <StatusBadge status={a.status} />
                  {syncBadge(a.sync_status)}
                </div>
                <div className="flex items-center gap-3 text-[0.78rem] text-slate-500">
                  <span>申请人：{a.username}</span>
                  <span>{fmtTime(a.created_at)}</span>
                  {a.ip && <span className="font-mono">{a.ip}</span>}
                </div>
              </div>
              {a.channel && <div className="mt-2 text-[0.8rem] text-slate-500">来源：{a.channel}</div>}
              <div className="mt-3 px-4 py-3 rounded-[10px] bg-white/5 border border-white/10 text-[0.9rem] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {a.intro}
              </div>
              {a.sync_log && (
                <div className="mt-2 px-4 py-2.5 rounded-[8px] text-[0.82rem] font-mono text-slate-400 bg-slate-500/10 border border-white/10">
                  同步：{a.sync_log}
                </div>
              )}
              {a.review_note && (
                <div className={`mt-3 px-4 py-2.5 rounded-[8px] text-[0.85rem] ${a.status === "approved" ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20" : "text-red-300 bg-red-500/10 border border-red-500/20"}`}>
                  备注：{a.review_note}
                </div>
              )}
              {tab === "pending" && (
                <div className="mt-4 flex gap-2">
                  <Btn variant="primary" size="sm" disabled={busyId === a.id} onClick={() => review(a.id, "approved")}>
                    {busyId === a.id ? "处理中..." : "通过"}
                  </Btn>
                  <Btn variant="danger" size="sm" disabled={busyId === a.id} onClick={() => review(a.id, "rejected")}>拒绝</Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}