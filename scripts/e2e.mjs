// 端到端逻辑验证：node:sqlite 模拟 D1 + 真实 Hono app.fetch
// 用法：node e2e.mjs
const { DatabaseSync } = await import("node:sqlite");
const fs = await import("node:fs");

// 1. 用 schema.sql 建内存库
const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync("/root/workspace/mc-next/src/worker/db/schema.sql", "utf-8"));

// 2. mock D1 接口：prepare().bind() → { first/all/run }
// 兼容两种调用：prepare(sql).all()（无参）与 prepare(sql).bind(...).run()（带参）
function wrap(stmt, args) {
  return {
    first() {
      const row = args.length ? stmt.get(...args) : stmt.get();
      return row ?? null;
    },
    all() {
      const rows = args.length ? stmt.all(...args) : stmt.all();
      return { results: rows };
    },
    run() {
      const info = args.length ? stmt.run(...args) : stmt.run();
      return { meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
    },
  };
}
const DB = {
  prepare(sql) {
    // 将 SQLite 的 ？ 参数原样传给 node:sqlite
    let stmt;
    try {
      stmt = db.prepare(sql);
    } catch (e) {
      throw new Error(`SQL 解析失败 [${sql}]: ${e.message}`);
    }
    return {
      bind: (...args) => wrap(stmt, args),
      first: () => wrap(stmt, []).first(),
      all: () => wrap(stmt, []).all(),
      run: () => wrap(stmt, []).run(),
    };
  },
};

// 3. 加载编译后的 worker，提供 env
const { default: worker } = await import("/tmp/wd/index.js");
const env = {
  DB,
  APP_SECRET: "test-secret-0123456789abcdef",
  TOKEN_TTL_HOURS: "168",
  TURNSTILE_ENABLED: "false",
  MICROSOFT_OAUTH_ENABLED: "false",
  AI_ENABLED: "false",
  RCON_ENABLED: "false",
  MONITOR_ENABLED: "false",
  SITE_URL: "http://localhost:3000",
};
const fetchFn = (path, init = {}) =>
  worker.fetch(new Request(`http://test${path}`, init), env);

let pass = 0, failCount = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else {
    failCount++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}
async function call(name, path, init) {
  const r = await fetchFn(path, init);
  const body = await r.json().catch(() => null);
  console.log(`\n[${init?.method || "GET"}] ${path} → ${r.status}`);
  console.log("  ", JSON.stringify(body)?.slice(0, 300));
  return body;
}

// ---- 主流程 ----
console.log("== 健康检查 ==");
const health = await call("health", "/api/health");
check("health ok", health?.code === 0);

console.log("\n== 注册 ==");
const reg = await call("register", "/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "e2e-test/1.0" },
  body: JSON.stringify({ username: "测试玩家", email: "player@test.com", password: "pass123456" }),
});
check("注册成功", reg?.code === 0, JSON.stringify(reg));
check("注册返回 csrf", reg?.data?.csrf?.length > 8);

console.log("\n== 重复注册 ==");
const dup = await call("dup-register", "/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "测试玩家", email: "other@test.com", password: "pass123456" }),
});
check("重复用户名被拒", dup?.code !== 0);

console.log("\n== 登录（邮箱） ==");
const login = await call("login", "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "player@test.com", password: "pass123456" }),
});
check("登录成功", login?.code === 0, JSON.stringify(login));

// 从 Set-Cookie 提取 token 作为后续鉴权
const loginResp = await fetchFn("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "player@test.com", password: "pass123456" }),
});
const setCookie = loginResp.headers.get("set-cookie") || "";
const tokenMatch = setCookie.match(/auth_token=([^;]+)/);
const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";
check("登录设置 Cookie", !!token);
const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

console.log("\n== 未登录访问受保护接口 ==");
const noAuth = await call("me-unauth", "/api/user/me");
check("未登录被拒 401", noAuth?.code === 401);

console.log("\n== 我的信息 ==");
const me = await call("me", "/api/user/me", { headers: authHeaders });
check("me 返回用户", me?.code === 0 && me?.data?.username === "测试玩家");

console.log("\n== 修改密码 ==");
const pw = await call("change-pw", "/api/user/password", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ old_password: "pass123456", new_password: "newpass123" }),
});
check("改密成功", pw?.code === 0);

console.log("\n== 提交入服申请 ==");
const appSubmit = await call("apply", "/api/application/submit", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ mc_name: "Steve_2026", type: "java", intro: "老玩家回归", channel: "QQ群" }),
});
check("申请提交成功", appSubmit?.code === 0, JSON.stringify(appSubmit));

