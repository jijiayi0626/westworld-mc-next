"use client";

export interface ApiResp<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const isServer = typeof window === "undefined";

/**
 * 发起 API 请求（同源 /api/*，cookie 自动携带）。
 * worker 统一返回 { code, message, data }，code !== 0 视为业务错误抛出。
 */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (isServer) {
    throw new ApiError("客户端 API 不能在服务端调用", -1, 0);
  }
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("网络请求失败，请稍后重试", -1, 0);
  }
  let body: ApiResp<T>;
  try {
    body = (await res.json()) as ApiResp<T>;
  } catch {
    throw new ApiError(`请求失败（HTTP ${res.status}）`, -1, res.status);
  }
  if (!res.ok || body.code !== 0) {
    throw new ApiError(body.message || `请求失败（HTTP ${res.status}）`, body.code, res.status);
  }
  return body.data;
}

export const get = <T = unknown>(path: string) => api<T>(path);
export const post = <T = unknown>(path: string, data?: unknown) =>
  api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });