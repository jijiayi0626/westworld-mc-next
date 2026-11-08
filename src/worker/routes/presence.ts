import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth } from "../lib/auth";
import { ok } from "../lib/http";
import { str } from "../lib/validate";
import {
  heartbeatPresence,
  normalizePresenceStatus,
  presenceDb,
  presenceMap,
  setPresence,
} from "../lib/presence";

const app = new Hono<AppEnv>();

app.use("*", requireAuth);

// 心跳：刷新在线时间，返回当前状态
app.post("/heartbeat", async (c) => {
  const user = c.get("user")!;
  return ok(await heartbeatPresence(presenceDb(c.env), user.id));
});

// 设置在线状态与个性文案
app.post("/status", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const status = normalizePresenceStatus(body.status);
  const text = str(body.text, 30).trim();
  return ok(await setPresence(presenceDb(c.env), user.id, status, text));
});

// 批量查询在线状态：/api/presence?ids=1,2,3
app.get("/", async (c) => {
  const raw = String(c.req.query("ids") || "");
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()) || 0)
    .filter((n) => n > 0)
    .slice(0, 100);
  const map = await presenceMap(presenceDb(c.env), ids);
  return ok({
    items: ids.map((id) => ({ user_id: id, ...(map.get(id) || { status: "online", text: "", online: false, last_seen: 0 }) })),
  });
});

export default app;
