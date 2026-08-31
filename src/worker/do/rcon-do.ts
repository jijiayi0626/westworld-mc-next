import { RconClient } from "../lib/rcon-client";

// 请求体：与 routes/rcon.ts 传入的字段一致
interface RconCommandRequest {
  host: string;
  port: number;
  password: string;
  command: string;
}

// 连接缓存：同一实例内按 (host,port,password) 复用 TCP 连接，避免每次命令重连
export class RconDO implements DurableObject {
  private key = "";
  private client: RconClient | null = null;

  // Cloudflare 运行时以 (ctx, env) 构造；本类不依赖 state，无需保存
  async fetch(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as RconCommandRequest;
    const { host, port, password, command } = body;
    if (!host || !port || !command) {
      return Response.json({ ok: false, message: "参数不完整" }, { status: 400 });
    }
    const key = `${host}:${port}:${password}`;
    if (key !== this.key || !this.client) {
      this.client?.destroy();
      this.client = new RconClient(host, port, password);
      this.key = key;
    }
    try {
      await this.client.connect();
      const output = await this.client.command(command);
      return Response.json({ ok: true, output });
    } catch (e) {
      this.client?.destroy();
      this.client = null;
      this.key = "";
      return Response.json({ ok: false, message: (e as Error).message }, { status: 502 });
    }
  }
}
