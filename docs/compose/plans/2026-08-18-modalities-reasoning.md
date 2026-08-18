# modalities + reasoning 字段支持 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/modalities-reasoning.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在供应商管理 UI 中支持模型的 modalities 和 reasoning 字段，使不在内置目录的自定义模型能正确启用多模态输入和推理能力声明。

**Architecture:** 后端 ModelSpec 接口扩展两个字段 + server.ts body 类型同步；前端两处 UI（模型编辑表单 + 变体库对话框）各加 modalities checkbox 组和 reasoning 三态 select。写入规则遵循"不臆造元数据"——未配置时不写字段，让 mimocode fallback。

**Tech Stack:** TypeScript (Bun 直接跑，无构建)、bun:test、原生 HTML/CSS/JS（无框架）

**Spec:** `docs/compose/specs/2026-08-18-modalities-reasoning-design.md`

## Global Constraints

- 纯 Bun 直接跑 TS，无 tsconfig、无 lint、无 node_modules
- 测试用 bun:test，测试文件在 `test/*.test.ts`，临时文件用 `test/helpers.ts` 的 `makeTestDir`
- 前端是原生 HTML/CSS/JS，无框架无构建，改动通过 `bun server.ts` 手动验证
- `buildProvider` 已通过 `input.models` 直接赋值，改 ModelSpec 接口即可，不需要改 buildProvider 逻辑
- modalities output 固定 `["text"]`，但保留已有 output 值避免数据丢失
- reasoning 三态：未设置（不写字段）/ true / false

---

### Task 1: Backend — ModelSpec 接口 + server.ts body 类型 + 测试

**Covers:** [S2], [S3], [S6]

**Files:**
- Modify: `lib/provider-ops.ts:20-24` (ModelSpec 接口)
- Modify: `server.ts:156, 180` (POST/PUT body 类型)
- Test: `test/provider-ops.test.ts` (追加用例)
- Test: `test/variants-store.test.ts` (追加用例)

**Interfaces:**
- Produces: `ModelSpec.modalities?: { input: string[]; output: string[] }`, `ModelSpec.reasoning?: boolean`, `ModelSpec.options?: Record<string, unknown>`

- [ ] **Step 1: 在 provider-ops.test.ts 追加失败测试**

在 `describe("buildProvider", ...)` 块末尾（第 31 行后）追加：

```typescript
  test("models 透传 modalities", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", modalities: { input: ["text", "image"], output: ["text"] } } } });
    expect(p.models!.m.modalities).toEqual({ input: ["text", "image"], output: ["text"] });
  });
  test("models 透传 reasoning", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", reasoning: true } } });
    expect(p.models!.m.reasoning).toBe(true);
  });
  test("models 透传 options", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", options: { store: false } } } });
    expect(p.models!.m.options).toEqual({ store: false });
  });
  test("models 无 modalities/reasoning 时不产生字段(向后兼容)", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M" } } });
    expect(p.models!.m.modalities).toBeUndefined();
    expect(p.models!.m.reasoning).toBeUndefined();
    expect(p.models!.m.options).toBeUndefined();
  });
```

- [ ] **Step 2: 在 variants-store.test.ts 追加失败测试**

在文件末尾追加：

```typescript
describe("mergeOfficialEntries — modalities/reasoning 透传", () => {
  test("合并带 modalities/reasoning 的条目", () => {
    const f = tempFile();
    writeFileSync(f, JSON.stringify({ "//": "说明", "a": { "variants": ["low"] } }, null, 2), "utf8");
    const existing = readOfficialVariants(f);
    const merged = mergeOfficialEntries(existing, { "b": { "variants": ["high"], "modalities": { "input": ["text", "image"], "output": ["text"] }, "reasoning": true } });
    expect(merged.b).toEqual({ "variants": ["high"], "modalities": { "input": ["text", "image"], "output": ["text"] }, "reasoning": true });
  });
  test("删除带 modalities/reasoning 的条目(null 值)", () => {
    const existing = { "//": "说明", "a": { "variants": ["low"], "modalities": { "input": ["text"], "output": ["text"] }, "reasoning": false } };
    const merged = mergeOfficialEntries(existing as any, { "a": null });
    expect(merged.a).toBeUndefined();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test`
Expected: 新增的 4 个 provider-ops 测试通过（buildProvider 已透传 models，TypeScript 类型不报错因为用 `any`），但 variants-store 的 2 个测试通过（mergeOfficialEntries 已是泛型）。

> 注意：由于 `buildProvider` 已直接赋值 `input.models`，且测试中不涉及 TypeScript 类型检查（Bun 直接跑），测试可能直接通过。这是预期行为——测试验证的是"现有逻辑确实透传了新字段"，为前端改动提供安全网。

- [ ] **Step 4: 扩展 ModelSpec 接口**

在 `lib/provider-ops.ts` 第 20-24 行，将 ModelSpec 接口改为：

```typescript
export interface ModelSpec {
  name?: string;
  variants?: Record<string, unknown>;
  limit?: { context?: number; output?: number };
  modalities?: { input: string[]; output: string[] };
  reasoning?: boolean;
  options?: Record<string, unknown>;
}
```

- [ ] **Step 5: 扩展 server.ts body 类型**

在 `server.ts` 第 156 行 POST handler 和第 180 行 PUT handler 中，将 body 类型中 models 的内联类型从：

```typescript
models?: Record<string, { name?: string; variants?: Record<string, unknown>; limit?: { context?: number; output?: number } }>
```

改为：

```typescript
models?: Record<string, { name?: string; variants?: Record<string, unknown>; limit?: { context?: number; output?: number }; modalities?: { input: string[]; output: string[] }; reasoning?: boolean }>
```

两处（第 156 行、第 180 行）都要改。

- [ ] **Step 6: 运行全部测试确认通过**

Run: `bun test`
Expected: 全部 PASS（原有测试 + 新增 6 个测试）

- [ ] **Step 7: Commit**

```bash
git add lib/provider-ops.ts server.ts test/provider-ops.test.ts test/variants-store.test.ts
git commit -m "feat: ModelSpec 接口扩展 modalities/reasoning/options 字段"
```

---

### Task 2: Frontend — 模型编辑表单（modalities + reasoning 控件）

**Covers:** [S4]

**Files:**
- Modify: `public/app.js` (renderModels, sync 函数, prefill, submit handler)
- Modify: `public/style.css` (新增控件样式)

**Interfaces:**
- Consumes: `ModelSpec.modalities`, `ModelSpec.reasoning`（Task 1 产出）
- Consumes: `variantData.builtin?.[id]?.reasoning`（mimo.json 已有数据）

- [ ] **Step 1: 在 style.css 模型配置区追加样式**

在 `.limit-input:focus { border-color: var(--accent); }`（第 194 行）之后追加：

```css
.m-modalities { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; font-size: 11px; color: var(--muted); }
.m-modalities span { display: inline-flex; align-items: center; gap: 1px; }
.m-modalities input[type="checkbox"] { margin: 0; width: 11px; height: 11px; }
.m-reasoning { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 11px; color: var(--muted); }
.reasoning-select {
  font: inherit; font-size: 11px; background: var(--bg); color: var(--text);
  border: 1px solid var(--border-strong); border-radius: 4px; padding: 2px 4px;
}
.reasoning-select:focus { border-color: var(--accent); }
```

- [ ] **Step 2: 在 app.js 添加 sync 函数**

在 `syncLimitFromRow` 函数（第 268-279 行）之后追加：

```javascript
function syncModalitiesFromRow(id, row) {
  const checked = [...row.querySelectorAll('[data-mod]')].filter((cb) => cb.checked).map((cb) => cb.dataset.mod);
  const nonText = checked.filter((m) => m !== "text");
  if (nonText.length > 0) {
    const existingOutput = models[id]?.modalities?.output;
    models[id].modalities = { input: ["text", ...nonText], output: existingOutput ?? ["text"] };
  } else {
    delete models[id].modalities;
  }
}

function syncReasoningFromRow(id, row) {
  const val = row.querySelector("[data-rs]")?.value;
  if (val === "true") models[id].reasoning = true;
  else if (val === "false") models[id].reasoning = false;
  else delete models[id].reasoning;
}
```

- [ ] **Step 3: 添加 prefill 辅助函数**

在 `prefillVariants` 函数（第 152-158 行）之后追加：

