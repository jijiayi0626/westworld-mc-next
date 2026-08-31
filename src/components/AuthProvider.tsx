"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";

export interface Me {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  avatar: string | null;
  bio: string;
  created_at: string;
  last_login_at: string | null;
  last_login_ip: string;
  mc_username: string | null;
  mc_uuid: string | null;
}

interface AuthCtx {
  user: Me | null;
  loading: boolean;
  /** 网络/服务器错误（不同于「未登录」），供页面提示重试 */
  error: string | null;
  refresh: () => Promise<void>;
  login: (account: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth 必须在 <AuthProvider> 内使用");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>("/user/me");
      setUser(me);
      setError(null);
    } catch (e) {
      setUser(null);
      if (e instanceof ApiError && e.status === 401) {
        setError(null); // 未登录是正常态
      } else {
        setError(e instanceof Error ? e.message : "获取登录状态失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (account: string, password: string) => {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ account, password }) });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // 忽略，前端无论如何都清除本地态
    }
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, error, refresh, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}