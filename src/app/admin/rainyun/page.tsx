"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote, fmtTime } from "@/components/ui";

interface RainyunConfigView {
  enabled: boolean;
  base_url: string;
  server_id: string;
  api_key_set: boolean;
  api_key_preview: string;
}

interface Instance {
  id: number;
  name: string;
  status: string;
  status_tone: "green" | "gray" | "amber" | "red";
  raw_status: string;
  stop_reason: string;
  ip: string;
  domain: string;
  zone: string;
  plan: string;
  cpu: number;
  memory: number;
  mem_usage: number;
  disk: number;
  net_in: number;
  net_out: number;
  expires_at: number;
  expires_in_days: number | null;
  created_at: number;
}

interface Overview {
  configured: boolean;
  enabled: boolean;
  base_url?: string;
  server_id?: string;
  instances: Instance[];
  error: string;
  fetched_at?: string;
}

const TONE: Record<Instance["status_tone"], "green" | "gray" | "yellow" | "red"> = {
  green: "green",
  gray: "gray",
  amber: "yellow",
  red: "red",
};

function fmtMem(mb: number): string {
  if (!mb) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function fmtNet(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(seconds: number): string {
  if (!seconds) return "—";
  return fmtTime(new Date(seconds * 1000).toISOString());
}

export default function AdminRainyunPage() {
  const [cfg, setCfg] = useState<RainyunConfigView | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(0);

  // 表单
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.v2.rainyun.com");
  const [serverId, setServerId] = useState("");
  const [clearKey, setClearKey] = useState(false);

  const loadConfig = useCallback(async () => {
    const data = await api<RainyunConfigView>("/rainyun/admin/config");
    setCfg(data);
    setEnabled(data.enabled);
    setBaseUrl(data.base_url);
    setServerId(data.server_id);
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>("/rainyun/admin/overview"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取雨云实例失败");
    }
  }, []);

  useEffect(() => {
    loadConfig().catch((e) => setError(e instanceof Error ? e.message : "加载配置失败"));
    void loadOverview();
  }, [loadConfig, loadOverview]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const data = await api<RainyunConfigView>("/rainyun/admin/config", {
        method: "POST",
        body: JSON.stringify({
          enabled,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim(),
          server_id: serverId.trim(),
          clear_key: clearKey,
        }),
      });
      setCfg(data);
      setApiKey("");
      setClearKey(false);
      setSuccess("雨云配置已保存");
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await loadOverview();
      setSuccess("已刷新实例状态");
    } finally {
      setBusy(false);
    }
  };

  const act = async (ins: Instance, action: "start" | "stop" | "reboot") => {
    const labels = { start: "开机", stop: "关机", reboot: "重启" };
    if (!window.confirm(`确定要对「${ins.name}」执行${labels[action]}吗？`)) return;
    setError("");
    setSuccess("");
    setActionBusy(ins.id);
    try {
      const data = await api<{ message: string }>("/rainyun/admin/action", {
        method: "POST",
        body: JSON.stringify({ id: ins.id, action }),
      });
      setSuccess(data.message || `${labels[action]}指令已提交`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${labels[action]}失败`);
    } finally {
      setActionBusy(0);
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="雨云面板"
        desc="通过雨云 API 查看游戏云实例并执行开机 / 关机 / 重启"
        right={<Btn variant="ghost" size="sm" onClick={refresh} disabled={busy}>{busy ? "刷新中..." : "刷新状态"}</Btn>}
      />

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card className="mb-5">
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">API 配置</h3>
        <p className="text-[0.8rem] text-slate-400 mb-4">
          在雨云控制台「个人中心 → API 密钥」生成密钥。填写服务器 ID 后，面板只允许操作该实例，避免误操作其他机器。
        </p>
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="API Key" hint={cfg?.api_key_set ? `已配置：${cfg.api_key_preview}，留空保持不变` : "尚未配置"}>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg?.api_key_set ? "留空保留现有 Key" : "粘贴雨云 API Key"}
              autoComplete="new-password"
            />
          </Field>
          <Field label="API 地址" hint="一般保持默认，自建代理时才需要修改">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.v2.rainyun.com" />
          </Field>
          <Field label="绑定实例 ID" hint="留空表示可查看/操作账号下全部游戏云">
            <Input value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="如 123456" maxLength={30} />
          </Field>
          <div className="flex flex-col gap-3 justify-end pb-1">
            <label className="flex items-center gap-2 text-[0.88rem] text-slate-600">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              启用雨云面板
            </label>
            <label className="flex items-center gap-2 text-[0.88rem] text-slate-600">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              清除已保存的 API Key
            </label>
          </div>
          <div className="md:col-span-2">
            <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存配置"}</Btn>
          </div>
        </form>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[1.05rem] font-bold text-slate-800">实例列表</h3>
        {overview?.fetched_at && <span className="text-[0.78rem] text-slate-400">更新于 {fmtTime(overview.fetched_at)}</span>}
      </div>

      {overview === null ? (
        <Empty text="加载中..." />
      ) : !overview.enabled ? (
        <Card>
          <Empty text="雨云面板尚未启用，请在上方配置中勾选「启用雨云面板」并保存" />
        </Card>
      ) : overview.error ? (
        <Card>
          <div className="text-[0.9rem] text-red-600 font-medium mb-2">无法读取雨云实例</div>
          <div className="text-[0.84rem] text-slate-500 break-words">{overview.error}</div>
        </Card>
      ) : overview.instances.length === 0 ? (
        <Card>
          <Empty text={overview.configured ? "账号下没有可显示的游戏云实例" : "请先配置 API Key"} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {overview.instances.map((ins) => (
            <Card key={ins.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-slate-900 font-bold">{ins.name}</div>
                  <div className="text-[0.78rem] text-slate-400 font-mono mt-0.5">#{ins.id}{ins.zone ? ` · ${ins.zone}` : ""}</div>
                </div>
                <Badge color={TONE[ins.status_tone]}>{ins.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4 text-[0.82rem]">
                <div className="text-slate-400">IP</div>
                <div className="text-slate-700 font-mono break-all">{ins.ip || "—"}</div>
                {ins.domain && (
                  <>
                    <div className="text-slate-400">内网域名</div>
                    <div className="text-slate-700 font-mono break-all">{ins.domain}</div>
                  </>
                )}
                <div className="text-slate-400">套餐</div>
                <div className="text-slate-700">{ins.plan || "—"}</div>
                <div className="text-slate-400">CPU / 内存</div>
                <div className="text-slate-700">{ins.cpu ? `${ins.cpu} 核` : "—"} / {fmtMem(ins.memory)}{ins.mem_usage ? `（已用 ${fmtMem(ins.mem_usage)}）` : ""}</div>
                <div className="text-slate-400">磁盘</div>
                <div className="text-slate-700">{ins.disk ? `${ins.disk} GB` : "—"}</div>
                <div className="text-slate-400">流量</div>
                <div className="text-slate-700">入 {fmtNet(ins.net_in)} · 出 {fmtNet(ins.net_out)}</div>
                <div className="text-slate-400">到期时间</div>
                <div className="text-slate-700">
                  {fmtDate(ins.expires_at)}
                  {ins.expires_in_days !== null && (
                    <span className={ins.expires_in_days <= 7 ? " text-red-600 font-semibold" : ""}>
                      {ins.expires_in_days > 0 ? `（剩 ${ins.expires_in_days} 天）` : "（已到期）"}
                    </span>
                  )}
                </div>
              </div>
              {ins.stop_reason && <div className="mt-2 text-[0.78rem] text-amber-600">停机原因：{ins.stop_reason}</div>}

              <div className="mt-4 flex flex-wrap gap-2">
                <Btn size="sm" onClick={() => act(ins, "start")} disabled={actionBusy === ins.id || ins.status === "运行中"}>开机</Btn>
                <Btn size="sm" variant="ghost" onClick={() => act(ins, "reboot")} disabled={actionBusy === ins.id || ins.status !== "运行中"}>重启</Btn>
                <Btn size="sm" variant="danger" onClick={() => act(ins, "stop")} disabled={actionBusy === ins.id || ins.status !== "运行中"}>关机</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
