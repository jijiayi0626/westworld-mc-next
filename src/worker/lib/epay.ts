// ============================================================
// 易支付（Epay 通用协议）对接
// 配置存放在 site_settings.pay_epay：
// { enabled, api_url, pid, key, types: ["alipay","wxpay","qqpay"], sitename }
// 签名规则：参数按键名升序拼接 k=v&...，末尾直接拼商户密钥后取 MD5
// ============================================================

import { timingSafeEqual } from "./validate";

export interface EpayConfig {
  enabled: boolean;
  api_url: string;
  pid: string;
  key: string;
  types: string[];
  sitename: string;
}

export const EPAY_TYPES: { key: string; label: string }[] = [
  { key: "alipay", label: "支付宝" },
  { key: "wxpay", label: "微信支付" },
  { key: "qqpay", label: "QQ 钱包" },
];

const DEFAULT_EPAY: EpayConfig = {
  enabled: false,
  api_url: "",
  pid: "",
  key: "",
  types: ["alipay", "wxpay", "qqpay"],
  sitename: "Westworld西域之光",
};

export async function loadEpayConfig(db: D1Database): Promise<EpayConfig> {
  const row = await db
    .prepare("SELECT value FROM site_settings WHERE key = 'pay_epay'")
    .first<{ value: string }>();
  if (!row?.value) return { ...DEFAULT_EPAY, types: [...DEFAULT_EPAY.types] };
  try {
    const parsed = JSON.parse(row.value) as Partial<EpayConfig>;
    return {
      enabled: parsed.enabled === true,
      api_url: String(parsed.api_url ?? "").trim(),
      pid: String(parsed.pid ?? "").trim(),
      key: String(parsed.key ?? ""),
      types: Array.isArray(parsed.types) && parsed.types.length > 0
        ? parsed.types.filter((t) => EPAY_TYPES.some((x) => x.key === t))
        : [...DEFAULT_EPAY.types],
      sitename: String(parsed.sitename ?? DEFAULT_EPAY.sitename).slice(0, 60),
    };
  } catch {
    return { ...DEFAULT_EPAY, types: [...DEFAULT_EPAY.types] };
  }
}

export function epayEnabled(cfg: EpayConfig): boolean {
  return cfg.enabled && !!cfg.api_url && !!cfg.pid && !!cfg.key;
}

/** 对外安全视图（不回传密钥） */
export function publicEpay(cfg: EpayConfig) {
  return {
    enabled: cfg.enabled,
    api_url: cfg.api_url,
    pid: cfg.pid,
    key_set: !!cfg.key,
    types: cfg.types,
    sitename: cfg.sitename,
    configured: epayEnabled(cfg),
  };
}

// ---------------- MD5（Workers 无内置，纯 JS 实现） ----------------

function toUtf8Bytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function md5(input: string): string {
  const bytes = toUtf8Bytes(input);
  const bitLen = bytes.length * 8;
  const withPad = bytes.slice();
  withPad.push(0x80);
  while (withPad.length % 64 !== 56) withPad.push(0);
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 4294967296) >>> 0;
  for (let i = 0; i < 4; i++) withPad.push((lo >>> (i * 8)) & 0xff);
  for (let i = 0; i < 4; i++) withPad.push((hi >>> (i * 8)) & 0xff);

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Array<number>(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  for (let off = 0; off < withPad.length; off += 64) {
    const M = new Array<number>(16);
    for (let i = 0; i < 16; i++) {
      const p = off + i * 4;
      M[i] = withPad[p] | (withPad[p + 1] << 8) | (withPad[p + 2] << 16) | (withPad[p + 3] << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const tmp = D;
      D = C;
      C = B;
      B = (B + rotl((A + F + K[i] + M[g]) >>> 0, S[i])) >>> 0;
      A = tmp;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const hex = (n: number) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/** 待签名串：过滤 sign / sign_type / 空值，按键名升序 */
function signSource(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

export function epaySign(params: Record<string, string>, key: string): string {
  return md5(signSource(params) + key);
}

export function verifyEpaySign(params: Record<string, string>, key: string): boolean {
  const got = (params.sign || "").toLowerCase();
  if (!got) return false;
  return timingSafeEqual(epaySign(params, key).toLowerCase(), got);
}

export interface EpayCreateInput {
  type: string;
  orderNo: string;
  name: string;
  money: number;
  notifyUrl: string;
  returnUrl: string;
}

/** 生成跳转支付地址（submit.php?参数） */
export function buildEpayPayUrl(cfg: EpayConfig, input: EpayCreateInput): string {
  const params: Record<string, string> = {
    pid: cfg.pid,
    type: input.type,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.name.slice(0, 100),
    money: input.money.toFixed(2),
    sitename: cfg.sitename,
  };
  params.sign = epaySign(params, cfg.key);
  params.sign_type = "MD5";

  const base = cfg.api_url.replace(/\/+$/, "");
  const query = new URLSearchParams(params).toString();
  return `${base}/submit.php?${query}`;
}

/** 异步通知校验：必须 TRADE_SUCCESS，金额一致 */
export function verifyEpayNotify(
  params: Record<string, string>,
  cfg: EpayConfig,
  expectedMoney: number,
): { ok: boolean; reason?: string } {
  if (!verifyEpaySign(params, cfg.key)) return { ok: false, reason: "签名校验失败" };
  if (params.trade_status !== "TRADE_SUCCESS") return { ok: false, reason: "交易未成功" };
  const money = Number(params.money);
  if (!Number.isFinite(money) || Math.abs(money - expectedMoney) > 0.011) {
    return { ok: false, reason: "金额不一致" };
  }
  return { ok: true };
}
