import { Hono } from "hono";
import type { AppEnv } from "../lib/auth";
import { requireAuth, requireAdmin } from "../lib/auth";
import { ok, fail } from "../lib/http";
import { logOp } from "../lib/log";

const app = new Hono<AppEnv>();

const BACKUP_PREFIX = "backups/";
const BACKUP_VERSION = 1;
const MAX_ROWS_PER_TABLE = 20000;
const PAGE_SIZE = 500;
const MAX_RESTORE_BYTES = 20 * 1024 * 1024;
const BACKUP_APP = "mc-next";

interface TableDef {
  name: string;
  /** 配置内容备份是否包含 */
  safe: boolean;
}

/**
 * 备份表白名单（顺序即导出顺序）。
 * 不包含 rate_limits 这类短生命周期数据；其余核心表均可全量导出。
 */
const DB_TABLES: TableDef[] = [
  { name: "users", safe: false },
  { name: "user_logs", safe: false },
  { name: "notifications", safe: false },
  { name: "site_content", safe: true },
  { name: "site_settings", safe: true },
  { name: "announcements", safe: true },
  { name: "contact_messages", safe: false },
  { name: "support_tickets", safe: false },
  { name: "support_ticket_replies", safe: false },
  { name: "whitelist_applications", safe: false },
  { name: "ai_conversations", safe: false },
  { name: "ai_conversation_messages", safe: false },
  { name: "ai_usage", safe: false },
  { name: "shop_products", safe: true },
  { name: "shop_orders", safe: false },
  { name: "game_servers", safe: true },
  { name: "ip_blacklist", safe: false },
  { name: "op_logs", safe: false },
  { name: "microsoft_bindings", safe: false },
  { name: "upop_bindings", safe: false },
  { name: "chat_messages", safe: false },
  { name: "image_meta", safe: true },
];

const FORUM_TABLES: TableDef[] = [
  { name: "forum_posts", safe: true },
  { name: "forum_replies", safe: true },
  { name: "forum_likes", safe: false },
  { name: "chat_messages", safe: false },
];

/** 配置内容备份中需要抹掉的敏感 settings key */
function isSecretSettingKey(key: string): boolean {
  return /(secret|api[_-]?key|token|password|passwd|smtp|mail_config|ai_config|ai_providers|ms_oauth|rainyun|epay|reset_code|turnstile)/i.test(
    key,
  );
}

function qi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

interface BackupTable {
  rows: Record<string, unknown>[];
  truncated: boolean;
  error?: string;
}

async function readTable(db: D1Database, table: string): Promise<BackupTable> {
  const rows: Record<string, unknown>[] = [];
  try {
    for (let offset = 0; rows.length < MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
      const { results } = await db
        .prepare(`SELECT * FROM ${qi(table)} LIMIT ? OFFSET ?`)
        .bind(PAGE_SIZE, offset)
        .all<Record<string, unknown>>();
      rows.push(...results);
      if (results.length < PAGE_SIZE) {
        return { rows, truncated: false };
      }
    }
    return { rows: rows.slice(0, MAX_ROWS_PER_TABLE), truncated: true };
  } catch (e) {
    return { rows: [], truncated: false, error: e instanceof Error ? e.message : "读取失败" };
  }
}

function sanitizeSafeRows(table: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (table !== "site_settings") return rows;
  return rows
    .filter((r) => !isSecretSettingKey(String(r.key ?? "")))
    .map((r) => ({ ...r }));
}

async function buildBackup(env: AppEnv["Bindings"], mode: "full" | "safe") {
  const dbTables: Record<string, Record<string, unknown>[]> = {};
  const dbCounts: Record<string, number> = {};
  const truncated: string[] = [];
  const errors: string[] = [];

  for (const t of DB_TABLES) {
    if (mode === "safe" && !t.safe) continue;
    const data = await readTable(env.DB, t.name);
    if (data.error) {
      errors.push(`${t.name}: ${data.error}`);
      continue;
    }
    const rows = mode === "safe" ? sanitizeSafeRows(t.name, data.rows) : data.rows;
    dbTables[t.name] = rows;
    dbCounts[t.name] = rows.length;
    if (data.truncated) truncated.push(t.name);
  }

  let forum: { tables: Record<string, Record<string, unknown>[]>; counts: Record<string, number> } | null = null;
  if (env.FORUM_DB) {
    const ft: Record<string, Record<string, unknown>[]> = {};
    const fc: Record<string, number> = {};
    for (const t of FORUM_TABLES) {
      if (mode === "safe" && !t.safe) continue;
      const data = await readTable(env.FORUM_DB, t.name);
      if (data.error) {
        errors.push(`forum.${t.name}: ${data.error}`);
        continue;
      }
      ft[t.name] = data.rows;
      fc[t.name] = data.rows.length;
      if (data.truncated) truncated.push(`forum.${t.name}`);
    }
    forum = { tables: ft, counts: fc };
  }

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    mode,
    counts: dbCounts,
    tables: dbTables,
    forum,
    truncated,
    errors,
  };
}

