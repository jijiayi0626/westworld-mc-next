"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

type Tab = "login" | "register" | "forgot" | "reset";

// 原版 FoxMC 登录页样式（admin/login.css）：浅色渐变背景 + 白卡片 + 绿 Logo + 全宽绿按钮

function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4H20V20H4V4Z" />
      <path d="M4 12H20" />
      <path d="M12 4V20" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

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

  const title = tab === "forgot" ? "找回密码" : tab === "register" ? "注册用户中心" : "Westworld 用户中心";

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <LogoIcon />
            </div>
            <h1>{title}</h1>
            <p>{tab === "register" ? "请填写真实有效的邮箱和游戏 ID" : tab === "reset" ? "输入邮箱收到的重置码与新密码" : "登录后进入用户中心 / 管理后台"}</p>
          </div>

          {error && <div className="login-error">{error}</div>}
          {success && (
            <div className="px-4 py-3 rounded-[12px] mb-6 text-center text-[0.88rem] bg-emerald-50 border border-emerald-200 text-emerald-700">
              {success}
            </div>
          )}

          <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-[10px]">
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
                  tab === t.key ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "reset" ? (
            <form className="login-form flex flex-col" onSubmit={handleReset}>
              <div className="form-group">
                <label>邮箱</label>
                <div className="input-wrap">
                  <MailIcon />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="注册时的邮箱" required />
                </div>
              </div>
              <div className="form-group">
                <label>重置码</label>
                <div className="input-wrap">
                  <LockIcon />
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位重置码" maxLength={10} required />
                </div>
              </div>
              <div className="form-group">
                <label>新密码</label>
                <div className="input-wrap">
                  <LockIcon />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6-64 位" required />
                </div>
              </div>
              <button type="submit" className="login-btn" disabled={busy}>{busy ? "提交中..." : "重置密码"}</button>
              <div className="login-footer">
                <button type="button" onClick={() => setTab("login")} className="bg-transparent border-none text-slate-400 hover:text-emerald-600 cursor-pointer text-[0.85rem]">
                  ← 返回登录
                </button>
              </div>
            </form>
          ) : (
            <form className="login-form flex flex-col" onSubmit={handleSubmit}>
              {tab === "login" && (
                <>
                  <div className="form-group">
                    <label>用户名 / 邮箱</label>
                    <div className="input-wrap">
                      <UserIcon />
                      <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="请输入账号" autoComplete="username" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>登录密码</label>
                    <div className="input-wrap">
                      <LockIcon />
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" required />
                    </div>
                  </div>
                </>
              )}
              {tab === "register" && (
                <>
                  <div className="form-group">
                    <label>用户名</label>
                    <div className="input-wrap">
                      <UserIcon />
                      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-20 位字母/数字/下划线/中文" autoComplete="username" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>邮箱</label>
                    <div className="input-wrap">
                      <MailIcon />
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>密码</label>
                    <div className="input-wrap">
                      <LockIcon />
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6-64 位" autoComplete="new-password" required />
                    </div>
                  </div>
                </>
              )}
              {tab === "forgot" && (
                <div className="form-group">
                  <label>注册邮箱</label>
                  <div className="input-wrap">
                    <MailIcon />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="输入注册邮箱获取重置码" required />
                  </div>
                </div>
              )}
              <button type="submit" className="login-btn" disabled={busy}>
                {busy ? "提交中..." : tab === "login" ? "登录" : tab === "register" ? "创建账号" : "获取重置码"}
              </button>
            </form>
          )}

          <div className="login-footer">
            <div className="flex items-center justify-between text-[0.82rem]">
              <Link href="/contact" className="text-slate-400 hover:text-emerald-600">忘记密码？</Link>
              <Link href="/" className="text-slate-400 hover:text-emerald-600">返回网站首页</Link>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-slate-400 text-[0.78rem]">
              注册即代表同意遵守服务器规则，请文明游戏
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}