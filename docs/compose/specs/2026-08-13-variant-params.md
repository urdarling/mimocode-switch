# 变体参数携带:修复 variants 空对象导致思考强度参数不生效 — Design Spec

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/variant-params.md)

## [S1] Problem

通过本项目 UI 添加/更新模型后,`mimocode.json` 中 `provider.<id>.models.<mid>.variants` 的每个变体都是**空对象**:

```json
"grok-4.6": {
  "variants": { "low": {}, "medium": {}, "high": {}, "xhigh": {} }
}
```

而 mimo 运行时的语义是:选中变体后把该变体对象的值**合并进请求体**。空对象 = 不携带任何参数 → 上游服务器收不到 `reasoning_effort` 等思考强度参数。

- 对比 `gpt-5.6-luna`(有效):`"high": { "reasoningEffort": "high" }` —— 日志实证其请求体带 `"reasoning_effort":"high"`(AI SDK 将 camelCase `reasoningEffort` 转 snake_case `reasoning_effort`)
- 根因在本项目 UI `public/app.js` 的 `prefillVariants`(及 chips 点击):

```js
function prefillVariants(id) {
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, {}])) : null; // ← 全是空对象
}
```

变体名来自内置快照/官方库(仅名字数组),参数映射从未被提取或录入。

需求:变体预填与手动添加时携带参数映射;effort 型变体 → `{ reasoningEffort: "<变体名>" }`(与 mimo 内置 F4 对 openai-compatible/xai 的默认映射一致)。

## [S2] 数据模型

**内置快照 `data/variants/mimo.json`**(脚本生成,勿手改)条目新增可选字段:

```json
{
  "reasoning": true,
  "variants": ["low", "medium", "high"],
  "variantParams": {
    "low": { "reasoningEffort": "low" },
    "medium": { "reasoningEffort": "medium" },
    "high": { "reasoningEffort": "high" }
  },
  "limit": { "context": 500000, "output": 128000 }
}
```

- `variants` 保留字符串数组(UI chips 与兼容性依赖),不变
- `variantParams` 可选:`Record<变体名, Record<string, unknown>>`,仅 effort 型 `reasoning_options` 产生;toggle 型(如 mimo-v2.5-pro)不产生
- 映射规则固定:`{type:"effort",values:["a","b"]}` → 每个值 `v` 得 `{ v: { reasoningEffort: v } }` —— 与 mimo F4 对 `@ai-sdk/openai-compatible` / `@ai-sdk/xai` 的默认映射一致(`reasoningEffort` 由 AI SDK 自动转 `reasoning_effort`)

**官方库 `data/variants/official.json`** 条目新增同构可选字段 `variantParams`,手动维护;`//` 说明键更新写明维护方法。

## [S3] 提取脚本

`lib/catalog-extract.ts` 在解析 `reasoning_options` 时,除现有 `values` 名字数组外,同步构建 `variantParams`:

- 现有逻辑:`arrText.matchAll(/\{type:"effort",values:\[([^\]]*)\]\}/g)` 提取名字
- 新增:同一匹配里为每个名字 `v` 生成 `params[v] = { reasoningEffort: v }`
- 多条目聚合(`prev.variants` 的 Set 合并)时,`variantParams` 按变体名合并(同名参数一致,后写覆盖同值无害)
- `CatalogSnapshot` 接口加 `variantParams?: Record<string, Record<string, unknown>>`
- 输出 JSON 无 variantParams 条目不写该键(保持现状输出最小化)

## [S4] server 校验

`PUT /api/variants/official` 逐条校验(server.ts:104-137 现有 variants 校验风格)新增:

- `variantParams` 若存在,必须是对象且非数组
- 每个键必须是字符串(变体名),每个值必须是对象
- 任一不满足 → 400,带条目 id 与字段名

## [S5] 前端

`public/app.js`:

1. **`prefillVariants(id)`**:优先取官方/内置的 `variantParams` 生成参数对象,无则回退 `{}`:

```js
function prefillVariants(id) {
  const o = variantData.official?.[id];
  const b = variantData.builtin?.[id];
  const src = o?.variantParams ?? b?.variantParams ?? {};
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, src[v] ?? {}])) : null;
}
```

2. **`renderVariantsInto` chips 点击**(app.js:159-165):点击已知变体时,若 `variantData` 有该变体的参数映射则写入,否则 `{}`:

```js
const src = variantData.official?.[modelId]?.variantParams?.[v] ?? variantData.builtin?.[modelId]?.variantParams?.[v] ?? {};
models[modelId].variants ??= {}; models[modelId].variants[v] = src;
```

3. **`btn-add-model` / `btn-fetch-models`**(app.js:463-484):新增模型走 `prefillVariants`,自动获得参数,无需改动

4. UI 其余(渲染、保存)不变 —— 参数对象随 `models` 一起提交,`buildProvider` 已透传(`provider-ops.ts:47-49`)

## [S6] 数据维护

`data/variants/official.json` 的 `grok-4.6` 条目补 `variantParams`(`low/medium/high` → `reasoningEffort`;`xhigh` 非 xAI 官方值,保留名字但无参数,用户可自行编辑);文件头 `//` 说明键追加 `variantParams` 维护说明。

## [S7] 验证

- `bun test` 全绿(现有 42 个;新增 catalog-extract 的 variantParams 提取测试、variants-store 校验测试)
- `bun build public/app.js --outfile test/.tmp/app_check.js` 语法通过
- 冒烟(临时 MIMOCODE_HOME):添加带内置 variantParams 的模型(如 glm-5.2)→ 保存后 `mimocode.json` variants 带 `reasoningEffort`;官方库录入带 variantParams 条目 PUT 成功;非法 variantParams(值非对象)→ 400
- 端到端(本机真实请求):为 grok-4.6 变体补 reasoningEffort 后,对话请求日志 `requestBodyValues` 出现 `reasoning_effort`;或朋友中转站后台日志确认
