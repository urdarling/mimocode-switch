# 前端重设计 + 主题/中英文切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/compose/specs/2026-09-03-ui-redesign-design.md`(B 石墨中性)重写前端视觉,并新增深色/浅色主题切换与中/英文切换。

**Architecture:** 纯前端改造。`style.css` 围绕 `:root`(深色默认)与 `:root[data-theme="light"]` 双套 CSS 变量重写;新增 `public/i18n.js`(字典 + `t()`);`app.js` 增加 toast/confirmDialog/主题/语言切换组件;`server.ts`、`lib/` 零改动。工作直接在 main 分支进行(本仓库惯例,无 worktree)。

**Tech Stack:** Bun(运行时 + bun:test + bun build 语法检查)、原生 HTML/CSS/JS。

## Global Constraints

- 零依赖、零框架、零构建步骤;不引外部字体/图标库(图标用 12px 内联 SVG 描边)
- `server.ts`、`lib/`、`test/` 一律不动;`bun test` 必须维持 73 pass / 0 fail
- 每个改 JS 的任务必须跑 `bun build public/app.js --outfile test/.tmp/app-check.js`(及 i18n.js)语法检查,跑完删除产物
- 色值/圆角/间距以 spec S2 为准;既有 CSS 变量名(`--bg`/`--card`/`--border` 等)保持不变,新变量只在 Task 1 定义
- localStorage 键:`ui-theme`(`"dark"|"light"`)、`ui-lang`(`"zh"|"en"`);均不得存其他值
- 一切动画包在 `@media (prefers-reduced-motion: no-preference)` 内
- 提交信息风格:`type: 中文描述`(参照 git log,如 `feat: ...`)
- 布局骨架(cards 网格、model-row 网格、dialog 结构)与交互逻辑不变

---

### Task 1: 主题基础设施 —— 双主题 token + 切换按钮 + 防闪烁

**Covers:** S2, S4

**Files:**
- Modify: `public/style.css:1-20`(`:root` token 块)
- Modify: `public/index.html`(`<head>` 内联脚本 + header 主题按钮)
- Modify: `public/app.js`(顶部常量区 + 文件末尾)

**Interfaces:**
- Produces: `<html data-theme="dark"|"light">` 属性契约;`ICONS` 常量(Task 4 复用)、`currentTheme()`、`updateThemeIcon()`、`toggleTheme()`;新 CSS 变量 `--accent-text`、`--btn-bg`、`--btn-hover`、`--primary-bg`、`--primary-text`、`--primary-hover`、`--success`、`--backdrop`、`--shadow-sm`(Task 2 使用)
- Consumes: 无

- [ ] **Step 1: 替换 `style.css` 的 `:root` 块(第 1-20 行)**

```css
/* mimocode 供应商管理 — 石墨中性双主题(零依赖,原生 CSS) */
:root {
  /* 深色为默认主题(无 JS 时也可用) */
  --bg: #0f1112;
  --card: #15181b;
  --card-hover: #1a1d20;
  --border: #23272b;
  --border-strong: #31363b;
  --text: #e8eaec;
  --muted: #767d85;
  --accent: #5e6ad2;
  --accent-hover: #6f7bd9;
  --accent-soft: rgba(94, 106, 210, 0.14);
  --accent-text: #c0c6ff;
  --danger: #eb5757;
  --danger-soft: rgba(235, 87, 87, 0.12);
  --success: #4cb782;
  --btn-bg: #23272b;
  --btn-hover: #2d3239;
  --primary-bg: #e8eaec;
  --primary-text: #15181b;
  --primary-hover: #ffffff;
  --backdrop: rgba(2, 4, 8, 0.55);
  --shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  --shadow-sm: none;
  --radius: 10px;
  --radius-sm: 6px;
  --font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "SF Mono", "Cascadia Code", Consolas, monospace;
}
:root[data-theme="light"] {
  --bg: #f6f7f8;
  --card: #ffffff;
  --card-hover: #f0f1f3;
  --border: #e3e5e8;
  --border-strong: #d3d7db;
  --text: #1b1e21;
  --muted: #7d858d;
  --accent: #5e6ad2;
  --accent-hover: #4f5cc4;
  --accent-soft: rgba(94, 106, 210, 0.09);
  --accent-text: #4550b8;
  --danger: #c73737;
  --danger-soft: rgba(199, 55, 55, 0.08);
  --success: #1f8a52;
  --btn-bg: #eceef0;
  --btn-hover: #dfe2e5;
  --primary-bg: #1b1e21;
  --primary-text: #ffffff;
  --primary-hover: #363b40;
  --backdrop: rgba(20, 24, 30, 0.28);
  --shadow: 0 12px 32px rgba(20, 24, 30, 0.14);
  --shadow-sm: 0 1px 2px rgba(20, 24, 30, 0.05);
}
```

既有组件规则引用的变量名全部保留,此步完成后深色下视觉变为石墨调,浅色下可读(组件精修在 Task 2)。

- [ ] **Step 2: `index.html` `<head>` 加防闪烁脚本,header 加主题按钮**

`<link rel="stylesheet">` 之前插入(必须先于 CSS 绘制):

```html
  <script>(function(){var t=localStorage.getItem("ui-theme")||((window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark");document.documentElement.dataset.theme=t;})()</script>
```

header 内 `<button id="btn-variants">` 之前插入:

```html
    <button id="btn-theme" class="secondary hdr-btn" aria-label="切换主题"></button>
```

(`.hdr-btn` 的样式在 Task 2 Step 1 才定义,本任务中间态该按钮沿用 secondary 默认样式,功能不受影响。)

- [ ] **Step 3: `app.js` 顶部加图标常量与主题函数**

文件第 1 行(`const $ = ...`)之后插入:

```js
// ---- 图标(12px 内联 SVG,currentColor) ----
const ICONS = {
  sun: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.3 2.7a1.4 1.4 0 0 1 2 2L5 13H3v-2l8.3-8.3Z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>',
};

// ---- 主题切换(data-theme 契约:dark|light,localStorage ui-theme) ----
function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function updateThemeIcon() {
  const btn = $("#btn-theme");
  if (btn) btn.innerHTML = currentTheme() === "dark" ? ICONS.sun : ICONS.moon;
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ui-theme", next);
  updateThemeIcon();
}
```

文件末尾(`refresh().catch(...)` 之前)插入接线:

```js
$("#btn-theme").onclick = toggleTheme;
updateThemeIcon();
```

- [ ] **Step 4: 语法检查 + 手动验证主题切换**

Run: `bun build public/app.js --outfile test/.tmp/app-check.js` → 成功后 `Remove-Item test/.tmp/app-check.js`
Run: `bun test` → 73 pass / 0 fail(后端零改动)
手动: `bun server.ts`,浏览器验证——深色/浅色切换即时生效、刷新后保持、图标随主题变化、首次打开跟随系统主题。

