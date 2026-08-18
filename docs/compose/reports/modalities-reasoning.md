---
feature: modalities-reasoning
status: delivered
specs:
  - docs/compose/specs/2026-08-18-modalities-reasoning-design.md
plans:
  - docs/compose/plans/2026-08-18-modalities-reasoning.md
branch: main
commits: 07e5e4e..ec8b372
---

# modalities + reasoning 字段支持 — Final Report

## What Was Built

为供应商管理 UI 的模型配置新增 `modalities` 和 `reasoning` 两个字段支持。`modalities` 控制模型支持哪些输入模态（text/image/audio/video/pdf），`reasoning` 声明模型是否支持推理。

这两个字段解决的核心问题：不在 mimocode 内置目录中的自定义模型（如 qwen3.8-max、gpt-5.6-luna）缺少 `modalities` 声明时，mimocode 默认只支持文本输入，图像识别等功能不可用。内置目录中的模型（如 glm-5.2）有目录兜底，但自定义模型必须用户显式配置。

改动覆盖两个 UI 区域：供应商编辑表单中的模型行（添加/编辑模型时配置模态和推理）、变体库对话框（维护 official.json 参考数据时录入模态和推理）。

## Architecture

### 数据模型

`lib/provider-ops.ts` 的 `ModelSpec` 接口扩展了三个可选字段：

```typescript
export interface ModelSpec {
  name?: string;
  variants?: Record<string, unknown>;
  limit?: { context?: number; output?: number };
  modalities?: { input: string[]; output: string[] };  // 新增
  reasoning?: boolean;                                   // 新增
  options?: Record<string, unknown>;                     // 新增(声明:深拷贝透传,UI 不编辑)
}
```

`buildProvider` 已通过 `input.models` 直接赋值，不需要逻辑改动。`server.ts` 的 POST/PUT body 类型同步扩展，确保 API 能接收新字段。

### 前端模型编辑表单（`public/app.js` renderModels）

每个模型行的 col1 区域（id/name/limit 下方）新增两组控件：

- **模态**：5 个 checkbox，text 始终 checked+disabled，其余 4 个可勾选
- **推理**：`<select>` 三态——未设置 / 支持(true) / 不支持(false)

写入规则遵循"不臆造元数据"原则：
- modalities：任一非 text 勾选才写字段，否则删除（让 mimocode fallback）；output 保留已有值，默认 `["text"]`
- reasoning：选"未设置"则删除字段，避免覆盖 mimocode 的 fallback 行为

预填逻辑：添加新模型时，reasoning 从 `variantData.builtin?.[id]?.reasoning`（mimo.json 已有数据）预填，modalities 从 `variantData.official?.[id]?.modalities` 预填。

### 变体库对话框（`public/app.js` + `public/index.html`）

vb-form 新增同样的 modalities checkbox 组和 reasoning select。`openVbForm` 回显已有值，submit handler 收集并写入 entry，`renderVbList` 在条目摘要行显示模态和推理状态。`data/variants/official.json` 的 `//` 注释已更新，文档化新字段。

### Design Decisions

- **modalities output 固定 `["text"]`**：从 mimo 二进制 5313 个模型的数据看，99% 的模型 output 都是 `["text"]`，只有 gpt-5 等极少数有多模态输出。UI 只配 input，output 固定，但保留已有 output 值避免数据丢失。
- **reasoning 三态而非 checkbox**：从数据看 56% 模型 reasoning=true、43% false，不是所有模型都是 true。三态（未设置/true/false）比二态 checkbox 更精确，"未设置"让 mimocode 用自己的 fallback。
- **不更新提取脚本**：`catalog-extract.ts` 不从二进制提取 modalities 数据。mimo.json 已有 reasoning（提取脚本已提取），modalities 通过 official.json 手动维护即可。

## Usage

### 在供应商编辑表单中配置

1. 编辑或添加供应商，在模型配置区找到目标模型
2. 勾选模态 checkbox（如 image），选择推理状态
3. 保存——配置写入 `~/.config/mimocode/mimocode.json`

### 在变体库中维护参考数据

1. 点击"变体库"按钮打开对话框
2. 新增或编辑条目，勾选模态、选择推理
3. 保存——数据写入 `data/variants/official.json`
4. 之后添加匹配 ID 的模型时自动预填这些值

## Verification

- **单元测试**：6 个新测试用例（4 个 provider-ops + 2 个 variants-store），全部通过。覆盖 buildProvider 透传 modalities/reasoning/options、向后兼容、mergeOfficialEntries 透传和删除。
- **冒烟测试**：服务器启动正常（HTTP 200），app.js 和 index.html 正确包含新函数和控件（syncModalitiesFromRow、prefillMeta、data-vbmod、vb-reasoning 等关键标识均验证存在）。
- **回归测试**：全部 58 个测试通过，无回归。

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [lesson] qwen3.8-max 不在 mimocode 内置目录中——内置目录有 5313 个模型但不含它，所以没有 modalities 兜底，必须用户显式配置
- [lesson] mimo.json 提取脚本已提取 reasoning（boolean），但没提取 modalities——reasoning 可直接预填，modalities 需要 official.json 手动维护
- [decision] modalities output 固定 `["text"]`——从二进制数据看 99% 模型都是 text 输出，UI 只配 input 即可

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-18-modalities-reasoning-design.md` | 设计文档 | 7 个 section 覆盖数据模型、后端、两个前端区域、测试 |
| `docs/compose/plans/2026-08-18-modalities-reasoning.md` | 实现计划 | 3 个 task，含完整代码和验证步骤 |
