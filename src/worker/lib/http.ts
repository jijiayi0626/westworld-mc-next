// 统一 JSON 响应封装
// headers 用于附加 Set-Cookie 等（注意：裸 Response.json 不会带上 c.header 挂起的头）
export function ok<T>(data: T, status = 200, headers?: Record<string, string>): Response {
  return Response.json({ code: 0, message: "ok", data }, { status, headers });
}

export function fail(message: string, status = 400, code = 1): Response {
  return Response.json({ code, message, data: null }, { status });
}