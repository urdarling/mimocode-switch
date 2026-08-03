# 模型变体标注与选用 — Design Spec

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/model-variants.md)

## [S1] Problem

用户添加第三方供应商时无法知道某个模型是否支持变体(思考强度)。供应商 `/models` API 只返回模型 ID,不返回变体元数据;变体信息存在于两个来源:mimo 内嵌目录(按模型 ID 声明 `reasoning_options`)与模型官方文档。工具需要在「获取模型」后按模型 ID 标注已知变体,并允许用户选用一组变体写入配置。

## [S2] 数据文件

项目内新增 `data/variants/` 目录,两份 JSON:

1. **`data/variants/mimo.json`** — mimo 内嵌目录快照,由提取脚本生成,勿手改。
   格式:`{ "<modelId>": { "reasoning": true, "variants": ["high", "max"] } }`
   `variants` 取自目录条目的 `reasoning_options`:`type: "effort"` 的 `values` 合并;`type: "toggle"` 仅置 `reasoning: true`。无 reasoning 信息不收录。
2. **`data/variants/official.json`** — 官方文档变体库,用户手动维护。
   格式:`{ "<modelId>": { "name": "…", "variants": ["low","medium","high","xhigh"], "source": "文档链接", "updated": "YYYY-MM-DD" } }`
   文件头部注释写明维护方法。

## [S3] 提取脚本

新增 `scripts/extract-mimo-catalog.ts`(`bun run scripts/extract-mimo-catalog.ts`):

- 定位 mimo 二进制:默认在 `node_modules/@mimo-ai/*/node_modules/@mimo-ai/mimocode-*/bin/mimo.exe` 下递归查找,`MIMO_BIN` 环境变量可覆盖,找不到报错退出
- 解析:二进制以 latin1 读入 → 定位内嵌目录对象(以已知锚点定位起始 `{`,括号配平找结束)→ 将 `!0`/`!1` 归一化为 `true`/`false` 后用 Bun eval 解析 → 遍历条目,按条目内 `id` 字段为键提取 `reasoning` 与 `reasoning_options` 中的 effort values
- 输出 `data/variants/mimo.json`(2 空格缩进)
- 抽样自检:断言 `deepseek-v4-flash` 存在且 variants 含 `high`/`max`(与已核实的二进制数据一致),失败则报错退出

## [S4] API

`server.ts` 新增 `GET /api/variants`:启动时读取 `data/variants/*.json`(mimo 快照 + 官方库),返回:

```json
{ "builtin": { "<modelId>": { "reasoning": true, "variants": ["high","max"] } },
  "official": { "<modelId>": { "name": "…", "variants": ["low","medium","high"], "source": "…", "updated": "…" } } }
```

官方库热更新:每次请求重新读文件(数据量小,免去重启)。

## [S5] UI:模型行标注与变体选用

`public/index.html` + `public/app.js` + `public/style.css`,供应商表单模型列表:

- 每行模型追加:`内置: high/max`(命中 builtin 且有 variants)/ `官方: low, medium, high, xhigh`(命中 official)/ 两者皆无 → `变体未知`
- 每行追加「选用变体」输入框(逗号分隔),预填规则:官方有 → 官方 variants;否则内置 variants;编辑已有供应商时回显已存 `variants` 键
- 空输入 = 不写 variants

## [S6] 配置写回

`lib/provider-ops.ts`:`buildProvider` 透传 `models.<id>.variants`(空对象形式 `{"low":{},…}` 直接保存)。新增单测:`test/provider-ops.test.ts` 断言带 variants 的 models 保存后原样保留。

## [S7] 验证

- `bun test` 全绿(新增 variants 透传测试)
- 提取脚本运行成功,输出与二进制抽样一致(deepseek-v4-flash → high/max)
- 冒烟:添加供应商 → 获取模型 → 标注显示 → 选变体 → 保存后配置文件出现 `variants`,mimo `/variants` 可切
