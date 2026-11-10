#!/usr/bin/env node
/**
 * 安装主题包
 *
 * 用法：
 *   npm run theme:add -- ./my-theme.zip
 *   npm run theme:add -- ./my-theme/          # 也可以用未打包的目录
 *   npm run theme:add -- ./my-theme.zip --force
 *
 * 主题包要求：
 *   theme.json    { "id": "v3", "name": "...", "description": "...", "css": "theme.css" }
 *   Layout.tsx    主题自己的导航 / 页脚 / 页面骨架
 *   Home.tsx      主题自己的首页
 *   theme.css     可选，主题独立样式
 *
 * 安装后会重新生成 src/themes/generated.ts，并把样式复制到 public/themes/<id>/。
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const force = args.includes("--force");
const source = args.find((a) => !a.startsWith("--"));

if (!source) {
  console.error("用法：npm run theme:add -- <主题包.zip|主题目录> [--force]");
  process.exit(1);
}

const srcPath = resolve(source);
if (!existsSync(srcPath)) {
  console.error(`找不到：${srcPath}`);
  process.exit(1);
}

let workDir = srcPath;
let temp = "";
if (statSync(srcPath).isFile()) {
  temp = mkdtempSync(join(tmpdir(), "theme-"));
  try {
    execFileSync("unzip", ["-o", "-q", srcPath, "-d", temp], { stdio: "inherit" });
  } catch {
    console.error("解压失败，请确认系统已安装 unzip");
    process.exit(1);
  }
  workDir = temp;
}

/** 允许 zip 里多包一层目录 */
function findThemeRoot(dir) {
  if (existsSync(join(dir, "theme.json"))) return dir;
  const entries = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("__"));
  for (const d of entries) {
    const child = join(dir, d.name);
    if (existsSync(join(child, "theme.json"))) return child;
  }
  return null;
}

const themeRoot = findThemeRoot(workDir);
if (!themeRoot) {
  console.error("主题包里没有 theme.json");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(themeRoot, "theme.json"), "utf8"));
} catch (e) {
  console.error(`theme.json 解析失败：${e.message}`);
  process.exit(1);
}

const id = String(manifest.id || basename(themeRoot)).trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
  console.error(`主题 id 不合法：${id}（只允许小写字母、数字、- 和 _）`);
  process.exit(1);
}

for (const required of ["Layout.tsx", "Home.tsx"]) {
  if (!existsSync(join(themeRoot, required))) {
    console.error(`主题包缺少 ${required}`);
    process.exit(1);
  }
}

const target = join(root, "src/themes", id);
if (existsSync(target) && !force) {
  console.error(`主题 ${id} 已存在，如需覆盖请加 --force`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(themeRoot, target, { recursive: true });
if (temp) rmSync(temp, { recursive: true, force: true });

console.log(`[theme] 已安装 ${id}（${manifest.name || id}）到 src/themes/${id}`);
execFileSync(process.execPath, [join(root, "scripts/build-themes.mjs")], { stdio: "inherit", env: process.env });
