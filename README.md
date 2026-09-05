# Westworld 西域之光 · MC 服务器宣传网站（mc-next）

我的世界原版生存服务器「西域之光（westworld）」的官方网站。基于 **Next.js 静态导出 + Cloudflare Workers（Hono）+ D1 + R2** 的现代架构，支持后台可视化配置站点内容、玩家注册登录、工单、入服申请、商城等完整功能。

- 服务器地址：`sdcmc.chipzz.top:23400`（Java / 基岩版通用，Geyser 已接入）
- 游戏版本：Java 1.7 - 26.2 / Bedrock 26.0 - 26.40
- 在线地址：https://new.westworld-mc.eu.cc

---

## 目录

- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [本地开发](#本地开发)
- [部署上线](#部署上线)
- [内容管理后台](#内容管理后台)
- [常见操作](#常见操作)
- [FAQ](#faq)

---

## 功能特性

### 前台（静态页面，SEO 友好）

| 页面 | 内容 |
|---|---|
| `/` 首页 | Hero 欢迎区、服务器配置、加入步骤、游戏特色、相册轮播、管理团队、联系表单、社区入口 |
| `/specs` | 服务器硬件配置详情 |
| `/help` | 下载启动器（PCL2 / HMCL / PCL CE / FCL）与加入教程 |
| `/features` | 游戏特色介绍 |
| `/gallery` | 全部游戏截图（按版本 6.0 / 7.0 与地点筛选） |
| `/team` | 管理团队介绍 |
| `/contact` | 联系表单（留言板） |
| `/community` | 社区群二维码与加入入口 |
| `/login` | 登录 / 注册 / 找回密码 |
| `/user/*` | 用户中心：资料、改密、通知、操作日志、入服申请、工单、AI 助手、商城订单 |
| `/admin/*` | 管理后台：统计、用户、内容、公告、留言、工单、申请审核、AI 用量、商城、监控、黑名单、操作日志 |

### 用户系统

- 注册 / 登录（JWT + HttpOnly Cookie，CSRF 防护，UA 指纹）
- 密码 PBKDF2-SHA256 哈希存储
- 找回密码（重置码，邮件接入后可自动发送）
- 用户日志、站内通知
- 微软账号绑定（可开关，配置驱动）

### 管理后台

- 仪表盘统计（用户数、待审核申请、工单、订单、留言）
- 用户管理（封禁 / 改角色 / 重置）
- **内容管理（核心）**：分区块结构化编辑站点文案与图片，保存后前台即时生效
- 公告发布 / 留言回复 / 工单处理 / 入服申请审核
- 商城商品与订单、发货
- 服务器监控（在线状态 / 玩家数）+ RCON 远程命令（可开关）
- IP 黑名单、操作日志

### 其它

- 图片资源托管于 **Cloudflare R2**，经 `/static/*` 由 Worker 代理输出（不占用 Worker 体积）
- 全部外部服务（微软 OAuth、AI、SMTP、支付、RCON、监控）均为配置驱动，可在 `wrangler.jsonc` 或 `.dev.vars` 中按需开启

---

## 技术架构

```
浏览器 ──► Cloudflare CDN (Custom Domain: new.westworld-mc.eu.cc)
                │
                ├── 静态资源(HTML/JS/CSS)  ── 来自 Next.js 静态导出(out/)
                ├── /api/*                  ── Hono Worker（D1 数据库）
                └── /static/*               ── Hono Worker 代理 R2 图片
```

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 14 (App Router, `output: export` 静态导出) + Tailwind CSS |
| 后端 API | Cloudflare Workers + Hono |
| 数据库 | Cloudflare D1 (SQLite) |
| 图片存储 | Cloudflare R2 Bucket |
| 认证 | JWT (HS256, Web Crypto 实现) |
| 版本控制 | Git + GitHub |

### 设计要点

- **纯静态 + API 分离**：所有页面构建时静态预渲染（秒开、SEO 好），动态能力（登录、工单、后台）全部走 `/api/*`
- **内容后台化**：站点文案默认值在 `src/lib/content.ts`，后台修改后存入 D1（`site_settings.site_content`），前端 `SiteContentProvider` 运行时拉取覆盖——**改文案不需要重新构建部署**
- **图片走 R2**：约 22MB 图片不上传到 Worker 包，而是放在 R2，通过 `/static/*` 代理，带一年强缓存

---

## 目录结构

```
src/
├── app/                    # Next.js App Router 页面
│   ├── page.tsx            # 首页
│   ├── specs|help|...      # 各宣传页面
│   ├── login/              # 登录注册
│   ├── user/               # 用户中心（10 个子页）
│   └── admin/              # 管理后台（13 个子页）
├── components/             # React 组件
│   ├── Hero|Navbar|Footer  # 布局与区块
│   ├── SiteContentProvider # 运行时内容 Provider（核心）
│   ├── AuthProvider        # 登录态 Provider
│   └── ui.tsx              # 通用 UI 组件
├── lib/
│   ├── content.ts          # ★ 站点内容默认值 + 类型（后台可配的全部字段）
│   └── api.ts              # API 请求封装
└── worker/                 # Cloudflare Worker 后端（Hono）
    ├── index.ts            # 入口：路由注册
    ├── routes/             # 各业务路由（auth/user/admin/content/...）
    ├── lib/                # 认证、JWT、密码哈希、日志等
    ├── db/schema.sql       # ★ D1 数据库表结构
    └── do/rcon-do.ts       # RCON Durable Object
scripts/
├── e2e.mjs                 # 端到端接口测试
└── seed-users.sql          # 测试账号种子（admin / testuser）
wrangler.jsonc              # Worker 配置（D1 / R2 / vars / DO）
```

---

## 本地开发

### 环境要求

- Node.js ≥ 20
- npm

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 复制本地变量示例（填入真实值，仅本地 wrangler dev 使用）
cp .dev.vars.example .dev.vars
# 必须配置：APP_SECRET=（至少 16 字符随机串）

# 3. 启动前端开发服务器
npm run dev
# 打开 http://localhost:3000
```

> 注意：`npm run dev` 只提供前端静态页面，`/api/*` 接口需要 Worker 提供。完整本地环境请用：

```bash
npm run build
npx wrangler dev          # 同时提供 / 静态页面与 /api/* 接口（D1 走本地）
```

### 数据库（本地）

```bash
# 应用表结构到本地 D1
npx wrangler d1 migrations apply mc-next --local
# 或直接执行 schema
npx wrangler d1 execute mc-next --local --file=src/worker/db/schema.sql

# 导入测试账号
npx wrangler d1 execute mc-next --local --file=scripts/seed-users.sql
```

### 自动化测试

```bash
# 编译 worker 到临时目录（供 e2e 引用）
npx esbuild src/worker/index.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/wd/index.js --external:node:*

# 跑端到端接口测试（27 项断言）
node scripts/e2e.mjs
```

---

## 部署上线

### 前置条件

- Cloudflare 账号，已登录 wrangler（`npx wrangler login`）
- 已创建 D1 数据库与 R2 Bucket（见下）

### 一次部署

```bash
# 1. 创建云资源（首次）
npx wrangler d1 create mc-next          # 得到 database_id
npx wrangler r2 bucket create mc-next-assets

# 2. 把 database_id 填入 wrangler.jsonc 的 d1_databases

# 3. 上传图片到 R2（注意 --remote 必须加，跳过本地 workerd）
for f in $(find public -type f); do
  key="${f#public/}"
  npx wrangler r2 object put mc-next-assets/"$key" --file="$f" --remote
done

# 4. 配置生产密钥
echo "你的随机密钥(≥16字符)" | npx wrangler secret put APP_SECRET

# 5. 构建 + 部署
npm run build
npx wrangler deploy

# 6. 初始化线上数据库表
npx wrangler d1 execute mc-next --remote --file=src/worker/db/schema.sql

# 7. 导入测试账号
npx wrangler d1 execute mc-next --remote --file=scripts/seed-users.sql
```

部署成功后：

- Worker 官方子域：`https://mc-next.<你的用户>.workers.dev`
- 绑定自定义域：Cloudflare 控制台为 Worker 添加自定义域名（如 `new.westworld-mc.eu.cc`）

### 重新部署（改代码后）

```bash
npm run build && npx wrangler deploy
```

### 开启可选功能（攻关配置）

在 `wrangler.jsonc` 的 `vars` 中打开对应开关并部署：

| 功能 | 开关 | 需要的其它配置 |
|---|---|---|
| 微软账号绑定 | `MICROSOFT_OAUTH_ENABLED = "true"` | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`（secret） |
| AI 助手 | `AI_ENABLED = "true"` | `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` |
| 找回密码邮件 | 配置 SMTP | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` 等 |
| 支付（Creem） | 配置密钥 | `CREEM_API_KEY` / `CREEM_PRODUCT_ID` |
| RCON 远程命令 | `RCON_ENABLED = "true"` | 服务器 RCON 密码（游戏服配置） |
| 服务器监控 | `MONITOR_ENABLED = "true"` | 游戏服地址（schema 已内置主服） |

---

## 内容管理后台

登录 `admin` 账号后进入 **管理后台 → 内容管理**，按区块（Tab）编辑站点文案：

| Tab | 可编辑内容 |
|---|---|
| 站点信息 | 站点名、品牌名、服务器 IP、描述、SEO 关键词、Hero 文案、页脚版权与友情链接 |
| 首页 Hero | 首页背景图 URL |
| 服务器配置 | 区块标题/副标题/背景图 + 配置项列表（图标/名称/值/描述） |
| 下载帮助 | 区块标题 + 加入步骤 + 启动器列表 |
| 游戏特色 | 区块标题 + 特色项（图标/名称/描述） |
| 游戏截图 | 区块标题 + 图片列表（URL/描述） |
| 管理团队 | 区块标题 + 团队成员（名称/职位/描述/头像/链接） |
| 联系我们 | 标题/副标题/背景图 |
| 社区 | 标题/群组卡片/二维码图片 |

- 字段可用「添加 / 删除」增删数组项
- 图片字段支持 `/static/...`（R2 内路径）或任意外链
- 点「保存全部」写入 D1，**前台刷新即生效，无需重新构建部署**
- 「恢复默认」清空自定义内容，回退到代码内置默认值

---

## 常见操作

### 修改测试账号密码 / 权限

```bash
# 线上改用户角色为管理员
npx wrangler d1 execute mc-next --remote \
  --command "UPDATE users SET role='admin' WHERE username='你的用户名';"
```

### 备份 / 导出数据库

```bash
npx wrangler d1 export mc-next --remote --output=./backup-$(date +%F).sql
```

### 查看 Worker 实时日志

```bash
npx wrangler tail mc-next
```

### 新增图片到站点

1. 将图片文件放入本地 `public/xxx/` 目录（同时作为仓库资源）
2. 上传到 R2：`npx wrangler r2 object put mc-next-assets/xxx/图片.png --file=public/xxx/图片.png --remote`
3. 在后台把图片字段填为 `/static/xxx/图片.png`

---

## FAQ

**Q：为什么改了后台内容前台不生效？**
A：确认已点「保存全部」。保存后无需重新部署，刷新前台页面即可。若仍不生效，检查浏览器缓存（强刷 Ctrl+Shift+R）。

**Q：`npm run dev` 下请求接口报 404？**
A：本地 `npm run dev` 只有前端。请用 `npm run build && npx wrangler dev` 启动完整环境（前端 + API + 本地 D1）。

**Q：上传图片到 R2 报 fcntl64 symbol not found？**
A：容器内 wrangler 本地模式（不带 `--remote`）需要启动 workerd，可能因系统 libc 版本不兼容失败。所有 R2 命令都加上 `--remote` 即可。

**Q：部署时 browser 无法访问 /api？**
A：确认 `wrangler.jsonc` 的 `assets.run_worker_first` 包含 `"/api/*"`（和 `"/static/*"`），这样请求先走 Worker 而非静态资源层。

**Q：忘记 APP_SECRET 会怎样？**
A：登录/注册会 500（JWT 签名失败），健康检查正常。用 `wrangler secret put APP_SECRET` 重新设置即可，已有会话 token 会失效，重新登录即可。

---

## License

私有项目（服务器官方站）。未经授权请勿用于商业用途。