console.log("\n== 重复申请被拒 ==");
const appDup = await call("apply-dup", "/api/application/submit", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ mc_name: "Steve_2026", type: "java", intro: "重复", channel: "" }),
});
check("重复申请被拒", appDup?.code !== 0);

// 提升为 admin 后重新登录，让 JWT 携带新角色
db.prepare("UPDATE users SET role='admin' WHERE username='测试玩家'").run();
console.log("\n== 重新登录（admin） ==");
const adminLoginResp = await fetchFn("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "player@test.com", password: "newpass123" }),
});
const adminCookie = adminLoginResp.headers.get("set-cookie") || "";
const adminTok = adminCookie.match(/auth_token=([^;]+)/);
const adminToken = adminTok ? decodeURIComponent(adminTok[1]) : "";
check("admin 重新登录拿到新 token", !!adminToken);
authHeaders.Authorization = `Bearer ${adminToken}`;

console.log("\n== 管理员审核申请 ==");
const review = await call("review", "/api/application/admin/1/review", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ status: "approved", note: "欢迎入驻" }),
});
check("审核通过", review?.code === 0);

console.log("\n== 创建工单 ==");
const ticket = await call("ticket", "/api/ticket/create", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ subject: "无法连接服务器", category: "bug", priority: "high", content: "提示连接超时" }),
});
check("工单创建成功", ticket?.code === 0 && ticket?.data?.id > 0, JSON.stringify(ticket));

console.log("\n== 工单详情 ==");
const ticketDetail = await call("ticket-detail", "/api/ticket/1", { headers: authHeaders });
check("工单详情含回复", ticketDetail?.code === 0 && ticketDetail?.data?.replies.length === 1);

console.log("\n== AI 对话（演示模式） ==");
const chat = await call("ai-chat", "/api/ai/chat", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ content: "怎么入服？" }),
});
check("AI 返回演示回复", chat?.code === 0 && chat?.data?.reply.length > 10, JSON.stringify(chat));

console.log("\n== 商城下单 ==");
const product = db.prepare(
  "INSERT INTO shop_products (name, description, price, currency, category, active) VALUES (?,?,?,?,?,1)"
).run("赞助会员", "解锁更多功能", 30, "CNY", "vip");
const pid = Number(product.lastInsertRowid);
const order = await call("order", "/api/shop/order", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ product_id: pid, qty: 2 }),
});
check("下单成功", order?.code === 0 && order?.data?.total === 60, JSON.stringify(order));

console.log("\n== 模拟支付 ==");
const pay = await call("pay", "/api/pay/verify", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ order_no: order?.data?.order_no }),
});
check("支付成功", pay?.code === 0, JSON.stringify(pay));

console.log("\n== 管理员发货 ==");
const deliver = await call("deliver", "/api/shop/admin/order/1/deliver", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ delivery: "游戏内邮件已发放" }),
});
check("发货成功", deliver?.code === 0);

console.log("\n== 公告 ==");
db.prepare("INSERT INTO announcements (title, content, status) VALUES ('开服公告','欢迎加入','published')").run();
const ann = await call("announce", "/api/announce", { method: "GET" });
check("公告列表", ann?.code === 0 && ann?.data?.length === 1);

console.log("\n== 留言提交 ==");
const msg = await call("contact", "/api/contact/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "路人", email: "a@b.com", subject: "咨询", message: "请问版本支持？" }),
});
check("留言成功", msg?.code === 0);

console.log("\n== 内容管理 ==");
const contentSet = await call("content-set", "/api/content/admin/set", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ page: "hero", field: "title", value: "西域之光" }),
});
check("内容更新", contentSet?.code === 0);
const contentGet = await call("content-get", "/api/content/hero");
check("内容读取", contentGet?.code === 0 && contentGet?.data?.[0]?.value === "西域之光");

console.log("\n== 微软绑定未启用返回说明 ==");
const bind = await call("ms-authorize", "/api/microsoft/authorize-url", { headers: authHeaders });
check("返回未启用提示", bind?.code === 0 && bind?.data?.enabled === false);

console.log("\n== 管理统计 ==");
const stats = await call("stats", "/api/admin/stats", { headers: authHeaders });
check("统计接口", stats?.code === 0 && stats?.data?.users === 1, JSON.stringify(stats));

console.log("\n== 服务器状态 ==");
const status = await call("server-status", "/api/monitor/status");
check("服务器状态（公开）", status?.code === 0 && status?.data?.length === 1);

console.log("\n== 登出 ==");
const logout = await call("logout", "/api/auth/logout", { method: "POST" });
check("登出", logout?.code === 0);

console.log(`\n======== 结果: ${pass} 通过, ${failCount} 失败 ========`);
process.exit(failCount ? 1 : 0);