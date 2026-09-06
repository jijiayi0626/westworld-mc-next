"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import { defaultContent } from "@/lib/content";

type Tab = "login" | "register" | "forgot" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 已登录直接进用户中心
  useEffect(() => {
    if (user) router.replace("/user");
  }, [user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (tab === "login") {
        await login(account.trim(), password);
        router.replace("/user");
      } else if (tab === "register") {
        await register(username.trim(), email.trim(), password);
        router.replace("/user");
      } else {
        const data = await api<{ sent: boolean; devCode?: string }>("/auth/forgot", {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        });
        if (data.devCode) {
          setSuccess(`重置码已生成（邮件未配置，演示模式）：${data.devCode}`);
        } else {
          setSuccess("如果该邮箱已注册，重置邮件已发送（当前邮件未配置，请查看后台日志获取重置码）");
        }
        setTab("reset");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/auth/reset", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), code: code.trim(), new_password: newPassword }),
      });
      setSuccess("密码已重置，请使用新密码登录");
      setTab("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "login", label: "登录" },
    { key: "register", label: "注册" },
    { key: "forgot", label: "找回密码" },
  ];

  const { site } = defaultContent;

  return (
    <section className="py-28 min-h-[80vh] flex items-center justify-center bg-bg-dark relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-30 bg-[radial-gradient(circle_at_20%_30%,rgba(16,185,129,0.25),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(233,30,99,0.15),transparent_40%)]" />
      <div className="container-mc relative z-10 max-w-[460px]">
        <Card className="p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold text-white">{tab === "forgot" ? "找回密码" : site.nav_brand} 账号</h1>
            {tab === "reset" && <p className="mt-1 text-slate-400 text-[0.85rem]">输入邮箱收到的重置码与新密码</p>}
          </div>

          <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-[10px]">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setError("");
                  setSuccess("");
                }}
                className={`flex-1 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all cursor-pointer ${
                  tab === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <ErrorNote message={error} />
          <SuccessNote message={success} />

          {tab === "reset" ? (
            <form className="flex flex-col gap-4 mt-4" onSubmit={handleReset}>
              <Field label="邮箱">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="注册时的邮箱" required />
              </Field>
              <Field label="重置码">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位重置码" maxLength={10} required />
              </Field>
              <Field label="新密码">
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6-64 位" required />
              </Field>
              <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "重置密码"}</Btn>
              <button
                type="button"
                onClick={() => setTab("login")}
                className="text-center text-[0.82rem] text-slate-400 hover:text-accent-emerald cursor-pointer"
              >
                ← 返回登录
              </button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {tab === "login" && (
                <>
                  <Field label="用户名 / 邮箱">
                    <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="输入用户名或邮箱" autoComplete="username" required />
                  </Field>
                  <Field label="密码">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" autoComplete="current-password" required />
                  </Field>
                </>
              )}
              {tab === "register" && (
                <>
                  <Field label="用户名">
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-20 位字母/数字/下划线/中文" autoComplete="username" required />
                  </Field>
                  <Field label="邮箱">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用于找回密码" autoComplete="email" required />
                  </Field>
                  <Field label="密码">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6-64 位" autoComplete="new-password" required />
                  </Field>
                </>
              )}
              {tab === "forgot" && (
                <Field label="注册邮箱" hint="输入邮箱获取重置码，当前邮件服务未配置时页面会直接显示重置码">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="注册时的邮箱" required />
                </Field>
              )}
              <Btn type="submit" disabled={busy}>
                {busy ? "提交中..." : tab === "login" ? "登 录" : tab === "register" ? "注 册" : "获取重置码"}
              </Btn>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-white/10 text-center text-[0.8rem] text-slate-500">
            注册即代表同意遵守服务器规则，请文明游戏
          </div>
        </Card>
        <p className="mt-4 text-center text-[0.8rem] text-slate-500">
          遇到登录问题？<Link href="/contact" className="text-accent-emerald hover:underline">联系我们</Link>
        </p>
      </div>
    </section>
  );
}