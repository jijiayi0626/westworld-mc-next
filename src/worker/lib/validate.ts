// 轻量输入校验
export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidUsername(v: string): boolean {
  // 3-20 位，字母/数字/下划线/中文
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/.test(v);
}

export function isValidPassword(v: string): boolean {
  // 8-64 位，且必须同时包含字母和数字（纯数字/纯字母一律拒绝）
  if (v.length < 8 || v.length > 64) return false;
  return /[A-Za-z]/.test(v) && /\d/.test(v);
}

export function isValidPlayerName(v: string): boolean {
  // Minecraft Java 正版名规则（约）：3-16 位，字母/数字/下划线
  return /^[a-zA-Z0-9_]{3,16}$/.test(v);
}

export function isValidUuid(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

export function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** 恒定时间字符串比较：用于签名 / 验证码 / API Key 等敏感值 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}