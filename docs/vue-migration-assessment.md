# Vue 迁移评估（Westworld MC 站点）

评估对象：`westworld-mc-next`（当前线上版本，Worker `f0c72c5e`）
评估范围：是否迁移到 Vue、迁移哪些部分、成本与风险

---

## 一、结论

**技术上完全可行，但默认不建议整体迁移。**

收益只有两条是真实的：

1. 团队更熟 Vue，后续维护更顺手；
2. 能直接使用 Motion-v（本次需求的动画库）与 Element Plus（现有后台样式本就源自 Element Plus）。

代价是**前端 100% 重写**：40 个页面 + 5 个布局 + 31 个组件，约 13.4k 行 TSX，全部要重新实现并回归。

后端（Hono + D1 + R2 + Durable Object + 易支付 + 邮件）**与前端框架无关，无需改动**，这是迁移成本没有失控的关键。

若确定要迁，**选 Nuxt 3**，不要选 Vue SPA：
- 当前是 `output: "export"` 全站预渲染（43 个静态页），Vue SPA 会丢掉预渲染与 SEO；
- Nuxt 3 能保留静态生成、文件路由、`useHead`，与现有架构最接近。

---

## 二、现状盘点（实测数据）

### 前端

| 类别 | 数量 | 行数 |
| --- | --- | --- |
| 页面 `page.tsx` | 40 | 7,748 |
| 布局 `layout.tsx` | 5 | 116 |
| 组件 `components/**` | 31 | 5,519 |
| 合计 | 76 | **13,383** |

页面按模块分布：

- 前台展示（`(public)`）：首页、关于、特色、规格、社区、图库、论坛、联系、FAQ、规则、帮助、团队 —— 12 页
- 用户中心（`user`）：概览、订单、工单、论坛、AI、申请、通知、日志、安全、聊天 —— 10 页
- 后台管理（`admin`）：概览、用户、商城、设置、内容、论坛、工单、申请、消息、监控、黑名单、AI、图库、可视化、操作日志、关于、后端 —— 17 页
- 登录页 1 页

后台重灾区（行数）：`admin/settings` 935、`admin/shop` 661、`admin/applications` 534、`admin/users` 435、`admin/ai` 365、`admin/messages` 347、`admin/forum` 322。
组件重灾区：`PublicForum` 846、`Shell` 513、`front/v2/HomeV2` 427、`ChatPanel` 422、`content-block-editors` 292。

### 样式

| 位置 | 内容 |
| --- | --- |
| `src/app/globals.css` | 652 行，Tailwind 基础层与组件层 |
| `public/css/front.css`、`front-v2.css`、`mobile.css`、`admin.css`、`shell.css`、`user.css` | 原生 CSS，**可直接复用** |
| `src/styles/original/**` | 约 12,900 行，含 `element-bridge.css` 2,032 行、`admin/shop.css` 1,955 行 |

关键发现：`src/styles/original/**` 里保留了 Element Plus 的桥接样式（`element-bridge.css`、`admin/variables.css`、`admin/forms.css` 等），说明后台 UI 原本就按 Vue + Element Plus 的结构设计。**迁到 Vue 后可以直接用真正的 Element Plus 组件替换手写表单、弹窗、表格，能省掉相当一部分手写量。**

### 后端（无需改动）

`src/worker/` 共 19 个路由文件、5,413 行，全部是 Hono 的 JSON 接口：

```
admin  ai  announce  application  assets  auth  chat  contact
content  forum  microsoft  monitor  pay  rcon  shop  ticket
upload  upop  user
```

配套：D1（`mc-next` / `westworld-forum`）、R2（`mc-next-assets`）、Durable Object（`RconDO`）、易支付签名与回调、Resend 多 Key 轮换。

接口契约统一为 `{ code, message, data }`，鉴权走 HttpOnly Cookie，**Vue 端只需重写一个 `fetch` 封装**。

---

## 三、可复用 vs 必须重写

### 直接复用（0 改动）

- `src/worker/**` 全部：路由、SQL、支付、邮件、定时任务
- `public/**`：图片、CSS、字体、静态资源
- `public/css/*.css` 与 `src/styles/original/**`
- `src/lib/appearance-boot.ts`（模板切换首屏脚本，字符串注入即可）
- API 契约、Cookie 鉴权、`?post=` 论坛详情方案

### 必须重写

- 40 个页面 + 31 个组件
- 三个全局 Provider：`AuthProvider`、`SiteContentProvider`、`FrontThemeProvider` → Vue `provide/inject` 或 Pinia
- `content-block-editors` / `content-editors` 可视化编辑器
- `ui.tsx` 基础组件库（Btn / Input / TextArea / Select / Badge / Card / Field / StatusBadge）
- 布局与路由（`next/link` → `NuxtLink`，`usePathname` → `useRoute`）
- 构建与部署（`next build` → `nuxt generate`，产物路径与 wrangler `assets.directory` 重新对齐）