- [ ] **Step 5: Commit**

```bash
git add public/style.css public/index.html public/app.js
git commit -m "feat: 双主题 token 体系与主题切换(石墨中性,防闪烁,跟随系统默认)"
```

---

### Task 2: 组件样式精修 —— style.css 组件段重写

**Covers:** S2, S3

**Files:**
- Modify: `public/style.css`(第 21 行起,token 块以外的全部组件段)

**Interfaces:**
- Consumes: Task 1 的新变量(`--btn-bg`/`--primary-bg`/`--accent-text`/`--success`/`--backdrop`/`--shadow-sm`)
- Produces: `.hdr-btn`、`.ghost`、`.danger-solid`、`#toasts .toast(.error)`、`.confirm-msg` 样式契约(Task 3/4 的 HTML/JS 依赖这些类名)

**注意:** 各段「替换」指用新代码整段替换 style.css 中同名注释段(如 `/* ---- 按钮 ---- */` 到下一注释段之间的内容)。未列出的段(下拉、模型配置区、chips、变体库、窄屏媒体查询)保持原样不动。

- [ ] **Step 1: 替换「头部」段**

```css
/* ---- 头部 ---- */
header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 10;
  background: var(--bg);
}
@supports (backdrop-filter: blur(8px)) {
  header { background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(8px); }
}
header h1 { font-size: 15px; font-weight: 650; letter-spacing: 0.2px; margin: 0; flex: 0 0 auto; }
.path {
  color: var(--muted); font-size: 12px; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--mono);
}
header .primary { margin-left: auto; }
.hdr-btn { display: inline-flex; align-items: center; justify-content: center; padding: 5px 7px; }
```

- [ ] **Step 2: 替换「卡片」段**

```css
/* ---- 卡片 ---- */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: grab;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s, background 0.15s;
}
.card:hover { background: var(--card-hover); border-color: var(--border-strong); }
.card.active { border-color: var(--accent); background: linear-gradient(180deg, var(--accent-soft), transparent 65%), var(--card); }
.card .top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.card .drag { color: var(--muted); cursor: grab; font-size: 14px; user-select: none; }
.card .name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .top .badge { margin-left: auto; }
.badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--accent); color: #fff; flex: 0 0 auto;
}
.card .meta { color: var(--muted); font-size: 12px; margin: 6px 0; word-break: break-all; }
.card .ops { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 12px; }
.card .ops .danger { margin-left: auto; }
```

- [ ] **Step 3: 替换「按钮」段(三级体系 + ghost/danger-solid)**

```css
/* ---- 按钮:primary(反色实心)> secondary(描边)> 默认(中性)/ ghost(文字)/ danger(文字) ---- */
button {
  font: inherit; font-size: 13px;
  background: var(--btn-bg); color: var(--text);
  border: 1px solid transparent; border-radius: var(--radius-sm);
  padding: 6px 12px; cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
}
button:hover { background: var(--btn-hover); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.primary { background: var(--primary-bg); color: var(--primary-text); font-weight: 600; }
button.primary:hover { background: var(--primary-hover); }
button.secondary { background: transparent; border-color: var(--border-strong); }
button.secondary:hover { background: var(--btn-bg); }
button.ghost {
  background: transparent; color: var(--muted); border: 0;
  padding: 4px 6px; font-size: 12.5px;
  display: inline-flex; align-items: center; gap: 4px;
}
button.ghost:hover { color: var(--text); background: var(--btn-bg); }
button.danger { background: transparent; color: var(--danger); border: 0; padding: 4px 6px; font-size: 12.5px; }
button.danger:hover { background: var(--danger-soft); }
button.danger-solid { background: var(--danger); color: #fff; font-weight: 600; }
button.danger-solid:hover { opacity: 0.9; }
button.icon-btn { padding: 2px 8px; background: transparent; border: 0; color: var(--muted); font-size: 16px; line-height: 1; }
button.icon-btn:hover { color: var(--text); background: var(--btn-bg); }
```

注意:原 `button:active { transform: translateY(1px); }` 规则随段替换被移除(石墨风不用位移反馈)。

- [ ] **Step 4: 替换「自定义下拉」段中两条规则**

`.dd-current` 与 `.dd-item.on` 改为 accent-text 方案(整段替换):

```css
/* ---- 自定义下拉(卡片"设为默认") ---- */
.dropdown { position: relative; display: inline-block; }
.dd-btn { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; }
.dd-btn .caret { font-size: 10px; color: var(--muted); }
.dd-current { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-text); }
.dd-current .dd-label { color: var(--muted); font-size: 11px; }
.dd-current .dd-value {
  display: inline-block; max-width: 150px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--mono); font-size: 12px; vertical-align: bottom;
}
.dd-menu {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;
  min-width: 180px; max-width: 280px; max-height: 240px; overflow-y: auto;
  background: var(--card-hover);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  padding: 4px;
}
.dd-item {
  display: block; width: 100%; text-align: left;
  padding: 7px 10px; border: 0; border-radius: 4px;
  font-size: 13px; color: var(--text); background: transparent;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
}
.dd-item:hover { background: var(--accent-soft); color: var(--accent-text); }
.dd-item.on { background: var(--accent); color: #fff; }
.dd-item.on::before { content: "✓ "; font-weight: 700; }
.dd-item .dd-name { color: var(--muted); font-size: 11px; margin-left: 6px; }
```

- [ ] **Step 5: 替换「对话框」段(动画 + backdrop 变量 + confirm-msg)**

```css
/* ---- 对话框 ---- */
dialog {
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 0;
  width: 560px; max-width: 92vw;
  max-height: min(88vh, 680px);
  box-shadow: var(--shadow);
}
dialog::backdrop { background: var(--backdrop); }
@media (prefers-reduced-motion: no-preference) {
  dialog[open] { animation: dlg-in 0.14s ease-out; }
  @keyframes dlg-in { from { opacity: 0; transform: scale(0.98) translateY(4px); } }
}
.dlg-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}
.dlg-head h2 { font-size: 15px; font-weight: 650; margin: 0; }
.dlg-body { padding: 16px 20px 8px; overflow-y: auto; max-height: calc(min(88vh, 680px) - 110px); }
.dlg-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
  position: sticky; bottom: 0;
  background: var(--card);
}
.dlg-foot .primary, .dlg-foot .danger-solid { min-width: 84px; }
dialog form { margin: 0; }
dialog label {
  display: flex; flex-direction: column; gap: 5px;
  font-size: 12px; color: var(--muted); margin-bottom: 12px;
}
dialog label.checkbox { flex-direction: row; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text); }
dialog input, dialog select {
  font: inherit; font-size: 13px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  padding: 8px 10px;
}
dialog input:focus, dialog select:focus {
  border-color: var(--accent); outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
dialog input[disabled] { opacity: 0.55; }
#default-model-row { flex-direction: row; align-items: center; gap: 8px; }
#f-default-model { max-width: 240px; }
.confirm-msg { font-size: 13.5px; line-height: 1.6; padding-bottom: 12px; }
```

