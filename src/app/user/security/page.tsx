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

export default function UserSecurityPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [bindings, setBindings] = useState<Binding[] | null>(null);

  const loadBindings = useCallback(async () => {
    try {
      setBindings(await api<Binding[]>("/user/bindings"));
    } catch {
      setBindings([]);
    }
  }, []);

  useEffect(() => {
    void loadBindings();
  }, [loadBindings]);

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
      </div>
    </UserShell>
  );
}