```javascript
function prefillMeta(id) {
  const meta = {};
  const reasoning = variantData.builtin?.[id]?.reasoning ?? variantData.official?.[id]?.reasoning;
  if (reasoning !== undefined) meta.reasoning = reasoning;
  const modalities = variantData.official?.[id]?.modalities;
  if (modalities) meta.modalities = modalities;
  return meta;
}
```

- [ ] **Step 4: 修改 renderModels 在 col1 中渲染新控件**

在 `renderModels` 函数中（第 292-298 行），将 col1.innerHTML 从：

```javascript
    col1.innerHTML = `
      <div class="m-id" title="${escapeHtml(id)}">${escapeHtml(id)}</div>
      <div class="m-name" title="${escapeHtml(m?.name ?? "")}">${escapeHtml(m?.name ?? "")}</div>
      <div class="m-limit">
        <span>上下文</span><input class="limit-input" data-lk="context" inputmode="numeric" value="${ctx}" placeholder="?">
        <span>输出</span><input class="limit-input" data-lk="output" inputmode="numeric" value="${out}" placeholder="?">
      </div>`;
```

改为：

```javascript
    const modIn = m?.modalities?.input ?? [];
    const rsVal = m?.reasoning === true ? "true" : m?.reasoning === false ? "false" : "";
    col1.innerHTML = `
      <div class="m-id" title="${escapeHtml(id)}">${escapeHtml(id)}</div>
      <div class="m-name" title="${escapeHtml(m?.name ?? "")}">${escapeHtml(m?.name ?? "")}</div>
      <div class="m-limit">
        <span>上下文</span><input class="limit-input" data-lk="context" inputmode="numeric" value="${ctx}" placeholder="?">
        <span>输出</span><input class="limit-input" data-lk="output" inputmode="numeric" value="${out}" placeholder="?">
      </div>
      <div class="m-modalities">
        <span>模态</span>
        <span><input type="checkbox" data-mod="text" checked disabled> text</span>
        <span><input type="checkbox" data-mod="image" ${modIn.includes("image") ? "checked" : ""}> image</span>
        <span><input type="checkbox" data-mod="audio" ${modIn.includes("audio") ? "checked" : ""}> audio</span>
        <span><input type="checkbox" data-mod="video" ${modIn.includes("video") ? "checked" : ""}> video</span>
        <span><input type="checkbox" data-mod="pdf" ${modIn.includes("pdf") ? "checked" : ""}> pdf</span>
      </div>
      <div class="m-reasoning">
        <span>推理</span>
        <select class="reasoning-select" data-rs>
          <option value="" ${rsVal === "" ? "selected" : ""}>未设置</option>
          <option value="true" ${rsVal === "true" ? "selected" : ""}>支持</option>
          <option value="false" ${rsVal === "false" ? "selected" : ""}>不支持</option>
        </select>
      </div>`;
```

- [ ] **Step 5: 为新控件绑定 change 事件**

在 `renderModels` 函数中，在 `col1.querySelector('[data-lk="output"]').addEventListener("change", syncLimit);`（第 301 行）之后追加：

```javascript
    const syncMod = () => syncModalitiesFromRow(id, row);
    const syncRs = () => syncReasoningFromRow(id, row);
    col1.querySelectorAll('[data-mod]').forEach((cb) => cb.addEventListener("change", syncMod));
    col1.querySelector('[data-rs]')?.addEventListener("change", syncRs);
```

- [ ] **Step 6: 修改 submit handler 的提交前同步**

在 `$("#provider-form").addEventListener("submit", ...)` 中（第 520-523 行），将：

```javascript
  modelsEl.querySelectorAll(".model-row").forEach((row) => {
    const mid = row.dataset.model;
    if (mid && models[mid]) syncLimitFromRow(mid, row);
  });
```

改为：

```javascript
  modelsEl.querySelectorAll(".model-row").forEach((row) => {
    const mid = row.dataset.model;
    if (mid && models[mid]) {
      syncLimitFromRow(mid, row);
      syncModalitiesFromRow(mid, row);
      syncReasoningFromRow(mid, row);
    }
  });
```

- [ ] **Step 7: 修改新增模型时预填 meta**