function backupJson(backup: unknown): string {
  return JSON.stringify(backup);
}

function backupFilename(mode: string, createdAt: string): string {
  const stamp = createdAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `mc-next-${mode}-${stamp}.json`;
}

function safeKey(key: string): string {
  return key.startsWith(BACKUP_PREFIX) && !key.includes("..") ? key : "";
}

app.use("/admin/*", requireAuth, requireAdmin);

// 直接下载备份（不落 R2）
app.get("/admin/export", async (c) => {
  const mode = c.req.query("mode") === "full" ? "full" : "safe";
  const backup = await buildBackup(c.env, mode);
  const json = backupJson(backup);
  const filename = backupFilename(mode, String(backup.created_at));
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

// 生成并保存到 R2
app.post("/admin/create", async (c) => {
  const admin = c.get("user")!;
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定，无法保存备份", 503);
  const body = await c.req.json().catch(() => ({}));
  const mode = body.mode === "full" ? "full" : "safe";
  const backup = await buildBackup(c.env, mode);
  const json = backupJson(backup);
  const filename = backupFilename(mode, String(backup.created_at));
  const key = `${BACKUP_PREFIX}${filename}`;
  await bucket.put(key, json, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { app: BACKUP_APP, mode, created_at: String(backup.created_at) },
  });
  await logOp(c.env.DB, c, admin.id, "backup_create", key, `${mode} ${json.length} bytes`);
  return ok({
    key,
    filename,
    size: json.length,
    mode,
    created_at: backup.created_at,
    counts: backup.counts,
    truncated: backup.truncated,
    errors: backup.errors,
  });
});

// 已保存的备份列表
app.get("/admin/list", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const listed = await bucket.list({ prefix: BACKUP_PREFIX, limit: 100, include: ["customMetadata"] });
  const items = listed.objects
    .map((o) => ({
      key: o.key,
      filename: o.key.slice(BACKUP_PREFIX.length),
      size: o.size,
      uploaded: o.uploaded?.toISOString() ?? null,
      mode: o.customMetadata?.mode || "",
      created_at: o.customMetadata?.created_at || "",
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  return ok({ items, truncated: listed.truncated });
});

// 下载已保存的备份
app.get("/admin/download", async (c) => {
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const key = safeKey(c.req.query("key") || "");
  if (!key) return fail("非法备份路径");
  const obj = await bucket.get(key);
  if (!obj) return fail("备份不存在", 404);
  const filename = key.slice(BACKUP_PREFIX.length);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

// 删除备份
app.post("/admin/delete", async (c) => {
  const admin = c.get("user")!;
  const bucket = c.env.ASSETS;
  if (!bucket) return fail("R2 未绑定", 503);
  const body = await c.req.json().catch(() => ({}));
  const key = safeKey(String(body.key || ""));
  if (!key) return fail("非法备份路径");
  await bucket.delete(key);
  await logOp(c.env.DB, c, admin.id, "backup_delete", key);
  return ok({ deleted: true });
});

interface RestoreResult {
  restored: Record<string, number>;
  wiped: string[];
  errors: string[];
  warnings: string[];
}

async function restoreTables(
  db: D1Database,
  input: unknown,
  allowed: TableDef[],
  wipe: boolean,
  label: string,
  result: RestoreResult,
): Promise<void> {
  if (!input || typeof input !== "object") return;
  const tables = input as Record<string, unknown>;
  const allowedNames = new Set(allowed.map((t) => t.name));

  for (const [table, value] of Object.entries(tables)) {
    if (!allowedNames.has(table)) {
      result.warnings.push(`跳过未知表 ${label}.${table}`);
      continue;
    }
    if (!Array.isArray(value)) {
      result.warnings.push(`跳过格式错误的表 ${label}.${table}`);
      continue;
    }
    if (value.length > MAX_ROWS_PER_TABLE) {
      result.warnings.push(`${label}.${table} 超过 ${MAX_ROWS_PER_TABLE} 行，已截断`);
    }
    const rows = (value as unknown[]).slice(0, MAX_ROWS_PER_TABLE).filter(
      (r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r),
    );

    try {
      const info = await db.prepare(`PRAGMA table_info(${qi(table)})`).all<{ name: string }>();
      const columns = (info.results ?? []).map((r) => String(r.name));
      if (columns.length === 0) {
        result.warnings.push(`表 ${label}.${table} 不存在，已跳过`);
        continue;
      }
      const columnSet = new Set(columns);
      if (wipe) {
        await db.prepare(`DELETE FROM ${qi(table)}`).run();
        result.wiped.push(`${label}.${table}`);
      }

      let count = 0;
      for (let i = 0; i < rows.length; i += 20) {
        const chunk = rows.slice(i, i + 20);
        const stmts: D1PreparedStatement[] = [];
        for (const row of chunk) {
          const cols = Object.keys(row).filter((k) => columnSet.has(k));
          if (cols.length === 0) continue;
          const sql = `INSERT OR REPLACE INTO ${qi(table)} (${cols.map(qi).join(", ")}) VALUES (${cols
            .map(() => "?")
            .join(", ")})`;
          stmts.push(
            db
              .prepare(sql)
              .bind(...cols.map((k) => (row[k] === undefined ? null : row[k]))),
          );
        }
        if (stmts.length) {
          await db.batch(stmts);
          count += stmts.length;
        }
      }
      result.restored[`${label}.${table}`] = count;
    } catch (e) {
      result.errors.push(`${label}.${table}: ${e instanceof Error ? e.message : "恢复失败"}`);
    }
  }
}

app.post("/admin/restore", async (c) => {
  const admin = c.get("user")!;
  const raw = await c.req.text();
  if (!raw) return fail("请求内容为空");
  if (raw.length > MAX_RESTORE_BYTES) return fail("备份文件超过 20MB 限制", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail("备份内容不是合法 JSON");
  }
  if (body.confirm !== "RESTORE") return fail("请输入 RESTORE 确认恢复操作");
  const wipe = body.wipe === true;

  let backup: Record<string, unknown>;
  if (body.key) {
    const bucket = c.env.ASSETS;
    if (!bucket) return fail("R2 未绑定", 503);
    const key = safeKey(String(body.key));
    if (!key) return fail("非法备份路径");
    const obj = await bucket.get(key);
    if (!obj) return fail("备份不存在", 404);
    try {
      backup = (await obj.json()) as Record<string, unknown>;
    } catch {
      return fail("备份文件不是合法 JSON");
    }
  } else if (body.backup && typeof body.backup === "object") {
    backup = body.backup as Record<string, unknown>;
  } else {
    backup = body;
  }

  if (backup.app !== BACKUP_APP) return fail("备份来源不匹配（需要 mc-next 备份）");
  if (Number(backup.version) !== BACKUP_VERSION) return fail("备份版本不受支持");
  const mode = backup.mode === "full" ? "full" : "safe";

  const result: RestoreResult = { restored: {}, wiped: [], errors: [], warnings: [] };
  await restoreTables(c.env.DB, backup.tables, DB_TABLES, wipe, "db", result);
  if (backup.forum && typeof backup.forum === "object") {
    const forumTables = (backup.forum as Record<string, unknown>).tables;
    if (!c.env.FORUM_DB) {
      result.warnings.push("未绑定 FORUM_DB，论坛数据未恢复");
    } else {
      await restoreTables(c.env.FORUM_DB, forumTables, FORUM_TABLES, wipe, "forum", result);
    }
  }

  await logOp(
    c.env.DB,
    c,
    admin.id,
    "backup_restore",
    `${mode}${wipe ? " wipe" : ""}`,
    `${Object.values(result.restored).reduce((a, b) => a + b, 0)} rows`,
  );
  return ok(result);
});

export default app;
