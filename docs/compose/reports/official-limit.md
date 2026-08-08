---
feature: official-limit
status: delivered
specs:
  - docs/compose/specs/2026-08-08-official-limit.md
plans:
  - docs/compose/plans/2026-08-08-official-limit.md
branch: main
commits: 793eb79..20464d0
---

# 官方库扩展 limit 字段 — Final Report

## What Was Built

官方变体库 `data/variants/official.json` 条目新增可选 `limit` 字段(`{context, output}`),与内置快照 `mimo.json` 的 limit 结构一致。UI 获取模型列表后,模型行的「上下文/输出」输入框按 **已存配置 ?? 官方库 ?? 内置快照** 优先级预填——解决了"没有内置的模型(第三方供应商/中转站自定义模型)获取模型列表后 limit 为空"的问题,录入过的官方 limit 可跨会话复用。

变体库管理对话框同步支持 limit 编辑:表单新增「上下文」「输出」两个数字输入框(均非必填,空 = 不写键),列表条目副行显示 `ctx … · out …`。

## Architecture

- **数据层**:`data/variants/official.json` 条目结构 `{name, variants, limit?, source, updated}`,`//` 说明键已更新写明 limit 字段维护方法。limit 结构与内置快照同构,前端两来源统一消费。
- **服务端**:`server.ts` 的 `PUT /api/variants/official` 逐条校验新增 limit 规则——limit 若存在须为对象;`context`/`output` 若存在须为有限正整数,否则 400 带条目 id 与字段名。写入仍走 `lib/variants-store.ts`(原子写 + 保留 `//` 键,无改动)。
- **前端**:`public/app.js` `renderModels` 预填优先级 `m?.limit ?? official[id].limit ?? builtin[id].limit`(官方优先于内置,与变体预填 `prefillVariants` 的"官方优先"语义一致,用户手维护数据比快照更可信);`openVbForm` 回填 limit;submit 时两框皆非空数字才写 `entry.limit`;`renderVbList` 副行显示 limit。`public/index.html` 表单加两个 `inputmode="numeric"` 输入框。零新依赖。

### Design Decisions

- **官方优先于内置**:与变体预填一致——用户手维护的官方库比内置快照更可信,内置作兜底。
- **空 = 不写**:两框皆空时不生成 `limit` 键,保持与变体「空 = 不写」语义一致,避免空对象写入配置。
- **校验内联 server**:与现有 variants 校验同一风格,不引入新 lib 抽象。

## Usage

1. 打开 UI → 头部「变体库」→「+ 新增条目」或编辑既有条目
2. 在「上下文」「输出」框录入模型官方文档中的数值(可选,如 200000 / 64000),保存
3. 添加/编辑供应商 → 获取模型 → 无内置记录的模型,其「上下文/输出」输入框自动预填官方 limit 值,可改可清

## Verification

- `bun test` 37 pass / 0 fail
- 冒烟(临时 MIMOCODE_HOME,round-trip 保护真实数据):limit 校验 7 用例全过(负数/字符串/数组/零 → 400;合法 limit、无 limit 条目 → 200;round-trip 后文件语义不变);official 带 limit 条目经 `GET /api/variants` 正确返回 4 用例全过
- 静态资源与 API 冒烟:/、/app.js、/style.css、/api/variants 全 200
- 前端语法检查 `bun build public/app.js` 通过

## Journey Log

- [lesson] PowerShell 5.1 `Set-Content -Encoding utf8` 写 UTF-8 BOM,JSON.parse 遇 BOM 抛错 → `readOfficialVariants` 静默返回空对象,冒烟误报失败——冒烟脚本改用 bun 脚本直写文件(与既有 Pattern 一致),避免 BOM/行尾差异。
- [lesson] round-trip 断言用 JSON 深比较而非字节比较,容忍行尾/格式化差异。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-08-official-limit.md` | Design spec | [S1]-[S6] 全部落地 |
| `docs/compose/plans/2026-08-08-official-limit.md` | Implementation plan | 4 任务全部完成 |