在 app.js 中找到添加模型的代码（约第 497 行和第 509 行），将：

```javascript
    if (id && !models[id]) { models[id] = { name: id, ...(prefillVariants(id) ? { variants: prefillVariants(id) } : {}) }; renderModels(); }
```

改为：

```javascript
    if (id && !models[id]) { models[id] = { name: id, ...prefillMeta(id), ...(prefillVariants(id) ? { variants: prefillVariants(id) } : {}) }; renderModels(); }
```

将：

```javascript
    data.models.forEach((m) => { models[m] = models[m] ?? { name: m, ...(prefillVariants(m) ? { variants: prefillVariants(m) } : {}) }; });
```

改为：

```javascript
    data.models.forEach((m) => { models[m] = models[m] ?? { name: m, ...prefillMeta(m), ...(prefillVariants(m) ? { variants: prefillVariants(m) } : {}) }; });
```

- [ ] **Step 8: 手动验证**

Run: `bun server.ts`
验证步骤：
1. 打开浏览器访问 `http://localhost:4173`
2. 编辑已有的 `token-temp` 供应商，找到 `deepseek-v4-flash-0731`（配置文件中已有 modalities: input ["text"]）
3. 确认模态区 text 勾选+灰色不可改，其余未勾选
4. 确认推理 select 显示"未设置"
5. 勾选 image，点保存
6. 检查 `~/.config/mimocode/mimocode.json` 中 `deepseek-v4-flash-0731` 的 modalities 变为 `{input: ["text","image"], output: ["text"]}`
7. 新增一个模型（如 glm-5.2），确认推理自动预填为"支持"（从 mimo.json 的 reasoning: true）
8. 取消勾选 image，保存，确认 modalities 字段被删除（回到 fallback）

- [ ] **Step 9: Commit**

```bash
git add public/app.js public/style.css
git commit -m "feat: 模型编辑表单支持 modalities/reasoning 控件"
```

---

### Task 3: Frontend — 变体库对话框 + official.json 注释更新

**Covers:** [S5]

**Files:**
- Modify: `public/index.html:67-70` (vb-form 新增字段)
- Modify: `public/app.js` (openVbForm, vb-form submit, renderVbList)
- Modify: `data/variants/official.json:2` (`//` 注释更新)
- Modify: `public/style.css` (vb-form 新控件样式)

**Interfaces:**
- Consumes: Task 2 的 sync 逻辑模式（写入规则相同）

- [ ] **Step 1: 在 index.html vb-form 中添加 modalities 和 reasoning 字段**

在 `public/index.html` 第 69 行（`<label>输出 ...</label>`）之后、第 70 行（`<label>来源 ...</label>`）之前插入：

```html
          <label class="vb-modalities">模态
            <span><input type="checkbox" data-vbmod="text" checked disabled> text</span>
            <span><input type="checkbox" data-vbmod="image"> image</span>
            <span><input type="checkbox" data-vbmod="audio"> audio</span>
            <span><input type="checkbox" data-vbmod="video"> video</span>
            <span><input type="checkbox" data-vbmod="pdf"> pdf</span>
          </label>
          <label>推理
            <select id="vb-reasoning">
              <option value="">未设置</option>
              <option value="true">支持</option>
              <option value="false">不支持</option>
            </select>
          </label>
```

- [ ] **Step 2: 在 style.css 追加 vb-form 控件样式**

在文件末尾追加：

```css
.vb-modalities { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.vb-modalities span { display: inline-flex; align-items: center; gap: 2px; font-size: 12px; }
.vb-modalities input[type="checkbox"] { margin: 0; width: 12px; height: 12px; }
#vb-reasoning { font: inherit; font-size: 12px; }
```

- [ ] **Step 3: 修改 openVbForm 读取已有值**

在 `app.js` 的 `openVbForm` 函数（第 402-413 行）中，在 `$("#vb-limit-output").value = e.limit?.output ?? "";` 之后追加：

```javascript
  const modIn = e.modalities?.input ?? [];
  document.querySelectorAll('#vb-form [data-vbmod]').forEach((cb) => {
    if (cb.dataset.vbmod !== "text") cb.checked = modIn.includes(cb.dataset.vbmod);
  });
  const rsVal = e.reasoning === true ? "true" : e.reasoning === false ? "false" : "";
  $("#vb-reasoning").value = rsVal;
```

