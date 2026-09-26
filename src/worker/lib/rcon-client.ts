import net from "node:net";

// Minecraft RCON 协议（Server List Ping 之外的控制通道）
// 包格式：[length int32LE][requestId int32LE][type int32LE][body utf8][0x00 0x00]
// length = 10 + body 字节数（不含 length 自身 4 字节）
// 用 Uint8Array + DataView 而非 Buffer：兼容 worker 环境且不依赖 @types/node 的 Buffer 方法声明

const TYPE_AUTH = 3;
const TYPE_EXEC = 2;
const TYPE_RESPONSE = 0;

const AUTH_OK = -1;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

function encodePacket(requestId: number, type: number, body: string): Uint8Array {
  const bodyBytes = encoder.encode(body);
  const length = bodyBytes.length + 10;
  const buf = new Uint8Array(length + 4);
  const dv = new DataView(buf.buffer);
  dv.setInt32(0, length, true);
  dv.setInt32(4, requestId, true);
  dv.setInt32(8, type, true);
  buf.set(bodyBytes, 12);
  // 末尾 2 字节保持 0x00 0x00
  return buf;
}

function decodePacket(buf: Uint8Array): { length: number; requestId: number; type: number; body: string } | null {
  if (buf.length < 12) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const length = dv.getInt32(0, true);
  if (buf.length < length + 4) return null;
  const requestId = dv.getInt32(4, true);
  const type = dv.getInt32(8, true);
  const body = decoder.decode(buf.subarray(12, 4 + length - 2));
  return { length, requestId, type, body };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

interface PendingReq {
  id: number;
  resolve: (out: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RconClient {
  private sock: net.Socket | null = null;
  private buf: Uint8Array = new Uint8Array(0);
  private requestId = 0;
  private pending = new Map<number, PendingReq>();
  private authed = false;

  constructor(
    private host: string,
    private port: number,
    private password: string,
    private timeoutMs = 5000,
  ) {}

  async connect(): Promise<void> {
    await this.ensureSocket();
    if (!this.authed) {
      await this.auth();
    }
  }

  private ensureSocket(): Promise<void> {
    if (this.sock && !this.sock.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      this.sock = sock;
      this.buf = new Uint8Array(0);
      sock.setTimeout(this.timeoutMs);
      sock.on("connect", () => {
        sock.on("data", (chunk) => this.onData(chunk));
        resolve();
      });
      sock.on("error", (e) => reject(e));
      sock.on("timeout", () => {
        this.failAll(new Error("RCON 连接超时"));
        sock.destroy();
      });
      sock.on("close", () => {
        this.failAll(new Error("RCON 连接已断开"));
        this.authed = false;
      });
    });
  }

  private onData(chunk: Uint8Array) {
    this.buf = concat(this.buf, chunk);
    while (true) {
      const pkt = decodePacket(this.buf);
      if (!pkt) break;
      this.buf = this.buf.subarray(pkt.length + 4);
      const p = this.pending.get(pkt.requestId);
      if (!p) continue;
      clearTimeout(p.timer);
      if (pkt.requestId === AUTH_OK) {
        this.pending.delete(pkt.requestId);
        this.authed = true;
        p.resolve("");
      } else if (pkt.type === TYPE_RESPONSE || pkt.type === TYPE_EXEC) {
        this.pending.delete(pkt.requestId);
        p.resolve(pkt.body.trimEnd());
      } else {
        this.pending.delete(pkt.requestId);
        p.reject(new Error(`RCON 非预期响应类型 ${pkt.type}`));
      }
    }
  }

  private async auth(): Promise<void> {
    await this.exchange(AUTH_OK, TYPE_AUTH, this.password);
  }

  command(cmd: string): Promise<string> {
    return this.exchange(this.nextId(), TYPE_EXEC, cmd);
  }

  private exchange(requestId: number, type: number, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const sock = this.sock;
      if (!sock || sock.destroyed) {
        reject(new Error("RCON 未连接"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("RCON 响应超时"));
      }, this.timeoutMs);
      this.pending.set(requestId, { id: requestId, resolve, reject, timer });
      sock.write(encodePacket(requestId, type, body));
    });
  }

  private nextId(): number {
    this.requestId = this.requestId >= 0x7ffffffe ? 0 : this.requestId + 1;
    return this.requestId;
  }

  private failAll(e: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }

  destroy() {
    this.failAll(new Error("RCON 已关闭"));
    this.sock?.destroy();
    this.sock = null;
    this.authed = false;
  }
}

export default RconClient;