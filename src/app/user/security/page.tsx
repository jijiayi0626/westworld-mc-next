"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";

interface Binding {
  id: number;
  ms_username: string;
  mc_username: string;
  mc_uuid: string;
}

interface UpopBinding {
  id: number;
  upop_username: string;
  external_id: string;
  bound_at: string;
}

interface UpopStatus {
  enabled: boolean;
  missing: string[];
  callback_url: string;
}

export default function UserSecurityPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [bindings, setBindings] = useState<Binding[] | null>(null);
  const [upopBinding, setUpopBinding] = useState<UpopBinding | null>(null);
  const [upopStatus, setUpopStatus] = useState<UpopStatus | null>(null);

  const loadBindings = useCallback(async () => {
    try {
      // 后端返回单个绑定对象或 null，统一转为数组
      const data = await api<Binding | Binding[] | null>("/user/bindings");
      setBindings(Array.isArray(data) ? data : data ? [data] : []);
    } catch {
      setBindings([]);
    }
  }, []);

  const loadUpop = useCallback(async () => {
    try {
      setUpopStatus(await api<UpopStatus>("/upop/status"));
    } catch {
      setUpopStatus(null);
    }
    try {
      setUpopBinding(await api<UpopBinding | null>("/upop/bindings"));
    } catch {
      setUpopBinding(null);
    }
  }, []);

  useEffect(() => {
    void loadBindings();
    void loadUpop();
    const params = new URLSearchParams(window.location.search);
    if (params.get("upop_bound") === "1") {
      setSuccess("UPOP 账号绑定成功");
      window.history.replaceState(null, "", window.location.pathname);
    } else if (params.get("bound") === "1" || params.get("ms_bound") === "1") {
      setSuccess("微软账号绑定成功");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [loadBindings, loadUpop]);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api("/user/password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      setSuccess("密码已修改，下次登录请使用新密码");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setBusy(false);
    }
  };

  const unbind = async (id: number) => {
    if (!confirm("确定解绑微软账号？")) return;
    setError("");
    setSuccess("");
    try {
      await api("/microsoft/unbind", { method: "POST", body: JSON.stringify({ id }) });
      setSuccess("已解绑");
      await loadBindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "解绑失败");
    }
  };

  const bindMicrosoft = async () => {
    setError("");
    setSuccess("");
    try {
      const data = await api<{ url: string }>("/microsoft/authorize-url");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "微软账号绑定未启用（需管理后台配置 MICROSOFT_CLIENT_ID / SECRET）");
    }
  };

  const bindUpop = async () => {
    setError("");
    setSuccess("");
    try {
      const data = await api<{ url: string }>("/upop/authorize-url");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "UPOP 绑定未启用（需管理员在后台配置 upop_* 参数）");
    }
  };

  const unbindUpop = async () => {
    if (!confirm("确定解绑 UPOP 账号？")) return;
    setError("");
    setSuccess("");
    try {
      await api("/upop/unbind", { method: "POST", body: JSON.stringify({}) });
      setSuccess("已解绑 UPOP 账号");
      await loadUpop();
    } catch (err) {
      setError(err instanceof Error ? err.message : "解绑失败");
    }
  };

  return (
    <UserShell>
      <div className="px-4 py-6">
        <h1 className="text-[1.35rem] font-bold text-slate-900 mb-5">安全中心</h1>

        <ErrorNote message={error} />
        {success && <div className="mb-4"><SuccessNote message={success} /></div>}

        {/* 修改密码 */}
        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">修改密码</h3>
          <form onSubmit={changePassword} className="flex flex-col gap-4 max-w-md">
            <Field label="当前密码">
              <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="输入当前密码" autoComplete="current-password" required />
            </Field>
            <Field label="新密码">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" autoComplete="new-password" required />
            </Field>
            <Field label="确认新密码">
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" autoComplete="new-password" required />
            </Field>
            <div>
              <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "修改密码"}</Btn>
            </div>
          </form>
        </Card>

        {/* 微软账号绑定 */}
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">微软账号绑定</h3>
          <p className="text-[0.85rem] text-slate-500 mb-4 leading-relaxed">绑定微软账号后，可使用正版 Minecraft 账号自动识别游戏 ID（需管理员在后台开启微软 OAuth 并配置客户端凭据）。</p>
          {bindings === null ? (
            <Empty text="加载中..." />
          ) : bindings.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-slate-500 text-[0.88rem]">尚未绑定任何微软账号</p>
              <Btn variant="ghost" onClick={bindMicrosoft}>去绑定微软账号</Btn>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {bindings.map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-slate-800 font-medium">{b.mc_username}</div>
                    <div className="mt-1 text-[0.78rem] text-slate-500 font-mono">{b.ms_username} · {b.mc_uuid}</div>
                  </div>
                  <Btn size="sm" variant="danger" onClick={() => unbind(b.id)}>解绑</Btn>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* UPOP 统一认证绑定（预留接口） */}
        <Card className="mt-5">
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">UPOP 统一认证绑定</h3>
          <p className="text-[0.85rem] text-slate-500 mb-4 leading-relaxed">
            UPOP 统一认证绑定接口已预留。启用后可通过 UPOP 账号快速关联站内身份（需管理员在后台「网站设置 → 三方接口预留」中完成配置）。
          </p>
          {upopBinding ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="text-slate-800 font-medium">{upopBinding.upop_username}</div>
                <div className="mt-1 text-[0.78rem] text-slate-500 font-mono">ID: {upopBinding.external_id}</div>
              </div>
              <Btn size="sm" variant="danger" onClick={unbindUpop}>解绑</Btn>
            </div>
          ) : upopStatus?.enabled ? (
            <Btn variant="ghost" onClick={bindUpop}>绑定 UPOP 账号</Btn>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-[0.85rem] text-slate-500">
              UPOP 绑定暂未启用
              {upopStatus?.missing?.length ? (
                <span className="text-slate-400">（待配置：{upopStatus.missing.join("、")}）</span>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </UserShell>
  );
}