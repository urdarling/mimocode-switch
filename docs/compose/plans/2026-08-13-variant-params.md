# 变体参数携带(修复 variants 空对象) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本项目 UI 生成的 variants 携带参数映射(`{reasoningEffort: v}`),修复 mimo 请求体收不到思考强度参数的问题。

**Architecture:** 数据层(`catalog-extract.ts` 提取 `variantParams` + 快照/官方库携带) → 校验层(`server.ts` PUT official 校验) → 前端(`prefillVariants`/chips 点击写入参数对象)。三处改动各自独立可测,最后端到端验证。

**Tech Stack:** Bun + TypeScript(lib/),原生 JS(public/),bun:test。

## Global Constraints

- 供应商 id 必须匹配 `^[a-z0-9-]+$`(`lib/provider-ops.ts`)
- `variants` 字符串数组字段**保持不变**(UI chips 与现有测试依赖)
- `variantParams` 为可选字段,无则省略键,保持输出最小化
- 映射规则固定:effort 型变体名 `v` → `{ reasoningEffort: v }`(AI SDK 自动转 `reasoning_effort`)
- 不新增依赖、不改 mimocode.json 写入格式(变体对象本来就透传)
- 测试用 `test/helpers.ts` 的 `makeTestDir`,临时文件放 `test/.tmp/`
- 改 lib 层逻辑优先,前端仅消费数据

---

### Task 1: catalog-extract 提取 variantParams

**Covers:** [S2], [S3]

**Files:**
- Modify: `lib/catalog-extract.ts:1-36`(接口), `lib/catalog-extract.ts:64-72`(values 解析)
- Test: `test/catalog-extract.test.ts`

**Interfaces:**
- Consumes: 无(现有 `extractCatalog(text)` 签名不变)
- Produces: `CatalogSnapshot` 新增 `variantParams?: Record<string, Record<string, unknown>>`;effort 型条目的每个变体名 → `{ reasoningEffort: <名> }`

- [ ] **Step 1: 写失败测试**(追加到 `test/catalog-extract.test.ts`)

```ts
test("effort 型变体提取 variantParams 映射", () => {
  const text = `"deepseek/deepseek-v4-flash":{id:"deepseek/deepseek-v4-flash",reasoning:!0,reasoning_options:[{type:"effort",values:["high","max"]}],tool_call:!0,limit:{context:1e6,output:384000}}`;
  const out = extractCatalog(text);
  expect(out["deepseek-v4-flash"]?.variantParams).toEqual({
    high: { reasoningEffort: "high" },
    max: { reasoningEffort: "max" },
  });
});

test("toggle 型不产生 variantParams", () => {
  const text = `"a":{id:"a",reasoning:!0,reasoning_options:[{type:"toggle"}]}`;
  const out = extractCatalog(text);
  expect(out["a"]?.variantParams).toBeUndefined();
});

test("同模型多条目 variantParams 按变体名合并", () => {
  const text =
    `"deepseek/deepseek-v4-flash":{id:"deepseek/deepseek-v4-flash",reasoning:!0,reasoning_options:[{type:"effort",values:["high","max"]}]}` +
    `,"x/deepseek-v4-flash":{id:"x/deepseek-v4-flash",reasoning:!0,reasoning_options:[{type:"effort",values:["high","low"]}]}`;
  const out = extractCatalog(text);
  expect(out["deepseek-v4-flash"]?.variantParams).toEqual({
    high: { reasoningEffort: "high" },
    max: { reasoningEffort: "max" },
    low: { reasoningEffort: "low" },
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test test/catalog-extract.test.ts`
Expected: FAIL(`variantParams` undefined)

- [ ] **Step 3: 实现**

`lib/catalog-extract.ts:1-6` 接口加字段:

```ts
export interface CatalogSnapshot {
  reasoning: boolean;
  variants: string[];
  variantParams?: Record<string, Record<string, unknown>>;
  limit?: { context?: number; output?: number };
}
```

`lib/catalog-extract.ts:64-72` 处,把 values 提取与 params 构建放在一起:

```ts
let values: string[] = [];
const params: Record<string, Record<string, unknown>> = {};
for (const item of arrText.matchAll(/\{type:"effort",values:\[([^\]]*)\]\}/g)) {
  values = item[1].match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
  for (const v of values) params[v] = { reasoningEffort: v };
}
```

`lib/catalog-extract.ts:70-72` 聚合处:

```ts
const prev = out[modelId] ?? { reasoning: false, variants: [] as string[] };
prev.reasoning = prev.reasoning || hasToggle || values.length > 0 || reasoningFlag;
prev.variants = [...new Set([...prev.variants, ...values])];
prev.variantParams = { ...prev.variantParams, ...params };
```

- [ ] **Step 4: 运行确认通过**

Run: `bun test test/catalog-extract.test.ts`
Expected: PASS(6 个测试全过)

- [ ] **Step 5: 提交**

```bash
git add lib/catalog-extract.ts test/catalog-extract.test.ts
git commit -m "feat: catalog-extract 提取 effort 型变体的 variantParams 参数映射"
```

