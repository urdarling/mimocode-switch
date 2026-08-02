# 默认模型设置 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/default-model.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户能为默认供应商选择具体默认模型(而不总是第一个模型)。

**Architecture:** mimocode 的 `model: "<id>/<modelId>"` 指针同时决定默认供应商与默认模型,`lib/provider-ops.ts` 的 `activateProvider(config, id, modelId)` 已支持任意 modelId。本改动纯前端:`public/app.js` + `public/index.html` + `public/style.css`。卡片上把"设为默认"按钮升级为模型下拉(无模型时保持原按钮);表单里"设为默认供应商"勾选旁新增"默认模型"下拉。lib、API、配置结构一律不动。

**Tech Stack:** 原生 HTML/CSS/JS + Bun(无构建步骤)

## Global Constraints

- 不改 `lib/*.ts`、`server.ts`、`test/*.ts`——现有 30 个测试必须保持全绿
- additive 语义不变:`isDefault = model.startsWith(id + "/")`;默认模型 = `model` 指针中 `id/` 之后的部分
- 供应商无模型时保持现有合成行为(`modelId = ${id}-default`)
- 文本保持中文(UI 现状)
- 只提交用户明确要求提交的改动(仓库 git 安全约定)

---

### Task 1: 卡片——显示当前默认模型 + 模型下拉设默认

**Files:**
- Modify: `public/app.js`(render 函数、列表事件监听)
- Modify: `public/style.css`(select 样式)

**Interfaces:**
- Consumes: 现有 `/api/config` 返回的 `state.activeModel`(形如 `"a/m1"`)与 `p.isDefault`
- Produces: 卡片上 `select.activate-select`(data-id=供应商id),change 后调用现有 `POST /api/providers/:id/activate` body `{ modelId }`

- [ ] **Step 1: 修改 render(),默认徽章显示激活模型 id**

`public/app.js` render() 中,在 `card.dataset.id = id;` 之后、innerHTML 模板之前,计算:

```js
const modelKeys = Object.keys(p.config.models ?? {});
const activeMid = state.activeModel.startsWith(id + "/") ? state.activeModel.slice(id.length + 1) : "";
```

把 innerHTML 模板的徽章行改为:

```js
${p.isDefault ? `<span class="badge">默认 · ${escapeHtml(activeMid)}</span>` : ""}
```

- [ ] **Step 2: 修改 render() 的 ops 区,有模型的非默认供应商用下拉代替按钮**

把 ops 模板改为:

```js
<div class="ops">
  ${p.isDefault
    ? ""
    : modelKeys.length > 0
      ? `<select class="activate-select" data-id="${id}"><option value="" selected disabled>设为默认…</option>${modelKeys.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}</select>`
      : `<button data-act="activate" data-id="${id}">设为默认</button>`}
  <button data-act="edit" data-id="${id}">编辑</button>
  <button data-act="dup" data-id="${id}">复制</button>
  <button data-act="del" data-id="${id}" class="danger">删除</button>
</div>`
```

- [ ] **Step 3: 添加 change 监听,处理下拉选模型**

在现有 `listEl.addEventListener("click", ...)` 之后新增:

```js
listEl.addEventListener("change", async (e) => {
  const sel = e.target.closest("select.activate-select");
  if (!sel || !sel.value) return;
  try {
    await api(`/api/providers/${sel.dataset.id}/activate`, { method: "POST", body: JSON.stringify({ modelId: sel.value }) });
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});
```

- [ ] **Step 4: 添加 select 样式**

`public/style.css` 的 `button { ... }` 规则后追加:

```css
select { background: var(--border); color: var(--text); border: 0; border-radius: 6px; padding: 6px 8px; font-size: 13px; cursor: pointer; }
dialog select { background: var(--bg); border: 1px solid var(--border); padding: 8px; }
```

- [ ] **Step 5: 验证**

运行 `bun test`,预期 30 pass / 0 fail。手动:`bun server.ts` 后浏览器确认——默认卡片显示"默认 · <模型id>";非默认且有模型的卡片出现下拉,选中即切换默认并刷新。

- [ ] **Step 6: 提交(仅用户确认后)**

```bash
git add public/app.js public/style.css
git commit -m "feat: 卡片支持选择默认模型"
```

---

### Task 2: 表单——「设为默认供应商」勾选旁新增「默认模型」下拉

**Files:**
- Modify: `public/index.html`(勾选框后新增下拉)
- Modify: `public/app.js`(renderModels 同步下拉、勾选联动、保存逻辑)

**Interfaces:**
- Consumes: 现有 `#f-default` 勾选框、`models` 对象(表单内模型集合)、`state.activeModel`
- Produces: `#f-default-model` 下拉;保存时 `modelId` 优先级 = 下拉值 → 第一个模型 → `${id}-default`

- [ ] **Step 1: index.html 新增下拉**

`public/index.html` 第 30 行 `<label class="checkbox">...设为默认供应商</label>` 之后插入:

```html
<label id="default-model-row" hidden>
  <span>默认模型</span>
  <select id="f-default-model"></select>
</label>
```

- [ ] **Step 2: app.js 新增 syncDefaultModelUI 与勾选联动**

在 `renderModels` 函数之前新增:

```js
function syncDefaultModelUI() {
  const checked = $("#f-default").checked;
  const has = Object.keys(models).length > 0;
  $("#default-model-row").hidden = !(checked && has);
  const sel = $("#f-default-model");
  sel.disabled = !(checked && has);
  if (checked && has && !sel.value) sel.selectedIndex = 0;
}
```

并在 `$("#btn-add").onclick = () => openForm(null);` 附近新增:

```js
$("#f-default").addEventListener("change", syncDefaultModelUI);
```

- [ ] **Step 3: renderModels 同步下拉选项**

`public/app.js` 的 `renderModels()` 函数末尾(删除行渲染的 forEach 之后)追加:

```js
const sel = $("#f-default-model");
const prev = sel.value;
sel.innerHTML = "";
Object.keys(models).forEach((mid) => {
  const opt = document.createElement("option");
  opt.value = mid;
  opt.textContent = mid;
  sel.appendChild(opt);
});
if (prev && models[prev]) sel.value = prev;
syncDefaultModelUI();
```

- [ ] **Step 4: openForm 预选当前激活模型**

`public/app.js` openForm() 中 `renderModels();` 之后、`dialog.showModal();` 之前插入:

```js
if (provider?.isDefault) {
  const mid = (state.activeModel || "").startsWith(provider.id + "/") ? state.activeModel.slice(provider.id.length + 1) : "";
  if (mid && models[mid]) $("#f-default-model").value = mid;
}
```

- [ ] **Step 5: 保存逻辑优先用下拉值**

`public/app.js` submit 处理器中(约第 160 行):

```js
if ($("#f-default").checked) {
  const modelIds = Object.keys(models);
  const modelId = modelIds.length > 0 ? modelIds[0] : `${savedId}-default`;
```

改为:

```js
if ($("#f-default").checked) {
  const modelIds = Object.keys(models);
  const modelId = $("#f-default-model").value || modelIds[0] || `${savedId}-default`;
```

- [ ] **Step 6: 验证**

运行 `bun test`,预期 30 pass / 0 fail。手动:编辑默认供应商——下拉预选当前激活模型;勾选/取消勾选联动显隐;保存后默认模型为所选。

- [ ] **Step 7: 提交(仅用户确认后)**

```bash
git add public/index.html public/app.js
git commit -m "feat: 表单支持选择默认模型"
```

---

### Task 3: 最终验证

**Files:**
- (无代码改动)

- [ ] **Step 1: 全量测试**

运行 `bun test`,预期 `30 pass, 0 fail`。

- [ ] **Step 2: 手工冒烟**

`bun server.ts` 启动,浏览器操作:添加含多模型的供应商并勾选"设为默认"+ 选模型 → 保存;卡片出现"默认 · <所选模型>";对另一有模型供应商用下拉设默认 → 默认徽章切换;无模型供应商"设为默认"按钮仍可用。
