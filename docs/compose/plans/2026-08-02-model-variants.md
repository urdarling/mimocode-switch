# 模型变体标注与选用 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/model-variants.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加第三方供应商时,按模型 ID 标注 mimo 内置与官方文档已知的变体,并允许选用一组写入配置。

**Architecture:** 双数据源(`data/variants/mimo.json` 提取自本机 mimo.exe 内嵌目录 + `data/variants/official.json` 手维护)→ `GET /api/variants` 合并暴露 → 供应商表单模型行标注 + 「选用变体」输入 → 保存时写入 `provider.<id>.models.<mid>.variants`。

**Tech Stack:** Bun TS + 原生 HTML/CSS/JS

## Global Constraints

- 不改 mimo 本体;只读解析本机 `mimo.exe`
- 数据文件路径固定 `data/variants/{mimo,official}.json`;文件不存在时 API 返回空对象,不报错
- `mimo.json` 由脚本生成,头部注释注明勿手改
- 现有 30 测试必须保持全绿;UI 文案保持中文
- 只提交用户明确要求提交的改动

---

### Task 1: 提取脚本 + 生成内置快照

**Covers:** [S3]

**Files:**
- Create: `scripts/extract-mimo-catalog.ts`
- Create: `data/variants/mimo.json`(脚本生成物)
- Create: `data/variants/official.json`(手维护,含示例条目)

**Interfaces:**
- Produces: `data/variants/mimo.json` — `{ "<modelId>": { "reasoning": bool, "variants": string[] } }`,键为裸模型 ID(id 字段最后一段)

- [ ] **Step 1: 创建脚本**

