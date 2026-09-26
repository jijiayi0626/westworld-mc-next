"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, SuccessNote, StatusBadge, fmtTime } from "@/components/ui";

interface ServerStatus {
  id: number;
  server_name: string;
  host: string;
  port: number;
  game: string;
  version: string;
  status: string;
  players_online: number;
  max_players: number;
  last_check: string | null;
}

export default function AdminMonitorPage() {
  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 手动更新表单
  const [players, setPlayers] = useState("0");
  const [maxPlayers, setMaxPlayers] = useState("0");
  const [status, setStatus] = useState("online");
  const [version, setVersion] = useState("");

  // RCON
  const [cmd, setCmd] = useState("");
  const [cmdOutput, setCmdOutput] = useState("");

  const load = useCallback(async () => {
    try {
      setServers(await api<ServerStatus[]>("/monitor/status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const manualUpdate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/monitor/admin/update", {
        method: "POST",
        body: JSON.stringify({ players_online: Number(players), max_players: Number(maxPlayers), status, version }),
      });
      setSuccess("服务器状态已更新");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/monitor/admin/check", { method: "POST" });
      setSuccess("已触发巡检");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "巡检失败");
    } finally {
      setBusy(false);
    }
  };

  const runCommand = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCmdOutput("");
    setBusy(true);
    try {
      const data = await api<{ output: string }>("/rcon/command", { method: "POST", body: JSON.stringify({ server_id: 1, command: cmd.trim() }) });
      setCmdOutput(data.output);
      setSuccess("命令已执行");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <PageHeader title="服务器监控" desc="服务器状态与 RCON 命令" />

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <div className="flex flex-col gap-4 mb-5">
        {servers === null ? (
          <Empty text="加载中..." />
        ) : servers.length === 0 ? (
          <Empty text="暂无服务器记录" />
        ) : (
          servers.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-slate-800 font-bold">{s.server_name}</div>
                  <div className="mt-0.5 text-[0.82rem] text-slate-500 font-mono">{s.host}:{s.port} · {s.game}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={s.status} />
                  <span className="text-[0.9rem] text-slate-600">
                    {s.players_online} / {s.max_players} 在线
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[0.8rem] text-slate-500">
                版本：{s.version || "未知"} · 最近检测：{fmtTime(s.last_check)}
              </div>
              <div className="mt-3">
                <Btn size="sm" variant="ghost" onClick={check} disabled={busy}>{busy ? "巡检中..." : "触发巡检"}</Btn>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">手动更新状态</h3>
          <form onSubmit={manualUpdate} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="在线人数">
                <Input type="number" min="0" value={players} onChange={(e) => setPlayers(e.target.value)} />
              </Field>
              <Field label="最大人数">
                <Input type="number" min="0" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
              </Field>
            </div>
            <Field label="状态">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="online">在线</option>
                <option value="offline">离线</option>
              </Select>
            </Field>
            <Field label="版本">
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="如 26.2" maxLength={50} />
            </Field>
            <div>
              <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
            </div>
          </form>
        </Card>

        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">RCON 命令</h3>
          <p className="text-[0.8rem] text-slate-500 mb-4">RCON 未开启（RCON_ENABLED=false）时不可用，需在 wrangler 配置中开启并设置服务器密码。</p>
          <form onSubmit={runCommand} className="flex flex-col gap-3">
            <Field label="命令">
              <Input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="如 list / say hi" maxLength={500} />
            </Field>
            <div>
              <Btn type="submit" variant="ghost" disabled={busy}>{busy ? "执行中..." : "执行"}</Btn>
            </div>
          </form>
          {cmdOutput && (
            <div className="mt-4 px-4 py-3 rounded-[10px] bg-white border border-slate-200 font-mono text-[0.82rem] text-emerald-300 whitespace-pre-wrap">
              {cmdOutput}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
