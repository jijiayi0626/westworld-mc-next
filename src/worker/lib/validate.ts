// 轻量输入校验
export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidUsername(v: string): boolean {
  // 3-20 位，字母/数字/下划线/中文
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/.test(v);
}

export function isValidPassword(v: string): boolean {
  return v.length >= 6 && v.length <= 64;
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