# AGENTS.md · 项目记忆

Westworld 西域之光官网（Next.js 静态导出 + Cloudflare Workers + Hono + D1 + R2）。

## 开工顺序（必须）

1. 先读 [.trae/rules/project_rules.md](.trae/rules/project_rules.md)（设计与交互规范，最高优先级）。
2. 再读本文件（工程约定）。
3. 涉及版本时读 [CHANGELOG.md](CHANGELOG.md) 顶部规则。
4. 做 UI / 视觉 / 设计评审前，加载 [.trae/skills/refactoring-ui/SKILL.md](.trae/skills/refactoring-ui/SKILL.md)（Refactoring UI 规则与诊断）。

## 工程约定

- **Git 作者**：`jijiayi0626 <mr_jijiayi@outlook.com>`；提交中不得出现 trae，不得添加 `Co-authored-by`。
- **版本号**：四位 `X.Y.Z.N`。修复与小功能递增第四位；成体系的功能更新递增第三位；仅重大改版进位第二位。每次功能改动同步更新 `src/lib/version.ts` 与 `CHANGELOG.md`、`public/docs/CHANGELOG.md`。
- **构建**：`npm run build`（静态导出，含主题包构建）。
- **部署**：`npx wrangler deploy`（Cloudflare Workers，密钥通过环境变量注入，不写入仓库）。
- **主题**：`src/themes/<key>/` 为独立主题包（`theme.json`、`Layout.tsx`、`Home.tsx`、`Nav.tsx`、`theme.css`）；可用主题由 `THEME_SLOTS` 决定，后台「外观模板」切换。
- **提交训练**：提交信息写“为什么”，同类改动不要复用同一条总结。

## 设计红线（详见项目规则）

中性色配色、无渐变无发光、固定间距与圆角档位、设置项名称左控件右、表单名称上、去外层卡片、分组标题、删除操作独立、动效可打断且轻退场、等宽数字、同心圆角、多层柔和阴影。