```ts
// scripts/extract-mimo-catalog.ts
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { globSync } from "bun";

function findBinary(): string {
  if (process.env.MIMO_BIN && existsSync(process.env.MIMO_BIN)) return process.env.MIMO_BIN;
  const prefixes = [
    process.env.npm_config_prefix,
    join(homedir(), "AppData", "Roaming", "npm"),
    "E:\\code\\op_develop\\npm_global",
  ].filter(Boolean) as string[];
  let cwd = process.cwd();
  while (cwd.length > 3) {
    prefixes.push(join(cwd, ".."));
    cwd = dirname(cwd);
  }
  for (const p of prefixes) {
    const base = join(p, "node_modules", "@mimo-ai");
    if (!existsSync(base)) continue;
    const hits = globSync(join(base, "**", "bin", "mimo.exe"));
    if (hits.length > 0) return hits.sort((a, b) => b.length - a.length)[0];
  }
  throw new Error("未找到 mimo.exe,请设置 MIMO_BIN 环境变量");
}

const bin = findBinary();
console.log(`mimo 二进制: ${bin}`);
const text = new TextDecoder("latin1").decode(readFileSync(bin));
const out: Record<string, { reasoning: boolean; variants: string[] }> = {};

const re = /"reasoning_options":(\[[^\]]*\])/g;
let m: RegExpExecArray | null;
let count = 0;
while ((m = re.exec(text))) {
  const back = text.slice(Math.max(0, m.index - 8192), m.index);
  const ids = [...back.matchAll(/"id":"([^"]+)"/g)];
  if (ids.length === 0) continue;
  const modelId = ids[ids.length - 1][1].split("/").pop()!;
  const arrText = m[1];
  let values: string[] = [];
  for (const item of arrText.matchAll(/\{type:"effort",values:\[([^\]]*)\]\}/g)) {
    values = item[1].match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
  }
  const hasToggle = /\{type:"toggle"\}/.test(arrText);
  const reasoningFlag = [...back.matchAll(/reasoning:(!0|!1)/g)].pop()?.[1] === "!0";
  const prev = out[modelId] ?? { reasoning: false, variants: [] as string[] };
  prev.reasoning = prev.reasoning || hasToggle || values.length > 0 || reasoningFlag;
  prev.variants = [...new Set([...prev.variants, ...values])];
  out[modelId] = prev;
  count++;
}
if (count === 0) throw new Error("未提取到任何 reasoning_options,二进制结构可能已变化");

const ds = out["deepseek-v4-flash"];
if (!ds || !ds.variants.includes("high") || !ds.variants.includes("max")) {
  throw new Error("自检失败: deepseek-v4-flash 应含 high/max");
}

const outPath = join(import.meta.dir, "..", "data", "variants", "mimo.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `// 由 scripts/extract-mimo-catalog.ts 生成,勿手改;mimo 升级后重跑 bun run scripts/extract-mimo-catalog.ts\n${JSON.stringify(out, null, 2)}\n`);
console.log(`已提取 ${count} 条 reasoning_options → ${outPath}(${Object.keys(out).length} 个模型)`);
```

- [ ] **Step 2: 创建官方库(含示例条目)**

`data/variants/official.json`:

```json
{
  "//": "官方文档变体库:手动维护。字段:name 显示名, variants 官方支持的变体列表, source 文档链接, updated 更新日期。新增条目:查模型官方文档确认支持哪些思考强度后追加。",
  "gpt-5.6": {
    "name": "GPT-5.6 (Sol)",
    "variants": ["low", "medium", "high", "xhigh", "max"],
    "source": "供应商推荐配置",
    "updated": "2026-08-02"
  },
  "gpt-5.6-luna": {
    "name": "GPT-5.6 Luna",
    "variants": ["low", "medium", "high", "xhigh", "max"],
    "source": "供应商推荐配置",
    "updated": "2026-08-02"
  }
}
```

- [ ] **Step 3: 运行脚本**

Run: `bun run scripts/extract-mimo-catalog.ts`
Expected: 输出 `已提取 N 条 reasoning_options → …mimo.json(M 个模型)`,退出码 0

- [ ] **Step 4: 抽样核对输出**

Run: `Get-Content data/variants/mimo.json -TotalCount 20`
Expected: 包含 `"deepseek-v4-flash": { "reasoning": true, "variants": ["high", "max"] }` 且文件头部为生成注释

---

### Task 2: lib 层透传 variants

**Covers:** [S6]

**Files:**
- Modify: `lib/provider-ops.ts`(ProviderInput/ProviderConfig 的 models 类型加 `variants`)
- Modify: `server.ts`(POST/PUT body 类型同步加 `variants`)
- Modify: `test/provider-ops.test.ts`(新增测试)

**Interfaces:**
- Consumes: 现有 `buildProvider`(models 已透传,仅需放宽类型)
- Produces: `ProviderInput.models[].variants?: Record<string, unknown>` 保存后原样保留

- [ ] **Step 1: 写失败测试**

`test/provider-ops.test.ts` 的 `describe("buildProvider")` 内追加:

```ts
test("models 透传 variants", () => {
  const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", variants: { low: {}, high: {} } } } });
  expect(p.models!.m.variants).toEqual({ low: {}, high: {} });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test test/provider-ops.test.ts`
Expected: 类型错误(`variants` 不在类型中),测试无法编译通过

- [ ] **Step 3: 放宽类型**

`lib/provider-ops.ts` 中 `ProviderInput.models` 与 `ProviderConfig.models` 的 `{ name?: string }` 改为 `{ name?: string; variants?: Record<string, unknown> }`;`server.ts` 中 POST `/api/providers` 与 PUT `/api/providers/:id` 的 body 类型 `models?: Record<string, { name?: string }>` 同样加 `variants?: Record<string, unknown>`。

- [ ] **Step 4: 运行确认通过**

Run: `bun test`
Expected: 31 pass / 0 fail

---

### Task 3: GET /api/variants

**Covers:** [S4]

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `data/variants/{mimo,official}.json`
- Produces: `{ builtin: {...}, official: {...} }` 响应

- [ ] **Step 1: 添加端点**

`server.ts` 的 `/api/config` 处理之后插入:

```ts
if (method === "GET" && pathname === "/api/variants") {
  const read = (p: string): Record<string, unknown> => {
    try {
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
    } catch {
      return {};
    }
  };
  return ok({
    builtin: read(join(import.meta.dir, "data", "variants", "mimo.json")),
    official: read(join(import.meta.dir, "data", "variants", "official.json")),
  });
}
```

- [ ] **Step 2: 冒烟**

启动服务器(`bun server.ts`),`Invoke-WebRequest http://127.0.0.1:4173/api/variants`
Expected: JSON 包含 `builtin.deepseek-v4-flash.variants` 与 `official["gpt-5.6-luna"]`

---

### Task 4: UI 标注 + 变体选用

**Covers:** [S5]

**Files:**
- Modify: `public/app.js`
- Modify: `public/style.css`
- (index.html 无需改动——模型行由 renderModels 动态生成)

**Interfaces:**
- Consumes: `/api/variants` 响应;`models[id].variants` 对象
- Produces: 保存 payload 的 `models` 含 `variants`;编辑时回显

- [ ] **Step 1: 拉取变体数据并存入状态**

`public/app.js`:`let variantData = { builtin: {}, official: {} };`;`refresh()` 内追加:

```js
fetch("/api/variants").then((r) => r.json()).then((d) => { if (d?.ok && d.data) variantData = d.data; }).catch(() => {});
```

- [ ] **Step 2: renderModels 行内标注 + 选用输入**

`renderModels()` 中行模板改为两行结构:

```js
row.innerHTML = `
  <div class="model-row-line">
    <input value="${escapeHtml(id)}" disabled>
    <span class="meta">${escapeHtml(m?.name ?? "")}</span>
  </div>
  <div class="model-row-line">
    <span class="meta variant-hint">${variantHint(id)}</span>
    <input class="variant-input" value="${escapeHtml((Object.keys(m?.variants ?? {})).join(", "))}" placeholder="选用变体,逗号分隔(留空=不声明)">
  </div>`;
```

新增 helper:

```js
function variantHint(id) {
  const b = variantData.builtin?.[id];
  const o = variantData.official?.[id];
  const bv = b?.variants?.length ? `内置: ${b.variants.join(", ")}` : "";
  const ov = o?.variants?.length ? `官方: ${o.variants.join(", ")}` : "";
  return [bv, ov].filter(Boolean).join(" | ") || "变体未知";
}
```

输入框 change 时写回 `models[id].variants`:

```js
const vi = row.querySelector(".variant-input");
vi.addEventListener("change", () => {
  const list = vi.value.split(",").map((x) => x.trim()).filter(Boolean);
  if (list.length > 0) models[id].variants = Object.fromEntries(list.map((v) => [v, {}]));
  else delete models[id].variants;
});
```

- [ ] **Step 3: 新模型自动预填变体**

`#btn-add-model` 与 `#btn-fetch-models` 中创建模型的代码 `models[m] = models[m] ?? { name: m }` 改为:

```js
models[m] = models[m] ?? { name: m, ...(prefillVariants(m) ? { variants: prefillVariants(m) } : {}) };
```

```js
function prefillVariants(id) {
  const o = variantData.official?.[id];
  const b = variantData.builtin?.[id];
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, {}])) : null;
}
```

- [ ] **Step 4: 样式**

`public/style.css` 追加:

```css
.model-row { flex-direction: column; align-items: stretch; gap: 4px; }
.model-row-line { display: flex; gap: 8px; align-items: center; }
.model-row-line input { flex: 1; }
.variant-hint { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.variant-input { font-size: 12px; }
```

- [ ] **Step 5: 验证**

Run: `bun build public/app.js --outfile $env:TEMP\app_check3.js` 无语法错误;`bun test` 全绿;服务器冒烟 `/api/variants` 200。

---

### Task 5: 最终验证

**Covers:** [S7]

**Files:** (无代码改动)

- [ ] **Step 1: 全量测试**

Run: `bun test`,预期 31 pass / 0 fail。

- [ ] **Step 2: 端到端冒烟**

启动服务器,依次验证:
1. `GET /api/variants` 返回 `builtin.deepseek-v4-flash` 与 `official["gpt-5.6-luna"]`
2. POST 一个带 `models[].variants` 的供应商 → `GET /api/config` 确认 `provider.<id>.models.<mid>.variants` 原样保存
3. UI:表单模型行显示"内置: high, max"与"官方: low, medium, high, xhigh, max",选用输入框预填,清空后保存无 variants 字段
