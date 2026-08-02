---
feature: default-model
status: delivered
specs: []
plans:
  - ../plans/2026-08-02-default-model.md
branch: main
commits: (none)
---

# 默认模型设置 — Final Report

## What Was Built

为默认供应商增加了"选择具体默认模型"的能力。此前"设为默认"始终激活供应商的**第一个**模型,无法选择;现在卡片和表单两个入口都可以指定 model 指针(`model: "<id>/<modelId>"`)所指向的具体模型。

## Architecture

纯前端改动,`lib/`、`server.ts`、API 与配置结构均未变:

- `public/app.js`
  - `render()`:默认供应商卡片徽章从"默认"改为"默认 · <modelId>"(从 `state.activeModel` 解析);非默认且有模型的卡片,"设为默认"按钮升级为 `<select class="activate-select">` 模型下拉,选中即调用现有 `POST /api/providers/:id/activate`
  - 新增 `listEl` 的 `change` 监听处理下拉;新增 `syncDefaultModelUI()` 控制表单下拉的显隐/禁用与默认选中
  - `renderModels()` 同步重建 `#f-default-model` 选项并保留已选值;`openForm()` 对当前默认供应商预选激活模型;提交时 `modelId` 优先级 = 下拉值 → 第一个模型 → `${id}-default`(无模型的合成兜底,行为不变)
- `public/index.html`:"设为默认供应商"勾选框下新增"默认模型"下拉(`#default-model-row` + `#f-default-model`)
- `public/style.css`:新增 `select` 与 `dialog select` 样式,与按钮/输入框风格一致

关键设计:默认模型 = `model` 指针的 modelId 部分,不新增任何存储字段,与 additive 语义保持一致。

## Usage

- 卡片:对非默认且含模型的供应商,展开"设为默认…"下拉选择模型,即切换默认并刷新
- 表单:勾选"设为默认供应商"后出现"默认模型"下拉(有模型时),保存即用所选模型激活;编辑当前默认供应商时下拉预选当前激活模型

## Verification

- `bun test`:30 pass / 0 fail(lib 未动,现有测试不受影响)
- `bun build public/app.js`:语法通过
- 冒烟:服务器启动后 `/`、`/app.js`、`/style.css` 均 200

## Journey Log

- [lesson] `model` 指针本就携带模型信息,缺口只在 UI 层——设默认模型不需要新增配置字段,直接复用 `activateProvider(id, modelId)` 即可
- [pivot] 曾考虑在 `mimocode-ui.json` 记录每供应商"偏好默认模型"(方案 2),经评审后放弃:超出诉求且引入新存储;需要时再追加

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-08-02-default-model.md` | Implementation plan | 完整,已按计划执行 |