---

## 四、依赖与写法对照

| 当前（React / Next 14） | 迁移后（Nuxt 3 / Vue 3） | 备注 |
| --- | --- | --- |
| App Router 文件路由 | Nuxt 文件路由 | 路径基本一一对应 |
| `output: "export"` | `nuxt generate` + `nitro.preset` | 需重配 wrangler |
| `"use client"` | 无对应 | Nuxt 需 `ssr: false` 或 `<ClientOnly>` |
| `useState` / `useEffect` | `ref` / `watch` / `onMounted` | 直译 |
| React Context | `provide/inject` 或 Pinia | 建议 Pinia 管 auth / content |
| `<script dangerouslySetInnerHTML>` boot | `useHead({ script })` | 逻辑可直接搬 |
| `next/navigation` | `vue-router` / `NuxtLink` | — |
| `next/image`（已 unoptimized） | `<img>` / `<NuxtImg>` | 无差异 |
| Tailwind 3 | Tailwind 3 | 保留，无需改 |
| 手写表单 / 弹窗 | Element Plus | 后台可显著减负 |
| 无动画库 | Motion-v | 本次需求的直接收益 |

---

## 五、迁移阶段拆分（按工作量权重）

| 阶段 | 内容 | 权重 | 复杂度 |
| --- | --- | --- | --- |
| 1. 基础设施 | Nuxt 工程、路由表、布局、鉴权、API 封装、静态生成 + Worker 部署适配 | 10% | 中 |
| 2. 公共组件 | `Shell`、`Navbar`、`Footer`、`ui`、`ChatPanel`、`PublicForum`、`FrontThemeProvider` | 25% | 中高 |
| 3. 前台展示页 | 12 个 `(public)` 页面 + v1/v2 双模板 | 20% | 低 |
| 4. 用户中心 | 10 个 `user` 页面（订单支付、工单、论坛、聊天） | 15% | 中 |
| 5. 后台管理 | 17 个 `admin` 页面（设置、商城、用户、内容、编辑器） | 30% | 高 |

建议顺序：**1 → 2 → 3（先上线前台）→ 4 → 5（后台并行推进）**。前台先切换、后台继续跑 React 是不可行的（同一域名同一产物），因此实际是整体切换，建议用独立子域先并行部署验证。

---

## 六、风险点（按严重度）

1. **静态导出与 Worker 路由**
   `next build` 产物在 `out/`，wrangler 配 `assets.directory: "./out"` 且 `/api/*` 走 `run_worker_first`。Nuxt 产物结构与 404 处理不同（`404.html`、`trailingSlash`），需要重新联调，否则会出现刷新 404 或 API 被静态资源拦截。

2. **SEO 与首屏**
   当前 43 个页面全是预渲染 HTML。若误选 Vue SPA，首屏白屏 + 无 SEO；Nuxt 必须保持 `generate` 而非纯 SPA。

3. **多模板切换体系**
   v1/v2 依赖 `<html data-frontend>` + 两份作用域 CSS + 首屏 boot 脚本 + localStorage。CSS 可复用，但注入时机与 Provider 要重写，容易出现首屏闪烁（现有 boot 脚本已解决，迁移时容易丢掉）。

4. **表单与交互回归面大**
   后台 935 行的设置页、661 行的商城页、534 行的申请页，涉及大量条件渲染与弹窗状态。React → Vue 的状态迁移容易漏分支，必须逐页回归。

5. **支付与邮件链路**
   易支付回调、确认收款、邮件多 Key 轮换都在 Worker 侧（不用改），但订单页、商城页、设置页的请求参数若写错，线上支付会直接失败。需要真实下单 + 回调联调。

6. **论坛静态详情**
   静态导出不能用动态路由，现方案是 `?post=<id>` + `history.replaceState`。迁移时必须保留，否则详情页刷新 404。

7. **可视化编辑器**
   `content-block-editors`（292 行）与实时预览依赖受控 Provider，迁移到 Vue 需重做响应式数据流，属于隐性工作量。

---

## 七、建议

- **只为动画** → 不迁移。React 侧安装 `motion` 即可，API 与 Motion-v 基本一一对应，先给按钮、弹窗、列表切换试点 3 处。
- **为了团队技术栈统一** → 迁 Nuxt 3，按上表阶段推进，前台用独立子域灰度，后台最后切换。
- **不建议 Vue SPA** → 丢掉预渲染与 SEO，收益最小、风险不低。
- 迁移的真实额外收益是 **Element Plus + Motion-v**；如果后台继续大量手写表单，这部分收益会比较明显。
