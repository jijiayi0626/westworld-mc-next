// AES-256-GCM 加解密：RCON 密码等敏感配置的安全存储
// 密钥由 APP_SECRET 通过 PBKDF2 派生，加密串格式 enc:v1:iv:tag:cipher（base64）

const PREFIX = "enc:v1";

function bytesToBase64(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("mc-next:rcon-secret:v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plain: string, appSecret: string): Promise<string> {
  if (!plain) return "";
  const key = await deriveKey(appSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  const tag = cipher.slice(cipher.byteLength - 16);
  const body = cipher.slice(0, cipher.byteLength - 16);
  return `${PREFIX}:${bytesToBase64(iv)}:${bytesToBase64(tag)}:${bytesToBase64(body)}`;
}

export async function decryptSecret(stored: string, appSecret: string): Promise<string> {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return stored; // 旧明文兜底
  try {
    const key = await deriveKey(appSecret);
    const ivBytes = base64ToBytes(parts[1]);
    const ivBuf = new ArrayBuffer(ivBytes.length);
    new Uint8Array(ivBuf).set(ivBytes);
    const tag = base64ToBytes(parts[2]);
    const body = base64ToBytes(parts[3]);
    const combined = new Uint8Array(body.length + tag.length);
    combined.set(body, 0);
    combined.set(tag, body.length);
    const combinedBuf = new ArrayBuffer(combined.length);
    new Uint8Array(combinedBuf).set(combined);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuf },
      key,
      combinedBuf,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}