---

### Task 2: 重新生成内置快照

**Covers:** [S2]

**Files:**
- Regenerate: `data/variants/mimo.json`(脚本生成,勿手改)

**Interfaces:**
- Consumes: Task 1 的 `extractCatalog` 输出
- Produces: 含 `variantParams` 的内置快照(如 glm-5.2、grok-4.5 等 effort 型模型)

- [ ] **Step 1: 运行提取脚本**

Run: `bun run scripts/extract-mimo-catalog.ts`
Expected: `已提取 → data/variants/mimo.json(N 个模型);该文件由脚本生成,勿手改`,且自检通过(deepseek-v4-flash 含 high/max)

- [ ] **Step 2: 抽查新字段**

Run: `bun -e "const j=await Bun.file('data/variants/mimo.json').json(); console.log('glm-5.2', JSON.stringify(j['glm-5.2']?.variantParams)); console.log('grok-4.5', JSON.stringify(j['grok-4.5']?.variantParams)); console.log('mimo-v2.5-pro', JSON.stringify(j['mimo-v2.5-pro']?.variantParams))"`
Expected: glm-5.2 与 grok-4.5 有 variantParams 且值为 `{reasoningEffort: 同名}`;mimo-v2.5-pro(toggle 型)无或为 undefined

- [ ] **Step 3: 提交**

```bash
git add data/variants/mimo.json
git commit -m "data: 重新生成内置快照,携带 effort 型变体的 variantParams"
```

---

### Task 3: server 校验 variantParams

**Covers:** [S4]

**Files:**
- Modify: `server.ts:104-137`(PUT /api/variants/official 逐条校验)
- Test: `test/variants-store.test.ts`

**Interfaces:**
- Consumes: 现有 PUT body 结构(条目对象)
- Produces: 非法 `variantParams` → 400(带条目 id 与字段名);合法透传

- [ ] **Step 1: 读现有校验块,写失败测试**

先读 `server.ts` 104-137 确认现有校验结构(预计是逐条循环 + `fail(400, ...)` 风格)。在 `test/variants-store.test.ts` 追加:

```ts
import { describe, expect, test } from "bun:test";
import { makeTestDir } from "./helpers";
import { readOfficialVariants, writeOfficialVariants } from "../lib/variants-store";
import { join } from "node:path";

// server 校验逻辑在 server.ts 内联,此处以 write/read 的 round-trip 验证数据层不丢字段
describe("variants-store variantParams", () => {
  test("write 保留 variantParams 字段", () => {
    const dir = makeTestDir();
    const file = join(dir, "official.json");
    const entries = {
      "grok-4.6": {
        name: "grok-4.6",
        variants: ["low", "medium", "high"],
        variantParams: { low: { reasoningEffort: "low" }, medium: { reasoningEffort: "medium" }, high: { reasoningEffort: "high" } },
        source: "",
        updated: "2026-08-13",
      },
    };
    writeOfficialVariants(file, entries);
    const back = readOfficialVariants(file);
    expect(back["grok-4.6"]?.variantParams).toEqual(entries["grok-4.6"].variantParams);
  });

  test("无 variantParams 的条目读写后不出现该键", () => {
    const dir = makeTestDir();
    const file = join(dir, "official.json");
    const entries = { "a": { name: "A", variants: ["low"], source: "", updated: "2026-08-13" } };
    writeOfficialVariants(file, entries);
    const back = readOfficialVariants(file);
    expect(back["a"]).not.toHaveProperty("variantParams");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `bun test test/variants-store.test.ts`
Expected: FAIL(write 后 variantParams 丢失或键未保留)

- [ ] **Step 3: 确认 helpers 导出 `makeTestDir`**

Run: `bun test test/variants-store.test.ts`(若 helpers 无此导出,读 `test/helpers.ts` 用其真实 API 修正测试导入)
Expected: PASS 或按 helpers 实际 API 修正后 PASS

- [ ] **Step 4: 实现 server 校验**

读 `server.ts:104-137` 现有校验,在 variants 数组校验后追加(保持现有风格,内联):

```ts
if (entry.variantParams !== undefined) {
  const vp = entry.variantParams as unknown;
  if (typeof vp !== "object" || vp === null || Array.isArray(vp)) {
    return fail(400, `条目 ${id} 的 variantParams 必须是对象`);
  }
  for (const [vname, vval] of Object.entries(vp as Record<string, unknown>)) {
    if (typeof vval !== "object" || vval === null || Array.isArray(vval)) {
      return fail(400, `条目 ${id} 的 variantParams.${vname} 必须是对象`);
    }
  }
}
```

(注意:校验在 server.ts 的 fetch 内联块,需与现有 `fail`/`ok` 返回路径一致;具体插入位置以读到的现有代码为准)

- [ ] **Step 5: 运行确认通过 + 语法检查**

Run: `bun test` 与 `bun build server.ts --outfile test/.tmp/server_check.js`
Expected: 全测试 PASS(42+N),server 构建无错

- [ ] **Step 6: 提交**

```bash
git add server.ts test/variants-store.test.ts
git commit -m "feat: PUT /api/variants/official 校验 variantParams 字段"
```

---

### Task 4: 前端预填与 chips 点击携带参数

**Covers:** [S5]

**Files:**
- Modify: `public/app.js:137-142`(prefillVariants), `public/app.js:159-165`(chips 点击)

**Interfaces:**
- Consumes: `variantData.official[id].variantParams` / `variantData.builtin[id].variantParams`(Task 2 快照提供)
- Produces: `models[id].variants[v]` 为参数对象而非空对象

- [ ] **Step 1: 修改 prefillVariants**

`public/app.js:137-142` 替换为:

```js
function prefillVariants(id) {
  const o = variantData.official?.[id];
  const b = variantData.builtin?.[id];
  const src = o?.variantParams ?? b?.variantParams ?? {};
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, src[v] ?? {}])) : null;
}
```

- [ ] **Step 2: 修改 chips 点击**

`public/app.js:159-165` 的 `makeChip` 中 `isOn` 为 false 分支,替换为:

```js
} else {
  models[modelId].variants ??= {};
  const src = variantData.official?.[modelId]?.variantParams?.[v]
    ?? variantData.builtin?.[modelId]?.variantParams?.[v]
    ?? {};
  models[modelId].variants[v] = src;
}
```

- [ ] **Step 3: 语法检查**

Run: `bun build public/app.js --outfile test/.tmp/app_check.js`
Expected: 构建成功(0 错误)

- [ ] **Step 4: 提交**

```bash
git add public/app.js
git commit -m "fix: variants 预填与 chips 点击携带 reasoningEffort 参数,修复变体参数不生效"
```

---

### Task 5: 官方库补数据 + 说明键

**Covers:** [S6]

**Files:**
- Modify: `data/variants/official.json`(grok-4.6 条目 + `//` 说明键)

