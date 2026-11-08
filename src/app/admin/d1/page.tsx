"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, SuccessNote } from "@/components/ui";

interface TableRow {
  name: string;
  rows: number;
}

interface LocalDb {
  name: string;
  rows: number;
  table_count: number;
  tables: TableRow[];
  bound?: boolean;
}

interface Analytics {
  readQueries: number;
  writeQueries: number;
  rowsRead: number;
  rowsWritten: number;
}

interface RemoteDb {
  uuid: string;
  name: string;
  file_size: number;
  num_tables: number;
  analytics: Analytics | null;
}

interface UsageResp {
  configured: boolean;
  account_id: string;
  local: { main: LocalDb; forum: LocalDb };
  remote?: RemoteDb[];
  remote_error?: string;
  analytics_error?: string;
}

const FREE_STORAGE = 5 * 1024 * 1024 * 1024;
const FREE_ROWS_READ = 5_000_000;
const FREE_ROWS_WRITTEN = 100_000;

const fmtBytes = (n: number) => {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const pct = (used: number, total: number) => {
  if (!used) return 0;
  return Math.min(100, (used / total) * 100);
};

const fmtNum = (n: number) => n.toLocaleString("zh-CN");

export default function AdminD1Page() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api<UsageResp>("/admin/d1-usage");
      setData(res);
      setAccountId((prev) => prev || res.account_id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "D1 用量加载失败");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = async () => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/d1-usage/config", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId.trim(), token: token.trim() }),
      });
      setToken("");
      setSuccess("Cloudflare 用量查询已保存");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const clearToken = async () => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/d1-usage/config", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId.trim(), clear_token: true }),
      });
      setSuccess("已清除 Cloudflare Token");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清除失败");
    } finally {
      setBusy(false);
    }
  };

  const remoteFor = (dbName: string): RemoteDb | undefined =>
    (data?.remote ?? []).find((r) => r.name === dbName || r.uuid === dbName);

  const renderDb = (local: LocalDb, remoteName: string, freeNote: string) => {
    const remote = remoteFor(remoteName);
    const size = remote?.file_size ?? 0;
    const analytics = remote?.analytics;
    const topTables = [...local.tables].sort((a, b) => b.rows - a.rows).slice(0, 8);

    return (
      <Card key={local.name} className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[1.05rem] font-bold text-slate-800">{local.name}</h3>
            <p className="text-[0.78rem] text-slate-400 mt-0.5">{freeNote}</p>
          </div>
          <div className="text-right">
            <div className="text-[1.5rem] font-bold text-slate-800">{fmtBytes(size)}</div>
            <div className="text-[0.75rem] text-slate-400">已用存储 / {fmtBytes(FREE_STORAGE)} 免费额度</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.max(pct(size, FREE_STORAGE), size ? 0.5 : 0)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[0.72rem] text-slate-400">
            <span>存储占用 {pct(size, FREE_STORAGE).toFixed(3)}%</span>
            <span>{local.table_count} 张表 · {fmtNum(local.rows)} 行</span>
          </div>
        </div>

        {analytics ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "24h 读查询", value: fmtNum(analytics.readQueries) },
              { label: "24h 读行数", value: `${fmtNum(analytics.rowsRead)} / ${fmtNum(FREE_ROWS_READ)}` },
              { label: "24h 写查询", value: fmtNum(analytics.writeQueries) },
              { label: "24h 写行数", value: `${fmtNum(analytics.rowsWritten)} / ${fmtNum(FREE_ROWS_WRITTEN)}` },
            ].map((m) => (
              <div key={m.label} className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[0.72rem] text-slate-400">{m.label}</div>
                <div className="mt-0.5 text-[0.9rem] font-semibold text-slate-700">{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.8rem] text-slate-400">未配置 Cloudflare 用量查询，暂只能查看本地表行数。</p>
        )}

        <div className="mt-4">
          <p className="mb-2 text-[0.8rem] font-medium text-slate-600">行数最多的表</p>
          {topTables.length === 0 ? (
            <Empty text="暂无表" />
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {topTables.map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-[8px] bg-slate-50 px-3 py-1.5 text-[0.8rem]">
                  <span className="truncate font-mono text-slate-500">{t.name}</span>
                  <span className="ml-3 flex-shrink-0 font-semibold text-slate-700">{t.rows < 0 ? "—" : fmtNum(t.rows)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <AdminShell>
      <div className="px-6 py-6">
        <PageHeader
          title="D1 用量"
          desc="查看主库与社区库的存储、表行数和近 24 小时读写；免费额度为每库 5 GB 存储、每天 500 万行读、10 万行写。"
        />

        <ErrorNote message={error} />
        <SuccessNote message={success} />
        {data?.remote_error && <ErrorNote message={`Cloudflare 接口：${data.remote_error}`} />}
        {data?.analytics_error && <ErrorNote message={`用量分析：${data.analytics_error}`} />}

        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">Cloudflare 实时数据（可选）</h3>
          <p className="text-[0.8rem] text-slate-400 mb-4">
            填写账户 ID 与只读 API Token 后，可显示数据库大小和 24 小时读写量。Token 需要
            <span className="font-mono text-slate-600"> D1:Read </span>与
            <span className="font-mono text-slate-600"> Account Analytics:Read </span>权限，保存后加密存放。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="账户 ID">
              <Input value={accountId} onChange={(e) => setAccountId(e.target.value.trim())} placeholder="Cloudflare Account ID" />
            </Field>
            <Field label="API Token" hint={data?.configured ? "已保存，留空不修改" : "只读 Token"}>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={data?.configured ? "••••••（留空不修改）" : "粘贴只读 Token"}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Btn onClick={() => void saveConfig()} disabled={busy}>
              {busy ? "保存中..." : "保存并刷新"}
            </Btn>
            <Btn variant="ghost" onClick={() => void load()} disabled={busy}>
              刷新用量
            </Btn>
            {data?.configured && (
              <Btn variant="danger" onClick={() => void clearToken()} disabled={busy}>
                清除 Token
              </Btn>
            )}
          </div>
        </Card>

        {data === null ? (
          <Card>
            <Empty text="正在统计 D1 用量..." />
          </Card>
        ) : (
          <>
            {renderDb(data.local.main, "mc-next", "主库：用户、积分、商城、工单、通知等")}
            {renderDb(
              data.local.forum,
              "westworld-forum",
              data.local.forum.bound ? "社区库：帖子、评论、私信、群聊、举报等" : "未绑定 FORUM_DB，当前回退主库",
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
