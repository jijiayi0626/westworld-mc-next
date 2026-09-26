"use client";

import { useEffect, useState } from "react";

interface GameServer {
  id: number;
  server_name: string;
  host: string;
  port: number;
  status: string; // online / offline
  version: string;
  players_online: number;
  max_players: number;
  last_check: string | null;
}

interface ServerStatusProps {
  className?: string;
  /** badge：导航栏小徽章；hero：Hero 区大胶囊；panel：亮色信息卡（用户中心） */
  variant?: "badge" | "hero" | "panel";
}

export default function ServerStatus({
  className = "",
  variant = "badge",
}: ServerStatusProps) {
  const [server, setServer] = useState<GameServer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      try {
        const res = await fetch("/api/monitor/status");
        const body = (await res.json()) as {
          code: number;
          data: GameServer[] | null;
        };
        if (!cancelled) {
          if (body.code === 0 && Array.isArray(body.data) && body.data.length > 0) {
            setServer(body.data[0]);
            setFailed(false);
          } else {
            setFailed(true);
          }
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void load();
    timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const online = server?.status === "online";

  if (variant === "hero") {
    return (
      <div
        className={`server-status inline-flex items-center gap-2.5 bg-glass-bg backdrop-blur-glass border border-glass-border px-4 py-2 rounded-full mb-5 text-[0.9rem] text-white ${className}`}
      >
        <span
          className={`status-dot w-2.5 h-2.5 rounded-full ${
            failed ? "bg-slate-400" : online ? "bg-accent-green shadow-[0_0_10px_var(--accent-green)] animate-pulse-glow" : "bg-red-500"
          }`}
        />
        <span className="status-text">
          {failed ? (
            "服务器状态暂不可用"
          ) : online ? (
            <>
              服务器在线:{" "}
              <span className="text-rainbow-fast font-bold">
                {server?.players_online ?? 0}
              </span>{" "}
              玩家
              {server?.max_players ? ` / ${server.max_players}` : ""}
            </>
          ) : (
            "服务器离线"
          )}
        </span>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div
        className={`rounded-[16px] border border-slate-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[1.05rem] font-bold text-slate-800">服务器状态</h4>
          <span
            className={`inline-flex items-center gap-1.5 text-[0.78rem] font-semibold px-2.5 py-1 rounded-full ${
              failed
                ? "bg-slate-100 text-slate-500"
                : online
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                failed ? "bg-slate-400" : online ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            {failed ? "状态未知" : online ? "在线" : "离线"}
          </span>
        </div>
        {server ? (
          <dl className="flex flex-col gap-2.5 text-[0.9rem]">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">服务器</dt>
              <dd className="text-slate-700 font-semibold">{server.server_name}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">地址</dt>
              <dd className="font-mono text-[0.82rem] text-slate-700">
                {server.host}:{server.port}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">在线人数</dt>
              <dd className="text-slate-700 font-semibold">
                {server.players_online}
                {server.max_players ? ` / ${server.max_players}` : ""}
              </dd>
            </div>
            {server.version && (
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">版本</dt>
                <dd className="text-slate-700">{server.version}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-[0.85rem] text-slate-400">加载中...</p>
        )}
      </div>
    );
  }

  return (
    <span
      className={`server-status-badge inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-white/90 bg-white/5 border border-white/10 rounded-full px-2.5 py-1 ${className}`}
      title={server ? `${server.server_name} ${server.host}:${server.port}` : "服务器状态"}
    >
      <span
        className={`status-dot w-1.5 h-1.5 rounded-full ${
          failed
            ? "bg-slate-400"
            : online
              ? "bg-accent-green shadow-[0_0_6px_var(--accent-green)] animate-pulse-glow"
              : "bg-red-500"
        }`}
      />
      {failed ? "状态未知" : online ? `${server?.players_online ?? 0} 人在线` : "离线"}
    </span>
  );
}