- [ ] **Step 6: 文件末尾追加 Toast 样式**

```css
/* ---- Toast(替代 alert) ---- */
#toasts {
  position: fixed; top: 16px; right: 16px; z-index: 100;
  display: flex; flex-direction: column; gap: 8px; max-width: 340px;
}
.toast {
  background: var(--card-hover); color: var(--text);
  border: 1px solid var(--border-strong); border-left: 3px solid var(--success);
  border-radius: 8px; box-shadow: var(--shadow);
  padding: 10px 14px; font-size: 13px; cursor: pointer;
  word-break: break-all;
}
.toast.error { border-left-color: var(--danger); }
@media (prefers-reduced-motion: no-preference) {
  .toast { animation: toast-in 0.16s ease-out; }
  @keyframes toast-in { from { opacity: 0; transform: translateX(8px); } }
  .toast.out { opacity: 0; transition: opacity 0.2s; }
}
```

- [ ] **Step 7: 替换「内置供应商分区」段中 `.auth-section .badge.auth-type` 一行**

```css
.auth-section .badge.auth-type { background: var(--btn-bg); color: var(--muted); font-weight: 500; }
```

- [ ] **Step 8: 手动视觉走查**

Run: `bun server.ts`,深色/浅色各过一遍:卡片、默认卡片、下拉、对话框(添加供应商 + 变体库)、按钮三级、输入 focus 光晕。对照 spec S2 token 表。
Run: `bun test` → 73 pass / 0 fail。

- [ ] **Step 9: Commit**

```bash
git add public/style.css
git commit -m "feat: 组件样式精修——按钮三级体系/卡片层级/对话框动画/输入 focus 光晕/Toast 样式"
```

---

### Task 3: i18n 基础设施 —— i18n.js + index.html 全量标注 + 语言切换

**Covers:** S5

**Files:**
- Create: `public/i18n.js`
- Modify: `public/index.html`(整体替换为下方最终版)
- Modify: `public/app.js`(语言切换接线,文件末尾)

**Interfaces:**
- Produces: `t(key, params?)`、`getLang()`、`setLang(lang)`、`applyI18nStatic()`;`window.onLangChange` 钩子(Task 4 赋值);index.html 中 `#btn-lang`、`#confirm-dialog`(`#confirm-msg`/`#confirm-cancel`/`#confirm-ok`)、`<script src="/i18n.js">`(在 app.js 之前)
- Consumes: 无(Task 1 的主题接线与本任务接线相邻共存)

**已知中间态:** 本任务完成后,语言切换只更新静态 HTML;app.js 动态渲染内容仍显示旧语言(Task 4 让 render 函数走 `t()` 后完整)。属预期,不单独修。

- [ ] **Step 1: 创建 `public/i18n.js`(完整文件)**

