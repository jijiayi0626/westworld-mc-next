"use client";

import { useState } from "react";

interface MotdResult {
  motd: string;
  icon: string;
  version: string;
  players: { online: number; max: number };
}

/** 服务器 MOTD 在线查询卡（MineBBS MOTD API，经后端代理避免跨域） */
export default function MotdQuery({ defaultHost }: { defaultHost?: string }) {
  const [host, setHost] = useState(defaultHost || "sdcmc.chipzz.top:23400");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MotdResult | null>(null);

  const query = async () => {
    const h = host.trim();
    if (!h) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const resp = await fetch(`/api/monitor/motd?host=${encodeURIComponent(h)}`);
      const json = (await resp.json()) as { code: number; message: string; data: MotdResult | null };
      if (json.code !== 0 || !json.data) throw new Error(json.message || "查询失败");
      setResult(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="motd-query">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void query();
          }}
          placeholder="服务器地址，如 play.example.com:25565"
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={() => void query()}
          disabled={busy || !host.trim()}
          className="motd-btn"
        >
          {busy ? "查询中..." : "查询 MOTD"}
        </button>
      </div>

      {error && <div className="mt-2 text-[0.82rem] text-red-500">{error}</div>}

      {result && (
        <div className="mt-3 rounded-[12px] bg-black/85 border border-white/10 p-4 flex items-start gap-3 overflow-hidden">
          {result.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.icon} alt="server icon" className="w-16 h-16 rounded-[4px] image-rendering-pixelated flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-[4px] bg-white/10 flex items-center justify-center text-[0.6rem] text-white/40 flex-shrink-0">无图标</div>
          )}
          <div className="min-w-0 flex-1">
            <div
              className="font-mono text-[0.85rem] text-white/90 whitespace-pre-wrap break-words leading-relaxed max-h-24 overflow-y-auto"
            >
              {result.motd || "（该服务器未设置 MOTD）"}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.78rem] text-white/50">
              <span>版本：{result.version || "未知"}</span>
              <span>在线：{result.players.online} / {result.players.max}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
