# Westworld 西域之光 · MC 服务器宣传网站（mc-next）

我的世界原版生存服务器「西域之光（westworld）」的官方网站。基于 **Next.js 静态导出 + Cloudflare Workers（Hono）+ D1 + R2** 的现代架构，支持后台可视化配置站点内容、玩家注册登录、论坛（公告 + 聊天室）、工单、入服申请、商城（可对接服务器经济插件）等完整功能。

- 服务器地址：`sdcmc.chipzz.top:23400`（Java / 基岩版通用，Geyser 已接入）
- 游戏版本：Java 1.7 - 26.2 / Bedrock 26.0 - 26.40
- 在线地址：https://westworld.inumc.dpdns.org
- 项目仓库：https://github.com/jijiayi0626/westworld-mc-next
- 开发者：jijiayi0626（mr_jijiayi@outlook.com）
- 更新日志：见 [CHANGELOG.md](./CHANGELOG.md)，后台「关于本站」页也可在线查看

> 本网站为全新重构项目，与旧版 PHP 项目（mc-original）无任何关系。
> 站点内容均由后台「内容管理」「可视化编辑」动态配置，前台刷新即时生效。

---

## 目录

- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [目录结构](#目录结构)
- [本地开发](#本地开发)
- [部署上线](#部署上线)
- [管理后台功能指南](#管理后台功能指南)
- [常见操作](#常见操作)

---

## 功能特性

### 前台（静态页面，SEO 友好）

| 页面 | 内容 |
|---|---|
| `/` 首页 | Hero 欢迎区、服务器配置、加入步骤、游戏特色、相册轮播、管理团队、联系表单、社区入口 |
| `/specs` | 服务器硬件配置详情 |
| `/help` | 下载启动器（PCL2 / HMCL / PCL CE / FCL）、加入教程、服务器 MOTD 在线查询 |
| `/features` | 游戏特色介绍 |
| `/gallery` | 全部游戏截图（瀑布流 + 点击查看大图灯箱） |
| `/team` | 管理团队介绍 |
| `/rules` | 服务器规则 |
| `/faq` | 常见问题 |
| `/contact` | 联系表单（留言板） |
| `/community` | 社区群二维码与加入入口 |
| `/login` | 登录 / 注册 / 找回密码（支持微软 OAuth / UPOP 统一认证绑定） |
| `/user/*` | 用户中心：资料、改密、论坛（公告 + 聊天室）、入服申请、工单、AI 助手、订单、通知、操作日志、安全中心 |
| `/admin/*` | 管理后台：统计、用户、内容、图库、公告、留言、论坛、工单、申请审核、AI（多场景）、商城、监控（RCON + MOTD）、风控看板、雨云面板、数据备份、设置、关于 |

### 多模板与深浅主题

- 用户中心 / 管理后台侧栏底部「外观设置」可切换 **现代模板 / 经典模板** 与 **浅色 / 深色 / 跟随系统** 模式，偏好存于浏览器本地，刷新无闪烁（首屏内联脚本预置）。
- 顶部导航在窄屏自动收纳为「更多」下拉，移动端为汉堡抽屉。

### 后端（Cloudflare Workers + Hono）

| 模块 | 说明 |
|---|---|
| 认证 | 账号密码 + 同源校验（CSRF 防护）+ HttpOnly Cookie；微软 OAuth 与 UPOP 统一认证绑定 |
| 论坛 | 公告（管理端发布）+ 聊天室（文字 / 图片、频控、日限额），独立 D1 数据库 `westworld-forum` 存储 |
| 工单 / 申请 | 支持往返回复；入服申请审核通过后可经 RCON 自动加白名单 |
| 商城 | 商品 + 订单 + Creem 支付；支持对接服务器经济插件（RCON 查询 / 扣款指令模板） |
| 监控 | mcsrvstat 探测 + MineBBS MOTD 查询 API（可配置源站）+ RCON 命令执行 + 定时巡检 |
| AI 助手 | OpenAI 兼容接口，多供应商模板一键切换；支持玩家助手 / 工单摘要 / 入服预审 / 回复草稿多场景，独立提示词、温度与 Token 上限，可在线测试 |
| 风控看板 | 注册 / 登录 IP 与 UA 指纹聚合、风险评分与因子拆解、近期注册与账号操作、待处理申请 / 工单、IP 黑名单快捷拉黑 |
| 雨云面板 | 雨云 API 只读概览 + 开机 / 关机 / 重启；支持绑定单实例、操作频控与 SSRF 防护 |
| 数据备份 | 配置 / 完整两种模式导出 JSON，可下载或保存到 R2；支持列表下载、删除与恢复（RESTORE 二次确认、可选清空、20MB 限制） |
| 安全 | IP 黑名单、固定窗口限流、行为日志（user_logs）、操作日志（op_logs） |

---

## 技术架构

```
浏览器 ── Cloudflare CDN ── Cloudflare Workers（Hono API + 静态资源托管）
                                ├── D1（主库 mc-next：用户/内容/工单/商城等）
                                ├── D1（论坛库 westworld-forum：公告帖 + 聊天消息）
                                ├── R2（mc-next-assets：图片 / 聊天图片 / 系统图片）
                                ├── Durable Objects（RconDO：RCON 长连接）
                                └── 定时任务（cron */5：服务器巡检 + 心跳）
```

- 前端：Next.js 14（App Router，静态导出 `output: export`）+ Tailwind CSS，全站内联 SVG 图标（无外部图标库 / 字体依赖，离线可用）
- 后端：Hono on Workers；环境变量与密钥见「部署上线」
- 数据：两套 D1（主库 + 论坛库）与 R2 对象存储

---

## 目录结构

```
src/
├── app/
│   ├── (public)/        # 前台静态页面
│   ├── user/            # 用户中心
│   └── admin/           # 管理后台
├── components/          # Navbar / Shell / GalleryGrid / ui 等
├── worker/
│   ├── index.ts         # 路由挂载 + 定时任务
│   ├── routes/          # auth / forum / chat / shop / monitor / rcon / ai ...
│   ├── lib/             # auth / http / validate / cipher / log
│   └── db/schema.sql    # 主库建表
public/
├── css/                 # 主题样式（鸿蒙风打磨层 / 移动端适配）
└── docs/                # README / CHANGELOG 静态副本（后台「关于」在线查看）
```

---

## 本地开发

```bash
npm install
npm run dev      # Next.js 前端开发
npx wrangler dev # Workers 本地调试（需配置 D1/R2/DO 绑定）
npm run build    # 静态导出到 out/
```

---

## 部署上线

```bash
# 构建并部署（需 CLOUDFLARE_API_TOKEN）
npm run build
npx wrangler deploy
```

- `wrangler.jsonc`：绑定主库 `DB`（mc-next）、论坛库 `FORUM_DB`（westworld-forum）、`ASSETS`（R2）、`RCON`（DO）、cron 触发器
- 初始化建表：`npx wrangler d1 execute mc-next --remote --file src/worker/db/schema.sql`
- 论坛库建表：`npx wrangler d1 execute westworld-forum --remote --file src/worker/db/schema-forum.sql`
- 已有数据库升级：按需执行 `scripts/migrate-*.sql`（本次涉及 `migrate-user-socials.sql`、`migrate-shop-delivery.sql`、`migrate-ticket-attachments.sql`）
- 敏感配置（AI 密钥、微软 OAuth、UPOP、RCON 等）均在后台「网站设置」页配置，存数据库即时生效

---

## 管理后台功能指南

| 模块 | 说明 |
|---|---|
| 内容管理 / 可视化编辑 | 站点文案、图片、相册（可命名）、群二维码等 |
| 图片管理 | 上传 / 大图预览 / 重命名 / 删除（系统图片受保护，含“使用中”标记与孤儿图片批量清理） |
| 网站设置 | 已分区重做：基础配置（键值 + 搜索）、论坛与聊天、三方集成（微软 OAuth / UPOP）、邮件服务与事件通知 |
| 论坛管理 | 公告发布 / 编辑 / 置顶；聊天室与公告的展示开关 |
| 用户管理 | 检索 / 详情 / 封禁 / 角色 / 重置密码 / 改邮箱 / 新建用户 / 批量邮件通知 |
| 工单 | 用户与管理员往返回复、图片/PDF/ZIP 附件、关闭与重开、AI 摘要与 AI 起草回复 |
| 商城 | 商品与库存 / 自动发货指令 / 订单筛选、重试发货、经济插件对接（余额查询、扣款指令模板 + 连通性测试） |
| 服务器监控 | 状态巡检、RCON 命令、MOTD 查询（MineBBS API） |
| AI 设置 | 供应商模板、密钥、用量统计、多场景提示词 / 温度 / Token 上限与在线测试 |
| 风控看板 | 风险评分、共享 IP / 指纹、近期注册与敏感操作、IP 黑名单 |
| 雨云面板 | API Key 配置、实例状态 / 到期 / 用量、开机 / 关机 / 重启 |
| 数据备份 | 配置 / 完整备份、R2 存储与下载、上传或选库恢复 |
| 关于本站 | 项目信息 + 在线查看 README 与更新日志 |

## 常见操作

- **改服务器地址 / 端口**：后台「服务器监控」→ 服务器列表
- **配 MOTD 查询源**：默认 `https://motd.minebbs.com`，可在网站设置键值 `motd_api_base` 覆盖
- **配经济插件**：后台「商城」→ 经济插件对接 → 启用并填写指令模板（`{player}` `{amount}` 占位符）→ 测试
- **开 / 关聊天室**：后台「网站设置」→ 聊天室设置