```js
// public/i18n.js — 中/英字典 + t() + 静态 DOM 应用(零依赖,全局函数)
const I18N = {
  zh: {
    "hdr.title": "mimocode 供应商管理",
    "hdr.variants": "变体库",
    "hdr.add": "+ 添加供应商",
    "hdr.theme": "切换主题",
    "hdr.lang": "中/EN",
    "empty.list": "暂无供应商,点击右上角添加。",
    "empty.noconfig": "未找到 mimocode.jsonc,请先运行 mimocode 生成配置,或设置 MIMOCODE_HOME 环境变量。",
    "auth.title": "已登录供应商",
    "auth.hint": "认证信息存于 auth.json,登出后重新登录可恢复。注意:mimocode 内置目录的供应商(如 xiaomi)即使登出也仍会显示在模型列表中,需在 mimocode.jsonc 的 disabled_providers 中禁用。",
    "auth.empty": "暂无已登录的供应商。",
    "auth.logout": "登出",
    "auth.logoutConfirm": "登出已登录供应商 {id}?登出后移除其认证,重新登录可恢复。",
    "auth.type": "认证类型:{type}",
    "auth.hasMeta": " · 含登录信息",
    "card.default": "默认",
    "card.setDefault": "设为默认",
    "card.defaultModel": "默认模型",
    "card.models": "{n} 个模型",
    "card.edit": "编辑",
    "card.dup": "复制",
    "card.del": "删除",
    "card.delConfirm": "删除供应商 {id}?",
    "card.delConfirmDefault": "删除供应商 {id}?这是当前默认供应商,删除后默认会自动切到其他供应商。",
    "form.add": "添加供应商",
    "form.edit": "编辑供应商",
    "form.id": "供应商标识",
    "form.name": "名称",
    "form.namePh": "例如:某中转站",
    "form.apiKey": "API Key",
    "form.baseURL": "Base URL",
    "form.note": "备注",
    "form.notePh": "可选",
    "form.link": "官网链接",
    "form.linkPh": "可选 https://...",
    "form.setDefault": "设为默认供应商",
    "form.defaultModel": "默认模型",
    "form.modelsLegend": "模型配置",
    "form.modelNewPh": "模型 id,如 deepseek-v4-flash",
    "form.addModel": "添加模型",
    "form.fetchModels": "获取模型",
    "form.fetching": "获取中...",
    "dlg.cancel": "取消",
    "dlg.save": "保存",
    "dlg.confirm": "确认",
    "m.limitCtx": "上下文",
    "m.limitOut": "输出",
    "m.modalities": "模态",
    "m.reasoning": "推理",
    "m.rsUnset": "未设置",
    "m.rsYes": "支持",
    "m.rsNo": "不支持",
    "m.delModel": "删除模型",
    "v.builtin": "内置变体",
    "v.official": "官方变体",
    "v.custom": "自定义",
    "v.customPh": "自定义变体名",
    "v.add": "添加",
    "v.clear": "清空",
    "v.empty": "无内置/官方记录,可自定义添加 · ",
    "v.manage": "管理官方库",
    "vb.title": "官方变体库",
    "vb.id": "模型 ID",
    "vb.name": "显示名",
    "vb.namePh": "可选",
    "vb.variants": "变体列表(逗号分隔)",
    "vb.variantsPh": "low, medium, high, xhigh, max",
    "vb.ctx": "上下文",
    "vb.ctxPh": "可选,如 200000",
    "vb.out": "输出",
    "vb.outPh": "可选,如 64000",
    "vb.modalities": "模态",
    "vb.reasoning": "推理",
    "vb.source": "来源",
    "vb.sourcePh": "文档链接或说明",
    "vb.hint": "手动维护,查官方文档确认支持哪些思考强度后录入",
    "vb.extract": "重新提取内置目录",
    "vb.extractTitle": "mimo 升级后点击,重新提取内置目录(mimo.json)",
    "vb.extracting": "提取中...",
    "vb.add": "+ 新增条目",
    "vb.empty": "暂无条目,点击「+ 新增条目」录入。",
    "vb.edit": "编辑",
    "vb.copy": "复制",
    "vb.del": "删除",
    "vb.delConfirm": "删除条目 {id}?",
    "vb.exists": "条目 {id} 已存在,请换一个 ID",
    "toast.saved": "已保存 {id}",
    "toast.deleted": "已删除 {id}",
    "toast.duplicated": "已复制为 {id}",
    "toast.activated": "已切换默认:{model}",
    "toast.ordered": "排序已更新",
    "toast.loggedOut": "已登出 {id}",
    "toast.vbSaved": "变体条目已保存",
    "toast.vbDeleted": "变体条目已删除",
    "err.fetchModels": "获取模型失败: {msg}",
    "err.extract": "提取失败: {msg}",
    "err.generic": "请求失败",
  },
  en: {
    "hdr.title": "mimocode Provider Manager",
    "hdr.variants": "Variants",
    "hdr.add": "+ Add provider",
    "hdr.theme": "Toggle theme",
    "hdr.lang": "EN/中",
    "empty.list": "No providers yet. Click \"Add provider\" above.",
    "empty.noconfig": "mimocode.jsonc not found. Run mimocode once to generate it, or set MIMOCODE_HOME.",
    "auth.title": "Signed-in providers",
    "auth.hint": "Credentials live in auth.json; signing back in restores them. Note: providers from mimocode's built-in catalog (e.g. xiaomi) still appear in the model list after logout — disable them via disabled_providers in mimocode.jsonc.",
    "auth.empty": "No signed-in providers.",
    "auth.logout": "Log out",
    "auth.logoutConfirm": "Log out of {id}? The credential will be removed; signing in again restores it.",
    "auth.type": "Auth type: {type}",
    "auth.hasMeta": " · has login info",
    "card.default": "Default",
    "card.setDefault": "Set default",
    "card.defaultModel": "Default model",
    "card.models": "{n} models",
    "card.edit": "Edit",
    "card.dup": "Duplicate",
    "card.del": "Delete",
    "card.delConfirm": "Delete provider {id}?",
    "card.delConfirmDefault": "Delete provider {id}? It is the current default — the default will move to another provider.",
    "form.add": "Add provider",
    "form.edit": "Edit provider",
    "form.id": "Provider ID",
    "form.name": "Name",
    "form.namePh": "e.g. My Relay",
    "form.apiKey": "API Key",
    "form.baseURL": "Base URL",
    "form.note": "Note",
    "form.notePh": "Optional",
    "form.link": "Website",
    "form.linkPh": "Optional https://...",
    "form.setDefault": "Set as default provider",
    "form.defaultModel": "Default model",
    "form.modelsLegend": "Models",
    "form.modelNewPh": "Model id, e.g. deepseek-v4-flash",
    "form.addModel": "Add model",
    "form.fetchModels": "Fetch models",
    "form.fetching": "Fetching...",
    "dlg.cancel": "Cancel",
    "dlg.save": "Save",
    "dlg.confirm": "Confirm",
    "m.limitCtx": "Context",
    "m.limitOut": "Output",
    "m.modalities": "Modalities",
    "m.reasoning": "Reasoning",
    "m.rsUnset": "Unset",
    "m.rsYes": "Yes",
    "m.rsNo": "No",
    "m.delModel": "Delete model",
    "v.builtin": "Built-in variants",
    "v.official": "Official variants",
    "v.custom": "Custom",
    "v.customPh": "Custom variant name",
    "v.add": "Add",
    "v.clear": "Clear",
    "v.empty": "No built-in/official record — add custom variants · ",
    "v.manage": "Manage official library",
    "vb.title": "Official Variants Library",
    "vb.id": "Model ID",
    "vb.name": "Display name",
    "vb.namePh": "Optional",
    "vb.variants": "Variants (comma-separated)",
    "vb.variantsPh": "low, medium, high, xhigh, max",
    "vb.ctx": "Context",
    "vb.ctxPh": "Optional, e.g. 200000",
    "vb.out": "Output",
    "vb.outPh": "Optional, e.g. 64000",
    "vb.modalities": "Modalities",
    "vb.reasoning": "Reasoning",
    "vb.source": "Source",
    "vb.sourcePh": "Doc link or note",
    "vb.hint": "Maintained by hand — check official docs for supported reasoning efforts",
    "vb.extract": "Re-extract built-in catalog",
    "vb.extractTitle": "Click after a mimo upgrade to re-extract the built-in catalog (mimo.json)",
    "vb.extracting": "Extracting...",
    "vb.add": "+ New entry",
    "vb.empty": "No entries yet. Click \"+ New entry\".",
    "vb.edit": "Edit",
    "vb.copy": "Copy",
    "vb.del": "Delete",
    "vb.delConfirm": "Delete entry {id}?",
    "vb.exists": "Entry {id} already exists — pick another ID",
    "toast.saved": "Saved {id}",
    "toast.deleted": "Deleted {id}",
    "toast.duplicated": "Duplicated as {id}",
    "toast.activated": "Default switched: {model}",
    "toast.ordered": "Order updated",
    "toast.loggedOut": "Logged out {id}",
    "toast.vbSaved": "Variant entry saved",
    "toast.vbDeleted": "Variant entry deleted",
    "err.fetchModels": "Failed to fetch models: {msg}",
    "err.extract": "Extract failed: {msg}",
    "err.generic": "Request failed",
  },
};

function getLang() {
  const saved = localStorage.getItem("ui-lang");
  if (saved === "zh" || saved === "en") return saved;
  return (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key, params) {
  const dict = I18N[getLang()] || I18N.zh;
  let s = dict[key] ?? I18N.zh[key] ?? key;
  if (params) for (const k of Object.keys(params)) s = s.replaceAll(`{${k}}`, String(params[k]));
  return s;
}

// 应用静态 DOM:[data-i18n] 文本、[data-i18n-ph] placeholder、[data-i18n-title] title
function applyI18nStatic() {
  document.documentElement.lang = getLang() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

function setLang(lang) {
  localStorage.setItem("ui-lang", lang);
  applyI18nStatic();
  if (typeof window.onLangChange === "function") window.onLangChange();
}
```