- [ ] **Step 4: 修改 vb-form submit 收集新字段**

在 `app.js` 的 `vb-form submit` handler（第 442-474 行）中，在 `if (hasC || hasO) { ... }` 之后、`const next = { [id]: entry };` 之前追加：

```javascript
  // modalities
  const modChecked = [...document.querySelectorAll('#vb-form [data-vbmod]')].filter((cb) => cb.checked).map((cb) => cb.dataset.vbmod);
  const modNonText = modChecked.filter((m) => m !== "text");
  if (modNonText.length > 0) {
    const existingOutput = vbEntries[id]?.modalities?.output;
    entry.modalities = { input: ["text", ...modNonText], output: existingOutput ?? ["text"] };
  }
  // reasoning
  const rsVal = $("#vb-reasoning").value;
  if (rsVal === "true") entry.reasoning = true;
  else if (rsVal === "false") entry.reasoning = false;
```

- [ ] **Step 5: 修改 renderVbList 显示新字段**

在 `app.js` 的 `renderVbList` 函数中（第 372-374 行），将：

```javascript
    const lim = e.limit;
    const sub = document.createElement("div");
    sub.className = "vb-sub";
    sub.textContent = [e.name, lim ? `ctx ${lim.context ?? "?"} · out ${lim.output ?? "?"}` : "", e.source, e.updated].filter(Boolean).join(" · ");
```

改为：

```javascript
    const lim = e.limit;
    const modStr = e.modalities?.input?.length > 1 ? `模态 ${e.modalities.input.join("+")}` : "";
    const rsStr = e.reasoning === true ? "推理:支持" : e.reasoning === false ? "推理:不支持" : "";
    const sub = document.createElement("div");
    sub.className = "vb-sub";
    sub.textContent = [e.name, lim ? `ctx ${lim.context ?? "?"} · out ${lim.output ?? "?"}` : "", modStr, rsStr, e.source, e.updated].filter(Boolean).join(" · ");
```

- [ ] **Step 6: 更新 official.json 的 // 注释**

将 `data/variants/official.json` 第 2 行的 `//` 值从：

```
"//": "官方文档模型库:手动维护。字段:name 显示名, variants 官方支持的变体列表, variantParams 可选(变体名→请求参数映射,如 {\"high\":{\"reasoningEffort\":\"high\"}},effort 型变体必填以生效思考强度), limit 可选(模型上下文/输出上限,如 {\"context\":200000,\"output\":64000}), source 文档链接, updated 更新日期。新增条目:查模型官方文档确认支持哪些思考强度与上下文/输出限制后追加。"
```

改为：

```
"//": "官方文档模型库:手动维护。字段:name 显示名, variants 官方支持的变体列表, variantParams 可选(变体名→请求参数映射,如 {\"high\":{\"reasoningEffort\":\"high\"}},effort 型变体必填以生效思考强度), limit 可选(模型上下文/输出上限,如 {\"context\":200000,\"output\":64000}), modalities 可选(输入输出模态,如 {\"input\":[\"text\",\"image\"],\"output\":[\"text\"]}), reasoning 可选(boolean,是否支持推理), source 文档链接, updated 更新日期。新增条目:查模型官方文档确认支持哪些思考强度与上下文/输出限制后追加。"
```

- [ ] **Step 7: 运行全部测试确认无回归**

Run: `bun test`
Expected: 全部 PASS

- [ ] **Step 8: 手动验证**

Run: `bun server.ts`
验证步骤：
1. 打开浏览器，点击"变体库"按钮
2. 点击"新增条目"，填写模型 ID（如 test-model），勾选 image，推理选"支持"
3. 保存，确认列表中显示"模态 text+image · 推理:支持"
4. 编辑该条目，确认 modalities checkbox 和 reasoning select 正确回显
5. 取消 image 勾选，保存，确认 modalities 字段不再出现
6. 检查 `data/variants/official.json` 文件，确认条目格式正确，`//` 注释已更新

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/app.js public/style.css data/variants/official.json
git commit -m "feat: 变体库对话框支持 modalities/reasoning 字段"
```
