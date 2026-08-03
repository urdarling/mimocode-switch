---
feature: model-variants
status: delivered
specs:
  - ../specs/2026-08-02-model-variants.md
plans:
  - ../plans/2026-08-02-model-variants.md
branch: main
commits: (none)
---

# 模型变体标注与选用 — Final Report

## What Was Built

添加第三方供应商时,工具按模型 ID 标注该模型已知的思考强度变体(来源:mimo 内嵌目录 + 官方文档库),并允许在表单里选用一组变体写入配置,复刻供应商推荐配置的 `variants` 写法。

## Architecture

双数据源 + 单端点 + 表单集成:

- `data/variants/mimo.json` — mimo 内嵌目录快照(1238 个带 reasoning 能力的模型),由 `scripts/extract-mimo-catalog.ts` 生成(`bun run scripts/extract-mimo-catalog.ts`,自动定位本机 mimo.exe,`MIMO_BIN` 可覆盖),mimo 升级后重跑更新
- `data/variants/official.json` — 官方文档变体库,手维护(`name`/`variants`/`source`/`updated`),头部 `//` 键为维护说明
- `server.ts` `GET /api/variants` — 合并两文件返回 `{ builtin, official }`,每次请求实时读(改官方库刷新即生效)
- `public/app.js` — 表单模型行两行结构:第一行 id+名称+删除,第二行变体标注(`内置: …` / `官方: …` / `变体未知`)+「选用变体」输入框;新模型预填(官方优先,否则内置);空输入不写 variants
- `lib/provider-ops.ts` + `server.ts` — models 类型透传 `variants`,写回 `provider.<id>.models.<mid>.variants = {"low":{},…}`

### Design Decisions

- 变体列表不来自供应商 `/models` API(它只返回 ID),而是目录元数据 + 配置声明——所以工具内置快照而非在线查询,数据与 mimo 运行时一致
- 预填规则"官方优先、内置兜底":官方库是用户主动维护的权威来源
- 提取脚本直接解析二进制内嵌目录(CLI 对自定义供应商不暴露 reasoning 信息,已实测排除)

## Usage

1. 添加供应商 → 「获取模型」(或手动加模型)→ 每行显示已知变体并预填选用框
2. 可改/清空选用框(逗号分隔);空 = 不声明变体
3. 保存后配置出现 `variants`;mimo 中 `/variants` 可切
4. 官方库:`data/variants/official.json` 追加条目(照 `//` 说明)

## Verification

- `bun test`:31 pass / 0 fail(新增 models 透传 variants 测试)
- 提取脚本自检:`deepseek-v4-flash` 含 `high`/`max`,与二进制直接抽样一致
- 端到端(临时 `MIMOCODE_HOME`,未触碰真实配置):POST 带 variants 的供应商 → 磁盘 `mimocode.jsonc` 出现 `"variants": {` → DELETE 清理
- 服务冒烟:`/api/variants` 返回 `builtin.deepseek-v4-flash.variants`(high,max,none,xhigh,low,medium,minimal)与 `official["gpt-5.6-luna"].variants`(low,medium,high,xhigh,max)

## Journey Log

- [lesson] mimo 内嵌目录的键均不带引号(`reasoning_options:`、`id:`)且数组含嵌套括号——正则取数组必须括号配平,否则截断
- [lesson] 生成的数据文件不能带 `//` 注释,服务端 `JSON.parse` 会炸;维护说明改用官方库的 `//` 键
- [lesson] `mimo models --verbose` 对自定义供应商不显示 reasoning 信息,二进制解析是唯一可靠来源

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-02-model-variants.md` | Design spec | S1-S7 锚点 |
| `docs/compose/plans/2026-08-02-model-variants.md` | Implementation plan | 完整,已按计划执行 |