- [ ] **Step 2: 整体替换 `public/index.html` 为最终版(含 Task 1 防闪烁脚本与主题按钮)**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mimocode 供应商管理</title>
  <script>(function(){var t=localStorage.getItem("ui-theme")||((window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark");document.documentElement.dataset.theme=t;})()</script>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1 data-i18n="hdr.title">mimocode 供应商管理</h1>
    <span id="config-path" class="path"></span>
    <button id="btn-theme" class="secondary hdr-btn" data-i18n-title="hdr.theme" aria-label="切换主题"></button>
    <button id="btn-lang" class="secondary" data-i18n="hdr.lang">中/EN</button>
    <button id="btn-variants" class="secondary" data-i18n="hdr.variants">变体库</button>
    <button id="btn-add" class="primary" data-i18n="hdr.add">+ 添加供应商</button>
  </header>
  <main>
    <div id="list" class="cards"></div>
    <p id="empty" class="empty hidden" data-i18n="empty.list">暂无供应商,点击右上角添加。</p>
    <section id="auth-section" class="auth-section hidden">
      <h2 class="section-title" data-i18n="auth.title">已登录供应商</h2>
      <p class="section-hint" data-i18n="auth.hint">认证信息存于 auth.json,登出后重新登录可恢复。注意:mimocode 内置目录的供应商(如 xiaomi)即使登出也仍会显示在模型列表中,需在 mimocode.jsonc 的 disabled_providers 中禁用。</p>
      <div id="auth-list" class="cards"></div>
      <p id="auth-empty" class="empty hidden" data-i18n="auth.empty">暂无已登录的供应商。</p>
    </section>
  </main>

  <dialog id="form-dialog" aria-labelledby="form-title">
    <form id="provider-form" method="dialog">
      <header class="dlg-head">
        <h2 id="form-title">添加供应商</h2>
        <button type="button" id="btn-close" class="icon-btn" aria-label="关闭">×</button>
      </header>
      <div class="dlg-body">
        <input type="hidden" id="f-original-id">
        <label><span data-i18n="form.id">供应商标识</span> <input id="f-id" required pattern="[a-z0-9-]+" placeholder="my-provider"></label>
        <label><span data-i18n="form.name">名称</span> <input id="f-name" required data-i18n-ph="form.namePh" placeholder="例如:某中转站"></label>
        <label><span data-i18n="form.apiKey">API Key</span> <input id="f-apiKey" required placeholder="sk-..."></label>
        <label><span data-i18n="form.baseURL">Base URL</span> <input id="f-baseURL" required placeholder="https://api.example.com/v1"></label>
        <label><span data-i18n="form.note">备注</span> <input id="f-note" data-i18n-ph="form.notePh" placeholder="可选"></label>
        <label><span data-i18n="form.link">官网链接</span> <input id="f-link" type="url" data-i18n-ph="form.linkPh" placeholder="可选 https://..."></label>
        <label class="checkbox"><input type="checkbox" id="f-default"> <span data-i18n="form.setDefault">设为默认供应商</span></label>
        <label id="default-model-row" hidden>
          <span data-i18n="form.defaultModel">默认模型</span>
          <select id="f-default-model"></select>
        </label>
        <fieldset>
          <legend data-i18n="form.modelsLegend">模型配置</legend>
          <div id="models" class="model-table"></div>
          <div class="row">
            <input id="f-model-new" data-i18n-ph="form.modelNewPh" placeholder="模型 id,如 deepseek-v4-flash">
            <button type="button" id="btn-add-model" data-i18n="form.addModel">添加模型</button>
            <button type="button" id="btn-fetch-models" data-i18n="form.fetchModels">获取模型</button>
          </div>
        </fieldset>
      </div>
      <footer class="dlg-foot">
        <button type="button" id="btn-cancel" class="secondary" data-i18n="dlg.cancel">取消</button>
        <button type="submit" class="primary" data-i18n="dlg.save">保存</button>
      </footer>
    </form>
  </dialog>

  <dialog id="variants-dialog" aria-labelledby="variants-title">
    <header class="dlg-head">
      <h2 id="variants-title" data-i18n="vb.title">官方变体库</h2>
      <button type="button" id="vb-close" class="icon-btn" aria-label="关闭">×</button>
    </header>
    <div class="dlg-body">
      <div id="vb-form-wrap" class="hidden">
        <form id="vb-form" class="vb-form">
          <label><span data-i18n="vb.id">模型 ID</span> <input id="vb-id" required pattern="[a-zA-Z0-9._:+-]+" placeholder="gpt-5.6-luna"></label>
          <label><span data-i18n="vb.name">显示名</span> <input id="vb-name" data-i18n-ph="vb.namePh" placeholder="可选"></label>
          <label><span data-i18n="vb.variants">变体列表(逗号分隔)</span> <input id="vb-variants" required data-i18n-ph="vb.variantsPh" placeholder="low, medium, high, xhigh, max"></label>
          <label><span data-i18n="vb.ctx">上下文</span> <input id="vb-limit-context" inputmode="numeric" data-i18n-ph="vb.ctxPh" placeholder="可选,如 200000"></label>
          <label><span data-i18n="vb.out">输出</span> <input id="vb-limit-output" inputmode="numeric" data-i18n-ph="vb.outPh" placeholder="可选,如 64000"></label>
          <label class="vb-modalities"><span data-i18n="vb.modalities">模态</span>
            <span><input type="checkbox" data-vbmod="text" checked disabled> text</span>
            <span><input type="checkbox" data-vbmod="image"> image</span>
            <span><input type="checkbox" data-vbmod="audio"> audio</span>
            <span><input type="checkbox" data-vbmod="video"> video</span>
            <span><input type="checkbox" data-vbmod="pdf"> pdf</span>
          </label>
          <label><span data-i18n="vb.reasoning">推理</span>
            <select id="vb-reasoning">
              <option value="" data-i18n="m.rsUnset">未设置</option>
              <option value="true" data-i18n="m.rsYes">支持</option>
              <option value="false" data-i18n="m.rsNo">不支持</option>
            </select>
          </label>
          <label><span data-i18n="vb.source">来源</span> <input id="vb-source" data-i18n-ph="vb.sourcePh" placeholder="文档链接或说明"></label>
          <div class="vb-form-actions">
            <button type="button" id="vb-form-cancel" class="secondary" data-i18n="dlg.cancel">取消</button>
            <button type="submit" class="primary" data-i18n="dlg.save">保存</button>
          </div>
        </form>
      </div>
      <div class="vb-toolbar">
        <span class="vb-hint" id="vb-hint" data-i18n="vb.hint">手动维护,查官方文档确认支持哪些思考强度后录入</span>
        <div class="vb-ops">
          <button id="vb-extract" class="secondary" data-i18n="vb.extract" data-i18n-title="vb.extractTitle" title="mimo 升级后点击,重新提取内置目录(mimo.json)">重新提取内置目录</button>
          <button id="vb-add" class="secondary" data-i18n="vb.add">+ 新增条目</button>
        </div>
      </div>
      <div id="vb-list"></div>
    </div>
  </dialog>

  <dialog id="confirm-dialog" class="confirm">
    <div class="dlg-body confirm-msg" id="confirm-msg"></div>
    <footer class="dlg-foot">
      <button type="button" id="confirm-cancel" class="secondary" data-i18n="dlg.cancel">取消</button>
      <button type="button" id="confirm-ok" class="danger-solid" data-i18n="dlg.confirm">确认</button>
    </footer>
  </dialog>

  <script src="/i18n.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

注意:`#vb-extract` 的 `title` 由 `applyI18nStatic()` 经 `data-i18n-title` 覆盖,HTML 里的中文 title 仅作无 JS 兜底。两个 `aria-label="关闭"` 图标按钮保留中文不进字典(装饰性,Task 5 走查确认)。

- [ ] **Step 3: `app.js` 末尾接语言切换 + 初始化**

在 Task 1 的主题接线(`$("#btn-theme").onclick = ...` 与 `updateThemeIcon();`)之后插入:

```js
$("#btn-lang").onclick = () => setLang(getLang() === "zh" ? "en" : "zh");
applyI18nStatic();
```

- [ ] **Step 4: 语法检查 + 手动验证**

Run: `bun build public/app.js --outfile test/.tmp/app-check.js` 和 `bun build public/i18n.js --outfile test/.tmp/i18n-check.js` → 成功后删除两个产物
手动: `bun server.ts`——点「中/EN」,所有静态文案(标题/按钮/label/placeholder/两个对话框)即时切换,刷新后保持;卡片等动态内容保持旧语言(已知中间态,Task 4 解决)。

- [ ] **Step 5: Commit**

```bash
git add public/i18n.js public/index.html public/app.js
git commit -m "feat: i18n 基础设施——中/英字典、静态 DOM 标注与语言切换"
```

---

### Task 4: app.js 组件化 —— toast/confirmDialog/icons + 全部动态字符串走 t()

**Covers:** S3, S5

**Files:**
- Modify: `public/app.js`(多处,见各 Step)

**Interfaces:**
- Consumes: Task 1 的 `ICONS`;Task 3 的 `t()`、`#confirm-dialog` 结构、`window.onLangChange` 钩子
- Produces: `toast(msg, type?)`、`confirmDialog(message): Promise<boolean>`(后续维护者替代 alert/confirm 的唯一入口)

- [ ] **Step 1: 追加 toast 与 confirmDialog 组件**

在 `escapeHtml` 函数之后插入:

```js
// ---- Toast(替代 alert):type "success"(默认)| "error" ----
function toast(msg, type = "success") {
  let box = $("#toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " error" : "");
  el.textContent = msg;
  const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  el.onclick = dismiss;
  setTimeout(dismiss, 3500);
  box.appendChild(el);
}

// ---- 确认框(替代 confirm):Promise<boolean>,Esc/取消 = false ----
function confirmDialog(message) {
  const dlg = $("#confirm-dialog");
  $("#confirm-msg").textContent = message;
  return new Promise((resolve) => {
    const ok = $("#confirm-ok");
    const cancel = $("#confirm-cancel");
    const done = (val) => {
      ok.onclick = cancel.onclick = null;
      dlg.oncancel = null;
      dlg.close();
      resolve(val);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    dlg.oncancel = () => done(false);
    dlg.showModal();
  });
}
```

- [ ] **Step 2: 替换 `render()` 为 t() + 图标版(完整函数)**

```js
function render() {
  const ids = orderedIds();
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", ids.length > 0);
  ids.forEach((id) => {
    const p = state.providers.find((x) => x.id === id);
    if (!p) return;
    const card = document.createElement("div");
    card.className = "card" + (p.isDefault ? " active" : "");
    card.draggable = true;
    card.dataset.id = id;
    const modelKeys = Object.keys(p.config.models ?? {});
    const activeMid = state.activeModel.startsWith(id + "/") ? state.activeModel.slice(id.length + 1) : "";
    card.innerHTML = `
      <div class="top">
        <span class="drag">≡</span>
        <span class="name">${escapeHtml(p.config.name ?? id)}</span>
        ${p.isDefault ? `<span class="badge">${t("card.default")}</span>` : ""}
      </div>
      <div class="meta">${escapeHtml(p.config.options?.baseURL ?? "")}</div>
      ${state.metadata.notes?.[id] ? `<div class="meta">📝 ${escapeHtml(state.metadata.notes[id])}</div>` : ""}
      <div class="meta">${t("card.models", { n: modelKeys.length })}</div>
      <div class="ops">
        ${modelKeys.length > 0
          ? `<span class="dropdown">
              <button type="button" class="dd-btn${p.isDefault ? " dd-current" : ""}" data-dd="${id}" aria-haspopup="menu" aria-expanded="false">${p.isDefault ? `<span class="dd-label">${t("card.defaultModel")}</span><span class="dd-value" title="${escapeHtml(activeMid)}">${escapeHtml(activeMid)}</span>` : t("card.setDefault")} <span class="caret">▾</span></button>
              <div class="dd-menu hidden" data-ddmenu="${id}" role="menu">
                ${modelKeys.map((m) => {
                  const cfg = p.config.models?.[m];
                  const nm = cfg?.name && cfg.name !== m ? `<span class="dd-name">${escapeHtml(cfg.name)}</span>` : "";
                  const cur = p.isDefault && m === activeMid ? ' class="dd-item on"' : ' class="dd-item"';
                  return `<button type="button"${cur} role="menuitem" data-dditem="${id}" data-model="${escapeHtml(m)}" title="${escapeHtml(m)}">${escapeHtml(m)}${nm}</button>`;
                }).join("")}
              </div>
            </span>`
          : p.isDefault
            ? ""
            : `<button data-act="activate" data-id="${id}">${t("card.setDefault")}</button>`}
        <button class="ghost" data-act="edit" data-id="${id}">${ICONS.edit}${t("card.edit")}</button>
        <button class="ghost" data-act="dup" data-id="${id}">${ICONS.copy}${t("card.dup")}</button>
        <button data-act="del" data-id="${id}" class="danger">${t("card.del")}</button>
      </div>`;
    card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); });
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain");
      const ids = orderedIds();
      const fromIdx = ids.indexOf(from);
      const toIdx = ids.indexOf(id);
      // 外部拖入(非卡片)时 fromIdx 为 -1,splice(-1,1) 会误删末位,必须拦截
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, from);
      api("/api/order", { method: "PUT", body: JSON.stringify({ ids }) })
        .then(() => { toast(t("toast.ordered")); refresh(); });
    });
    listEl.appendChild(card);
  });
}
```

- [ ] **Step 3: 替换 `renderAuth()` 为 t() 版(完整函数)**

```js
function renderAuth() {
  authSectionEl.classList.toggle("hidden", authProviders.length === 0);
  authEmptyEl.classList.toggle("hidden", authProviders.length > 0);
  authListEl.innerHTML = "";
  authProviders.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="top">
        <span class="name">${escapeHtml(p.id)}</span>
        <span class="badge auth-type">${escapeHtml(p.type)}</span>
      </div>
      <div class="meta">${t("auth.type", { type: p.type })}${p.hasMetadata ? t("auth.hasMeta") : ""}</div>
      <div class="ops">
        <button data-auth-act="logout" data-auth-id="${escapeHtml(p.id)}" class="danger">${t("auth.logout")}</button>
      </div>`;
    authListEl.appendChild(card);
  });
}
```

- [ ] **Step 4: `openForm()` 标题走 t()**

`$("#form-title").textContent = editingId ? "编辑供应商" : "添加供应商";` 改为:

```js
  $("#form-title").textContent = editingId ? t("form.edit") : t("form.add");
```

- [ ] **Step 5: `renderModels()` 的 col1 模板与删除按钮 title 走 t()**

`col1.innerHTML = ...` 整块替换为:

```js
    col1.innerHTML = `
      <div class="m-id" title="${escapeHtml(id)}">${escapeHtml(id)}</div>
      <div class="m-name" title="${escapeHtml(m?.name ?? "")}">${escapeHtml(m?.name ?? "")}</div>
      <div class="m-limit">
        <span>${t("m.limitCtx")}</span><input class="limit-input" data-lk="context" inputmode="numeric" value="${ctx}" placeholder="?">
        <span>${t("m.limitOut")}</span><input class="limit-input" data-lk="output" inputmode="numeric" value="${out}" placeholder="?">
      </div>
      <div class="m-modalities">
        <span>${t("m.modalities")}</span>
        <span><input type="checkbox" data-mod="text" checked disabled> text</span>
        <span><input type="checkbox" data-mod="image" ${modIn.includes("image") ? "checked" : ""}> image</span>
        <span><input type="checkbox" data-mod="audio" ${modIn.includes("audio") ? "checked" : ""}> audio</span>
        <span><input type="checkbox" data-mod="video" ${modIn.includes("video") ? "checked" : ""}> video</span>
        <span><input type="checkbox" data-mod="pdf" ${modIn.includes("pdf") ? "checked" : ""}> pdf</span>
      </div>
      <div class="m-reasoning">
        <span>${t("m.reasoning")}</span>
        <select class="reasoning-select" data-rs>
          <option value="" ${rsVal === "" ? "selected" : ""}>${t("m.rsUnset")}</option>
          <option value="true" ${rsVal === "true" ? "selected" : ""}>${t("m.rsYes")}</option>
          <option value="false" ${rsVal === "false" ? "selected" : ""}>${t("m.rsNo")}</option>
        </select>
      </div>`;
```

`del.title = "删除模型";` 改为 `del.title = t("m.delModel");`

- [ ] **Step 6: 其余散落字符串 —— 精确替换表**

逐条替换。定位方式:按「位置(函数)」列找到函数,再查找原代码;`alert(err.message);` 等同一代码出现在多个函数中时,**所有出现处全部替换**。

| 位置(函数) | 原代码 | 新代码 |
|---|---|---|
| `api()` | `throw new Error(body.error \|\| "请求失败");` | `throw new Error(body.error \|\| t("err.generic"));` |
| `renderVariantsInto` | `group("内置变体", b)` | `group(t("v.builtin"), b)` |
| `renderVariantsInto` | `group("官方变体", o)` | `group(t("v.official"), o)` |
| `renderVariantsInto` | `cH.textContent = "自定义";` | `cH.textContent = t("v.custom");` |
| `renderVariantsInto` | `add.placeholder = "自定义变体名";` | `add.placeholder = t("v.customPh");` |
| `renderVariantsInto` | `addBtn.textContent = "添加";` | `addBtn.textContent = t("v.add");` |
| `renderVariantsInto` | `document.createTextNode("无内置/官方记录,可自定义添加 · ")` | `document.createTextNode(t("v.empty"))` |
| `renderVariantsInto` | `link.textContent = "管理官方库";` | `link.textContent = t("v.manage");` |
| `renderVariantsInto` | `clear.textContent = "清空";` | `clear.textContent = t("v.clear");` |
| `renderVbList` | `` `<p class="empty">暂无条目,点击「+ 新增条目」录入。</p>` `` | `` `<p class="empty">${t("vb.empty")}</p>` `` |
| `renderVbList` | `` `模态 ${e.modalities.input.join("+")}` `` | `` `${t("vb.modalities")} ${e.modalities.input.join("+")}` `` |
| `renderVbList` | `e.reasoning === true ? "推理:支持" : e.reasoning === false ? "推理:不支持" : ""` | `e.reasoning === true ? \`${t("vb.reasoning")}:${t("m.rsYes")}\` : e.reasoning === false ? \`${t("vb.reasoning")}:${t("m.rsNo")}\` : ""` |
| `renderVbList` | `editBtn.textContent = "编辑";` | `editBtn.textContent = t("vb.edit");` |
| `renderVbList` | `copyBtn.textContent = "复制";` | `copyBtn.textContent = t("vb.copy");` |
| `renderVbList` | `delBtn.textContent = "删除";` | `delBtn.textContent = t("vb.del");` |
| `vb-extract` 点击 | `btn.textContent = "提取中...";` | `btn.textContent = t("vb.extracting");` |
| `vb-extract` 点击 | `alert("提取失败: " + err.message);` | `toast(t("err.extract", { msg: err.message }), "error");` |
| `vb-form` 提交 | `` alert(`条目 ${id} 已存在,请换一个 ID`); `` | `toast(t("vb.exists", { id }), "error");` |
| `vb-form` 提交 | `closeVbForm();` 之后无反馈 | `closeVbForm();` 后新增一行 `toast(t("toast.vbSaved"));` |
| `vb-form` 提交 | `alert(err.message);` | `toast(err.message, "error");` |
| `vb-list` 删除 | `` if (!confirm(`删除条目 ${id}?`)) return; `` | `if (!(await confirmDialog(t("vb.delConfirm", { id })))) return;` |
| `vb-list` 删除 | `await api(...)` 成功后无反馈 | `await api(...)` 后新增一行 `toast(t("toast.vbDeleted"));` |
| `vb-list` 删除 | `alert(err.message);` | `toast(err.message, "error");` |
| `btn-fetch-models` | `btn.disabled = true; btn.textContent = "获取中...";` | `btn.disabled = true; btn.textContent = t("form.fetching");` |
| `btn-fetch-models` | `alert("获取模型失败: " + e.message);` | `toast(t("err.fetchModels", { msg: e.message }), "error");` |
| `btn-fetch-models` | `btn.textContent = "获取模型";` | `btn.textContent = t("form.fetchModels");` |
| `provider-form` 提交 | `dialog.close();` 之前无成功反馈 | `dialog.close();` 前新增:`toast(t("toast.saved", { id: savedId }));` |
| `provider-form` 提交 | `alert(err.message);` | `toast(err.message, "error");` |
| 列表点击 handler | `alert(err.message);` | `toast(err.message, "error");` |
| 列表点击 dd-item | `await refresh();` 后无反馈 | `await refresh();` 后新增 `` toast(t("toast.activated", { model: `${ddItem.dataset.dditem}/${ddItem.dataset.model}` })); `` |
| 列表点击 activate | `await api(...activate...);` 成功后 | `await refresh();` 后新增 `` toast(t("toast.activated", { model: `${id}/${modelId}` })); `` |
| 列表点击 dup | `await api(`/api/providers/${id}/duplicate`, { method: "POST" });` | `const dupRes = await api(`/api/providers/${id}/duplicate`, { method: "POST" });` 并在 `await refresh();` 后新增 `toast(t("toast.duplicated", { id: dupRes.id }));` |
| 列表点击 del | `` const msg = isDefault ? `删除供应商 ${id}?这是当前默认供应商,删除后默认会自动切到其他供应商。` : `删除供应商 ${id}?`; `` 与 `if (!confirm(msg)) return;` | `const msg = isDefault ? t("card.delConfirmDefault", { id }) : t("card.delConfirm", { id });` 与 `if (!(await confirmDialog(msg))) return;` |
| 列表点击 del | `await api(..., { method: "DELETE" });` 成功后 | `await refresh();` 后新增 `toast(t("toast.deleted", { id }));` |
| auth 登出 | `` if (!confirm(`登出已登录供应商 ${id}?登出后移除其认证,重新登录可恢复。`)) return; `` | `if (!(await confirmDialog(t("auth.logoutConfirm", { id })))) return;` |
| auth 登出 | `await refresh();` 后无反馈 | `await refresh();` 后新增 `toast(t("toast.loggedOut", { id }));` |
| auth 登出 | `alert(err.message);` | `toast(err.message, "error");` |
| 文件末尾 refresh catch | `` `<p class="empty">未找到 mimocode.jsonc,请先运行 mimocode 生成配置,或设置 MIMOCODE_HOME 环境变量。</p>` `` | `` `<p class="empty">${t("empty.noconfig")}</p>` `` |
| 文件末尾 refresh catch | `alert(e.message);` | `toast(e.message, "error");` |

注意:列表点击 handler 是同一个 `try` 内多个分支共用末尾的 `await refresh();`——toast 加在各分支 `api()` 调用之后、`refresh()` 之前亦可,顺序不影响结果,但必须保证失败时(进 catch)不弹成功 toast。

- [ ] **Step 7: 文件末尾注册 onLangChange 钩子**

在 Task 3 的 `applyI18nStatic();` 之后插入:

```js
window.onLangChange = () => {
  render();
  renderAuth();
  if (dialog.open) renderModels();
  if (vbDialog.open) renderVbList();
};
```

- [ ] **Step 8: 语法检查 + 手动验证**

Run: `bun build public/app.js --outfile test/.tmp/app-check.js` → 成功后删除产物
Run: `bun test` → 73 pass / 0 fail
手动: `bun server.ts`——中/英切换后卡片、下拉、模型表单、变体库列表全部即时换语言;删除供应商/删除条目/登出弹自定义确认框;保存/删除/复制/排序/登出出 toast;失败操作(如断网获取模型)出 error toast;全程无原生 alert/confirm 弹窗。

- [ ] **Step 9: Commit**

```bash
git add public/app.js
git commit -m "feat: Toast/确认框替代原生 alert/confirm,动态字符串全部走 t(),按钮图标化"
```

---

### Task 5: 四组合验证 + 文档收尾

**Covers:** S6

**Files:**
- Modify: `README.md`(功能列表)
- Modify: `README.en.md`(功能列表)
- Modify: `AGENTS.md`(架构/关键约束)

**Interfaces:**
- Consumes: Task 1-4 全部产物
- Produces: 无新代码接口

- [ ] **Step 1: 四组合 × 主流程验证矩阵**

`bun server.ts` 启动后,在 深色/浅色 × 中/英 四种组合下逐项过:

1. 首屏无主题闪烁(刷新观察);主题/语言选择刷新后保持
2. 供应商:添加(含获取模型失败路径)、编辑保存、复制、删除(默认与非默认各一,确认取消与确认删除都试)
3. 拖拽排序 + 外部文本拖入(应无反应,不错误删序)
4. 卡片下拉切换默认模型
5. 变体库:新增/编辑/复制/删除条目、重新提取内置目录
6. 内置供应商登出(若无 auth.json 条目,确认空态文案)
7. 任一 error toast(如把 baseURL 改成不可达地址后获取模型)
8. 缩窄窗口至 <480px 检查模型行布局不破坏

每组合不必全做 1-8:组合 A(深色+中文)全做;其余三组合做 1、2(仅编辑保存)、5(仅打开看排版)、8。

- [ ] **Step 2: `bun test` 全量回归**

Run: `bun test` → 73 pass / 0 fail(本特性不动后端,任何失败都说明误改了 lib/test,必须回查)。

- [ ] **Step 3: README 功能列表补充**

`README.md` 功能列表末尾(`- 卡片拖拽排序` 之后)追加:

```markdown
- 深色/浅色主题切换(默认跟随系统)与中/英文界面切换,偏好存 localStorage
```

`README.en.md` 功能列表末尾(`- Drag-and-drop card ordering` 之后)追加:

```markdown
- Dark/light theme toggle (follows system by default) and Chinese/English UI switch, persisted in localStorage
```

- [ ] **Step 4: AGENTS.md 同步**

架构段 `public/`:原生 HTML/CSS/JS,无框架无构建 一行改为:

```markdown
- `public/`:原生 HTML/CSS/JS,无框架无构建;`i18n.js` 提供中/英字典与 `t()`,主题经 `<html data-theme>` + CSS 变量切换,两者偏好存 localStorage(`ui-theme`/`ui-lang`)
```

关键约束段末尾追加一行:

```markdown
- UI 文案一律经 `public/i18n.js` 的 `t()` 输出(后端报错文案保持中文除外);新增界面文本必须双语入字典并用 `data-i18n`/`t()` 接入
```

- [ ] **Step 5: Commit**

```bash
git add README.md README.en.md AGENTS.md
git commit -m "docs: README/AGENTS 补主题与中英文切换说明及 i18n 约束"
```

---

## 完成定义(Definition of Done)

- Task 1-5 全部 commit,`git log` 5 个新提交
- `bun test` 73 pass / 0 fail;`bun build` 两个 JS 文件均通过
- 四组合验证矩阵通过;无原生 alert/confirm 残留(`grep -n "alert\|confirm(" public/app.js` 仅剩 `confirmDialog` 定义与注释)
- spec S7(明确不做)未被违反:server.ts/lib/test 零改动(`git diff` 验证)
