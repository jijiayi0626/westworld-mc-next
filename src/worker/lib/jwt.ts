// JWT (HS256) — 用 Web Crypto 实现，无外部依赖
const encoder = new TextEncoder();

function b64url(input: string | ArrayBuffer | Uint8Array): string {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  let bin = "";
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → 字节；非法输入返回 null（atob 对长度/字符不合法会直接抛错） */
function b64urlToBytes(input: string): Uint8Array | null {
  try {
    const pad = input.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function b64urlDecode(input: string): string | null {
  // 先解出原始字节（可能含 UTF-8 中文），再按 UTF-8 解码，避免中文用户名/昵称乱码
  const bytes = b64urlToBytes(input);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
  /** 可选的唯一标识（如 OAuth state 的一次性 jti） */
  jti?: string;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  ttlHours = 168,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat: now, exp: now + ttlHours * 3600 };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadB64 = b64url(JSON.stringify(body));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payloadB64}`));
  return `${header}.${payloadB64}.${b64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payloadB64, sigB64] = parts;
  const sigBytes = b64urlToBytes(sigB64);
  if (!sigBytes || sigBytes.length === 0) return null;
  // 复制到独立 ArrayBuffer，满足 Web Crypto 对 BufferSource 的类型要求
  const sig = new Uint8Array(sigBytes);

  // 签名校验失败或密钥异常一律视为无效令牌：不能让畸形输入冒泡成 500
  let valid = false;
  try {
    const key = await importKey(secret);
    valid = await crypto.subtle.verify("HMAC", key, sig, encoder.encode(`${header}.${payloadB64}`));
  } catch {
    return null;
  }
  if (!valid) return null;

  const decoded = b64urlDecode(payloadB64);
  if (!decoded) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}