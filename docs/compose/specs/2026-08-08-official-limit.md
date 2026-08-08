# 官方库扩展 limit 字段:为无内置模型提供上下文/输出预填 — Design Spec

## [S1] Problem

模型的上下文窗口(context)与单次输出上限(output)对 mimocode 的上下文管理至关重要。内置快照 `data/variants/mimo.json` 已含 `limit`(1224/1238 模型有),但**没有内置的模型**(第三方供应商自定义/中转站模型)获取模型列表后这两个参数为空,用户须手查官方文档填写,且无法复用已有录入。

需求:与变体库同构,官方库 `official.json` 条目增加 `limit` 字段,UI 获取模型列表后按「已存配置 ?? 官方 ?? 内置」优先级预填。

## [S2] 数据模型

`data/variants/official.json` 条目新增可选字段 `limit`,与内置快照 `mimo.json` 的 limit 结构一致:

```json
{
  "my-model": {
    "name": "My Model",
    "variants": ["low", "high"],
    "limit": { "context": 200000, "output": 64000 },
    "source": "文档链接或说明",
    "updated": "YYYY-MM-DD"
  }
}
```

- `limit` 为可选字段,缺省时该模型回退到内置快照(与现状一致)
- `context`/`output` 均为正整数(数字)
- 文件头 `//` 说明键同步更新,写明新增字段的维护方法

## [S3] server 校验

`PUT /api/variants/official` 现有逐条校验(variants 须字符串数组)基础上,增加 limit 校验(内联,与现有风格一致):

- `limit` 若存在,必须是对象且非数组
- `limit.context` / `limit.output` 若存在,必须是有限正整数(数字)
- 任一不满足 → 400 错误,带条目 id 与字段名

## [S4] 前端预填优先级

`public/app.js` `renderModels()` 的 limit 预填从「已存配置 ?? 内置」改为「已存配置 ?? 官方 ?? 内置」:

```js
const bl = variantData.builtin?.[id]?.limit;
const ol = variantData.official?.[id]?.limit;
const ctx = m?.limit?.context ?? ol?.context ?? bl?.context ?? "";
const out = m?.limit?.output ?? ol?.output ?? bl?.output ?? "";
```

与变体预填 `prefillVariants` 的「官方优先」语义一致:用户手维护的官方库比内置快照更可信(内置为快照兜底)。输入框可改可清(两空则删键,与现状一致)。

## [S5] 变体库管理对话框

`public/index.html` 的 `#vb-form` 新增两个数字输入框:

```html
<label>上下文 <input id="vb-limit-context" inputmode="numeric" placeholder="可选,如 200000"></label>
<label>输出 <input id="vb-limit-output" inputmode="numeric" placeholder="可选,如 64000"></label>
```

- `public/app.js`:
  - `openVbForm(id)`:回填已存 `limit.context` / `limit.output`(空则留空)
  - 表单 submit:两框皆非空数字才写入 `entry.limit`,否则不写该键
  - `renderVbList()`:列表条目副行追加 limit 信息(如 `ctx 200000 · out 64000`,无 limit 则省略)
- 两框均非必填,保持「空 = 不写」语义

## [S6] 验证

- `bun test` 全绿(现有 31 个;本次不新增 lib 层逻辑,variants-store 读写测试不变)
- `bun build public/app.js --outfile test/.tmp/app_check.js` 语法检查通过
- 冒烟(临时 MIMOCODE_HOME,不污染真实配置):启动 server → GET /api/variants 返回结构含 limit → 变体库对话框录入带 limit 条目 PUT 成功 → 编辑表单回显 limit → 删除条目成功;`data/variants/official.json` 真实数据经 round-trip(PUT 相同内容)验证不污染
- 前端预填验证:构造含 limit 的 official 条目,打开供应商编辑对话框,无内置模型的 limit 输入框显示官方值
