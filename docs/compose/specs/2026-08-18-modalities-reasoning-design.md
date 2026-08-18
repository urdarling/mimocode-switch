# modalities + reasoning 字段支持

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/modalities-reasoning.md)

## [S1] 问题

mimocode 通过模型配置中的 `modalities` 字段判断模型支持哪些输入模态（text/image/audio/video/pdf）。项目中配置的不在内置目录的自定义模型（如 qwen3.8-max）缺少此字段，导致 mimocode 默认只支持文本输入，图像识别等功能不可用。

同理，`reasoning` 字段声明模型是否支持推理。不在内置目录的模型缺此声明，可能影响推理相关行为。

项目的 `ModelSpec` 接口、`buildProvider` 函数、前端 UI 均不支持这两个字段。

## [S2] 数据模型变更

### lib/provider-ops.ts — ModelSpec 接口扩展

```typescript
export interface ModelSpec {
  name?: string;
  variants?: Record<string, unknown>;
  limit?: { context?: number; output?: number };
  modalities?: { input: string[]; output: string[] };  // 新增
  reasoning?: boolean;                                   // 新增
  options?: Record<string, unknown>;                     // 声明:深拷贝透传,UI 不编辑
}
```

`buildProvider` 已通过 `input.models` 直接赋值，无需改动逻辑——只要 `ModelSpec` 声明了字段，TypeScript 类型即通。

### data/variants/official.json — 新增可选字段

格式与 mimocode 配置一致，预填时直接拷贝：

```jsonc
"grok-4.6": {
  "name": "grok-4.6",
  "variants": [...],
  "reasoning": true,
  "modalities": { "input": ["text", "image"], "output": ["text"] },
  ...
}
```

文件内 `//` 说明键更新，文档化新增字段。

## [S3] 后端变更

### server.ts — POST/PUT body 类型扩展

第 156、180 行 body 中 `models` 的类型，追加 `modalities` 和 `reasoning`：

```typescript
Record<string, {
  name?: string;
  variants?: Record<string, unknown>;
  limit?: { context?: number; output?: number };
  modalities?: { input: string[]; output: string[] };
  reasoning?: boolean;
}>
```

### lib/variants-store.ts

无需改动——已是泛型 `Record<string, unknown>`，存什么字段都行。

## [S4] 前端：模型编辑表单（供应商对话框中的模型行）

### 布局（方案 A：加到 col1 的 limit 下方）

```
col1:                              col2:                del:
┌───────────────────────┐  ┌────────────────────┐   ┌─┐
│ deepseek-v4-flash     │  │ variants chips...  │   │×│
│ DeepSeek V4 Flash     │  │                    │   └─┘
│ 上下文 [1000000] 输出  │  │                    │
│ 模态 ☑text ☐img ☐aud  │  │                    │
│      ☐vid ☐pdf        │  │                    │
│ 推理 [未设置 ▾]        │  │                    │
└───────────────────────┘  └────────────────────┘
```

grid 模板不变，控件在 col1 内垂直堆叠。

### 控件

- **modalities**：5 个 checkbox。text 始终 `checked + disabled`，其余 4 个（image/audio/video/pdf）可勾选。
- **reasoning**：`<select>` 三态——未设置（默认）/ 支持(true) / 不支持(false)。

### 同步逻辑

新增 `syncModalitiesFromRow(id, row)` 和 `syncReasoningFromRow(id, row)`，由 checkbox/select 的 change 事件触发，写入 `models[id]`。

### 写入规则

- **modalities**：如果 image/audio/video/pdf 中任一勾选 → 写 `modalities: {input: ["text", ...checked], output: existingOutput ?? ["text"]}`；如果都没勾 → `delete models[id].modalities`（不写字段，让 mimocode fallback）。
- **reasoning**：选"未设置" → `delete models[id].reasoning`；选"支持" → `true`；选"不支持" → `false`。
- **output 保留策略**：如果已有 `modalities.output`，保留原值；否则用 `["text"]`。避免覆盖手动配置的非 text 输出。

### 预填逻辑

- 添加新模型时：
  - reasoning：从 `variantData.builtin?.[id]?.reasoning ?? variantData.official?.[id]?.reasoning` 预填
  - modalities：从 `variantData.official?.[id]?.modalities` 预填（mimo.json 无此数据）
- 编辑已有模型时：从 `models[id].modalities` / `models[id].reasoning` 读取（深拷贝已保留）

## [S5] 前端：变体库对话框

### index.html — vb-form 新增字段

在"输出"和"来源"之间插入 modalities checkbox 组和 reasoning select。

### app.js 变更

- `openVbForm(id)`：读取已有 `e.modalities` / `e.reasoning`，设置 checkbox 和 select。
- `vb-form submit`：收集 modalities checkbox 和 reasoning select 值，写入 entry。
  - modalities：同模型表单规则——任一非 text 勾选才写，否则不写字段。
  - reasoning：空字符串不写，"true"→true，"false"→false。
  - 编辑时保留已有 `variantParams`（现有逻辑不变）。
- `renderVbList()`：在 sub 行显示模态和推理状态。

## [S6] 测试

在现有测试文件中追加用例，不新增测试文件。

### test/provider-ops.test.ts

- `buildProvider` 传入带 modalities 的 models → 输出包含 modalities
- `buildProvider` 传入带 reasoning 的 models → 输出包含 reasoning
- `buildProvider` 传入不带这两个字段的 models → 输出不包含（向后兼容）

### test/variants-store.test.ts

- `mergeOfficialEntries` 合并带 modalities/reasoning 的条目 → 正确保留
- 删除条目（null 值）→ 正确移除

## [S7] 不在范围内

- `options` 字段（模型级）：声明到 ModelSpec 接口供深拷贝透传，但 UI 不编辑。
- 提取脚本 `catalog-extract.ts` 不改动——不从二进制提取 modalities 数据。
- `npm` 适配器选择、`only_configured_models`、`tool_call` 等其他字段不在本次范围。
