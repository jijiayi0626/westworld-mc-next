"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, SuccessNote, fmtTime } from "@/components/ui";

interface BackupItem {
  key: string;
  filename: string;
  size: number;
  uploaded: string | null;
  mode: string;
}

interface RestoreResult {
  restored: Record<string, number>;
  wiped: string[];
  errors: string[];
  warnings: string[];
}

function fmtSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function AdminBackupPage() {
  const [mode, setMode] = useState<"safe" | "full">("safe");
  const [items, setItems] = useState<BackupItem[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");
  const [lastCounts, setLastCounts] = useState<Record<string, number> | null>(null);

  // 恢复
  const [restoreKey, setRestoreKey] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadText, setUploadText] = useState("");
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: BackupItem[] }>("/backup/admin/list");
      setItems(data.items);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "读取备份列表失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadBlob = async (url: string, fallbackName: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      let message = `下载失败（HTTP ${res.status}）`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* 非 JSON 错误响应 */
      }
      throw new Error(message);
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const name = match?.[1] || fallbackName;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const exportLocal = async () => {
    setError("");
    setSuccess("");
    setBusy("export");
    try {
      await downloadBlob(`/api/backup/admin/export?mode=${mode}`, `mc-next-${mode}.json`);
      setSuccess(`已导出${mode === "full" ? "完整" : "配置"}备份到本地`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy("");
    }
  };

  const createBackup = async () => {
    setError("");
    setSuccess("");
    setLastCounts(null);
    setBusy("create");
    try {
      const data = await api<{ key: string; size: number; counts: Record<string, number>; truncated: string[]; errors: string[] }>(
        "/backup/admin/create",
        { method: "POST", body: JSON.stringify({ mode }) },
      );
      setLastCounts(data.counts);
      const extra = data.truncated.length ? `；${data.truncated.length} 张表超限已截断` : "";
      setSuccess(`备份已保存到 R2：${data.key}（${fmtSize(data.size)}${extra}）`);
      if (data.errors.length) setError(`部分表读取失败：${data.errors.join("；")}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建备份失败");
    } finally {
      setBusy("");
    }
  };

  const downloadSaved = async (item: BackupItem) => {
    setError("");
    setSuccess("");
    setBusy(item.key);
    try {
      await downloadBlob(`/api/backup/admin/download?key=${encodeURIComponent(item.key)}`, item.filename);
      setSuccess(`已下载 ${item.filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setBusy("");
    }
  };

  const removeBackup = async (item: BackupItem) => {
    if (!window.confirm(`确定删除备份 ${item.filename}？删除后不可恢复。`)) return;
    setError("");
    setSuccess("");
    setBusy(item.key);
    try {
      await api("/backup/admin/delete", { method: "POST", body: JSON.stringify({ key: item.key }) });
      setSuccess(`已删除 ${item.filename}`);
      if (restoreKey === item.key) setRestoreKey("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy("");
    }
  };

  const pickFile = async (file: File | null) => {
    setError("");
    setSuccess("");
    setRestoreResult(null);
    if (!file) {
      setUploadName("");
      setUploadText("");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("备份文件超过 20MB 限制");
      return;
    }
    try {
      const text = await file.text();
      JSON.parse(text);
      setUploadName(file.name);
      setUploadText(text);
      setRestoreKey("");
    } catch {
      setUploadName("");
      setUploadText("");
      setError("所选文件不是合法 JSON 备份");
    }
  };

  const restore = async () => {
    if (confirmText !== "RESTORE") {
      setError("请输入 RESTORE 确认恢复操作");
      return;
    }
    if (!restoreKey && !uploadText) {
      setError("请选择已保存的备份或上传备份文件");
      return;
    }
    const target = restoreKey || uploadName;
    if (!window.confirm(`将用「${target}」覆盖导入数据${wipe ? "，并先清空所选数据表" : ""}。确定继续？`)) return;
    setError("");
    setSuccess("");
    setRestoreResult(null);
    setBusy("restore");
    try {
      const body = restoreKey
        ? JSON.stringify({ key: restoreKey, confirm: "RESTORE", wipe })
        : JSON.stringify({ backup: JSON.parse(uploadText), confirm: "RESTORE", wipe });
      const data = await api<RestoreResult>("/backup/admin/restore", { method: "POST", body });
      setRestoreResult(data);
      const total = Object.values(data.restored).reduce((a, b) => a + b, 0);
      setSuccess(`恢复完成，共写入 ${total} 行`);
      if (data.errors.length) setError(`部分表恢复失败：${data.errors.join("；")}`);
      setConfirmText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setBusy("");
    }
  };

  return (
    <AdminShell>
      <PageHeader title="数据备份" desc="导出站点数据库快照，保存到 R2 或从备份恢复" />

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card className="mb-5">
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">创建备份</h3>
        <p className="text-[0.8rem] text-slate-400 mb-4">
          「配置备份」仅包含站点内容、商品、服务器等可公开配置并自动抹除密钥；「完整备份」包含用户、订单、工单等全部数据，
          内含密码哈希与绑定信息，请妥善保管。
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="备份模式">
            <Select value={mode} onChange={(e) => setMode(e.target.value === "full" ? "full" : "safe")} className="w-[220px]">
              <option value="safe">配置备份（不含用户与密钥）</option>
              <option value="full">完整备份（包含全部数据）</option>
            </Select>
          </Field>
          <Btn onClick={exportLocal} disabled={!!busy} variant="ghost">{busy === "export" ? "导出中..." : "下载到本地"}</Btn>
          <Btn onClick={createBackup} disabled={!!busy}>{busy === "create" ? "备份中..." : "备份并保存到 R2"}</Btn>
        </div>
        {mode === "full" && (
          <div className="mt-3 px-4 py-2.5 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-[0.82rem]">
            完整备份包含敏感数据，请勿上传到公开渠道或提交进代码仓库。
          </div>
        )}
        {lastCounts && (
          <div className="mt-3 text-[0.8rem] text-slate-500 break-words">
            本次行数：{Object.entries(lastCounts).map(([k, v]) => `${k} ${v}`).join(" · ") || "无数据"}
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-[1.05rem] font-bold text-slate-800">R2 中的备份</h3>
          <Btn size="sm" variant="ghost" onClick={() => void load()} disabled={!!busy}>刷新</Btn>
        </div>
        {items === null ? (
          <Empty text="加载中..." />
        ) : items.length === 0 ? (
          <Empty text="暂无已保存的备份" />
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.key} className="py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[0.88rem] text-slate-800 font-medium break-all">{item.filename}</div>
                  <div className="text-[0.76rem] text-slate-400 mt-0.5">
                    {fmtSize(item.size)} · {fmtTime(item.uploaded)}
                    {item.mode && <Badge color={item.mode === "full" ? "yellow" : "blue"}>{item.mode === "full" ? "完整" : "配置"}</Badge>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => downloadSaved(item)} disabled={!!busy}>
                    {busy === item.key ? "处理中..." : "下载"}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      setRestoreKey(item.key);
                      setUploadName("");
                      setUploadText("");
                      setConfirmText("");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    disabled={!!busy}
                  >
                    选为恢复源
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => removeBackup(item)} disabled={!!busy}>删除</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-1">恢复数据</h3>
        <p className="text-[0.8rem] text-slate-400 mb-4">
          恢复会按备份中的表执行 INSERT OR REPLACE；勾选「先清空数据表」会删除所选表现有数据，请务必先另行备份。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="从 R2 备份恢复" hint={restoreKey ? `已选择：${restoreKey.slice("backups/".length)}` : "在上方列表点击「选为恢复源」"}>
            <Input value={restoreKey} onChange={(e) => { setRestoreKey(e.target.value); setUploadName(""); setUploadText(""); }} placeholder="backups/mc-next-safe-....json" />
          </Field>
          <Field label="或上传备份文件" hint={uploadName ? `已选择：${uploadName}` : "仅支持本系统导出的 JSON，最大 20MB"}>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[0.85rem] text-slate-500 file:mr-3 file:px-3 file:py-2 file:rounded-[8px] file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="确认口令" hint="输入大写 RESTORE 后才能执行">
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" className="w-[180px]" />
          </Field>
          <label className="flex items-center gap-2 text-[0.85rem] text-red-600 pb-2.5">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            先清空数据表
          </label>
          <Btn variant="danger" onClick={restore} disabled={!!busy || confirmText !== "RESTORE" || (!restoreKey && !uploadText)}>
            {busy === "restore" ? "恢复中..." : "开始恢复"}
          </Btn>
        </div>

        {restoreResult && (
          <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 p-4 text-[0.82rem] text-slate-600">
            <div className="font-semibold text-slate-700 mb-2">恢复结果</div>
            <div className="break-words">
              {Object.entries(restoreResult.restored).map(([k, v]) => `${k}: ${v} 行`).join(" · ") || "没有写入任何数据"}
            </div>
            {restoreResult.wiped.length > 0 && <div className="mt-1 text-amber-700">已清空：{restoreResult.wiped.join("、")}</div>}
            {restoreResult.warnings.length > 0 && <div className="mt-1 text-amber-700">提示：{restoreResult.warnings.join("；")}</div>}
            {restoreResult.errors.length > 0 && <div className="mt-1 text-red-600">错误：{restoreResult.errors.join("；")}</div>}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
