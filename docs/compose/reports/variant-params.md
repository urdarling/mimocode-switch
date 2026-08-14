---
feature: variant-params
status: delivered
specs:
  - docs/compose/specs/2026-08-13-variant-params.md
plans:
  - docs/compose/plans/2026-08-13-variant-params.md
branch: main
commits: a2ea297..a514482
---

# 变体参数携带(variants 空对象修复)— Final Report

## What Was Built

修复了"UI 生成的 variants 全是空对象 `{}`、mimo 请求体收不到思考强度参数"的问题。现在 effort 型变体自动携带 `{ reasoningEffort: "<变体名>" }`,AI SDK 将其转为线上 `reasoning_effort` 参数发送——**变体切换真正影响模型思考强度**。

- 内置快照 `mimo.json` 条目新增 `variantParams` 字段(effort 型变体 → `{reasoningEffort: 同名}`),由提取脚本自动生成
- 官方库 `official.json` 条目支持可选 `variantParams`(手动维护),`//` 说明键已更新
- 前端预填与 chips 点击均写入参数对象,不再写空对象
- server 校验非法 variantParams(值非对象)→ 400

## Architecture

- **数据层**:`lib/catalog-extract.ts` 解析 `reasoning_options` 的 effort 型条目时,同步构建 `variantParams`(每个变体名 `v` → `{ reasoningEffort: v }`),与 `variants` 名字数组并行输出;`CatalogSnapshot` 接口新增 `variantParams?`。toggle 型(如 mimo-v2.5-pro 原始声明)不产生该字段,无内容时省略键。
- **内置快照**:重新运行 `scripts/extract-mimo-catalog.ts` 生成,1312 个模型(二进制升级后 1248 → 1312),effort 型模型均带 variantParams。
- **服务端**:`server.ts` 的 `PUT /api/variants/official` 校验新增 variantParams 规则——若存在须为对象;每个变体名的值须为对象,否则 400 带条目 id 与字段名。写入仍走 `lib/variants-store.ts`(透传任意字段,无改动)。
- **前端**:`public/app.js` `prefillVariants` 优先取官方/内置的 `variantParams` 生成参数对象(无则回退 `{}`);`renderVariantsInto` chips 点击同样查参数映射写入。保存链路(`buildProvider` 透传 models)无需改动。

### Design Decisions

- **映射规则固定**:effort 型变体名 `v` → `{ reasoningEffort: v }`,与 mimo 内置 F4 对 `@ai-sdk/openai-compatible` / `@ai-sdk/xai` 的默认映射一致;camelCase 由 AI SDK 自动转 snake_case(`reasoning_effort`),日志已实证。
- **兼容优先**:`variants` 字符串数组字段完全保留(UI chips 与既有测试依赖),`variantParams` 为并行可选字段,无则省略——旧快照/旧条目不受影响。
- **校验内联 server**:与现有 variants/limit 校验同一风格,不引入新 lib 抽象。

## Usage

1. 添加/编辑供应商 → 获取模型或添加模型:effort 型模型的变体自动带 `reasoningEffort` 参数
2. 变体库录入/编辑:可填 `variantParams`(如 `{"high":{"reasoningEffort":"high"}}`),effort 型变体建议必填以生效思考强度
3. 保存后 mimocode.json 的 variants 形如 `{"high":{"reasoningEffort":"high"}}`——mimo 选中该变体即发送 `reasoning_effort:"high"`

## Verification

- `bun test` 47 pass / 0 fail(新增 catalog-extract 3 用例、variants-store 2 用例)
- 冒烟(临时 MIMOCODE_HOME):GET /api/variants 返回 builtin grok-4.5 与 official grok-4.6 均带 variantParams;非法 variantParams(值非对象)→ 400;合法 PUT → 200 且回读含 variantParams
- `bun build public/app.js` / `bun build server.ts` 语法检查通过
- 快照自检:`deepseek-v4-flash` 含 high/max,limit 正常

## Journey Log

- [lesson] 上轮 limit 修复只验证到"配置写入正确",未验证"mimo 实际发出的请求体"——本轮通过日志 `requestBodyValues` 实证 gpt-5.6-luna(带 reasoningEffort)请求体含 `reasoning_effort`,确认链路后修复才成立。验证必须打到系统边界。
- [lesson] mimo 对 grok 系列内置默认 variants 为空(`F4` 中 `if(Z.includes("grok")) return {}`),grok-4.6 曾配置 xhigh 非 xAI 官方 effort 值(官方 low/medium/high)——现 xhigh 保留名字但无参数,用户可自行编辑。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-13-variant-params.md` | Design spec | [S1]-[S7] 全部落地 |
| `docs/compose/plans/2026-08-13-variant-params.md` | Implementation plan | 6 任务全部完成 |

## Follow-ups

- 用户侧:为 grok-4.6 在 UI 重新保存一次(或已在官方库带 variantParams,重新添加即生效),然后对话验证中转站后台/日志出现 `reasoning_effort`
- 后续:其他模型(deepseek/glm/qwen)的思考开关参数名各异(enable_thinking / thinking / chat_template_args),当前修复覆盖 effort 型 reasoningEffort;toggle 型开关映射可作后续增强