**Interfaces:**
- Consumes: Task 3 校验(合法 variantParams 可 PUT)
- Produces: grok-4.6 携带 low/medium/high 的 reasoningEffort 映射

- [ ] **Step 1: 读当前 official.json**

Run: 读 `data/variants/official.json`,确认 grok-4.6 条目与 `//` 说明键现状(已在 spec S6 描述,以实际为准)

- [ ] **Step 2: 编辑 grok-4.6 条目**

在 `grok-4.6` 条目加 `variantParams`:

```json
"grok-4.6": {
  "name": "grok-4.6",
  "variants": ["low", "medium", "high", "xhigh"],
  "variantParams": {
    "low": { "reasoningEffort": "low" },
    "medium": { "reasoningEffort": "medium" },
    "high": { "reasoningEffort": "high" }
  },
  "source": "",
  "updated": "2026-08-13",
  "limit": { "context": 500000, "output": 128000 }
}
```

同时更新 `//` 说明键:追加 `variantParams 可选(变体名→请求参数映射,如 {\"high\":{\"reasoningEffort\":\"high\"}}),effort 型变体必填以生效思考强度`。

- [ ] **Step 3: JSON 合法性验证**

Run: `bun -e "JSON.parse(await Bun.file('data/variants/official.json').text()); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: 提交**

```bash
git add data/variants/official.json
git commit -m "data: 官方库 grok-4.6 补 variantParams,说明键更新维护方法"
```

---

### Task 6: 端到端验证

**Covers:** [S7]

**Files:** 无(验证)

**Interfaces:**
- Consumes: 全部前置任务
- Produces: 证据

- [ ] **Step 1: 全量测试**

Run: `bun test`
Expected: 全 PASS(42 + 新增)

- [ ] **Step 2: 全文件语法检查**

Run: `bun build public/app.js --outfile test/.tmp/app_check.js && bun build server.ts --outfile test/.tmp/server_check.js`
Expected: 两个都成功

- [ ] **Step 3: 冒烟(临时 MIMOCODE_HOME,不污染真实配置)**

Run: 设 `MIMOCODE_HOME=<test/.tmp/home>` 启动 server,验证:
- GET /api/variants 的 builtin 条目含 variantParams
- 添加带内置 variantParams 的模型(glm-5.2)→ 保存 → 临时 mimocode.json 的 variants 带 reasoningEffort
- 官方库 PUT 合法 variantParams 成功;非法(值非对象)→ 400

- [ ] **Step 4: 真实端到端(可选,需用户配合)**

本机真实配置:在 UI 中为 grok-4.6 重新保存一次(变体自动带 reasoningEffort),或手动补 mimocode.json 后,发起对话,查日志 `requestBodyValues` 是否含 `reasoning_effort`;或让朋友看中转站后台。**此项记录结果到最终报告,失败则回查。**

- [ ] **Step 5: 写最终报告**

Create: `docs/compose/reports/variant-params.md`(实现状态、验证证据、遗留问题:如 xhigh 非官方值、其他模型思考开关映射差异)

```bash
git add docs/compose/reports/variant-params.md docs/compose/specs/2026-08-13-variant-params.md docs/compose/plans/2026-08-13-variant-params.md
git commit -m "docs: variant-params 最终报告与 spec/plan"
```
