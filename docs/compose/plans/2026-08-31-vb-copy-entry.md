# 变体库条目复制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 变体库每行加「复制」按钮，点击打开预填源条目全部字段的表单，改个新 ID 即可保存为新条目。

**Architecture:** 纯前端改动（`public/app.js` 单文件，约 25 行）。`openVbForm` 加 `copy` 参数控制 ID 可编辑与预填 `-copy` 后缀；用模块级变量 `vbCopySourceId` 记住源条目，submit 时从源条目取 `variantParams`（表单 ID 已变，现有 `vbEntries[id]` 取不到）；保存前检查新 ID 冲突。后端零改动（PUT 增量 merge 天然支持新条目）。

**Tech Stack:** 原生 JS（无框架无构建）

## Global Constraints

- 前端原生 HTML/CSS/JS，改动通过 `bun server.ts` 手动验证
- 项目无前端测试框架，验证 = 单元测试无回归 + 浏览器手动验证
- 复制模式 ID 预填 `源id-copy`（与 `duplicateProvider` 的供应商复制模式一致）

---

### Task 1: 变体库「复制」按钮 + 复制模式表单

**Covers:** 设计（对话中批准）：每行编辑/删除旁加复制按钮；表单预填全部字段、ID 预填 `源id-copy` 可改；variantParams 从源条目带过来；ID 冲突前端阻止。

**Files:**
- Modify: `public/app.js`（openVbForm 第 484-501 行、renderVbList 按钮区第 462-476 行、vb-list click 第 575-579 行、vb-form submit 第 530-573 行）

**Interfaces:**
- Consumes: `vbEntries`（模块级变体库条目缓存）、`openVbForm(id)`、现有 submit 校验/提交链
- Produces: `openVbForm(id, copy)` 新签名、模块级 `vbCopySourceId`

- [ ] **Step 1: 修改 openVbForm 支持 copy 模式**

将 `public/app.js` 第 484-501 行的 `openVbForm` 改为：

```javascript
let vbCopySourceId = null;

function openVbForm(id = null, copy = false) {
  const e = id ? vbEntries[id] : {};
  vbCopySourceId = copy ? id : null;
  $("#vb-form-wrap").classList.remove("hidden");
  $("#vb-id").value = copy ? `${id}-copy` : id ?? "";
  $("#vb-id").disabled = !!id && !copy;
  $("#vb-name").value = e.name ?? "";
  $("#vb-variants").value = (e.variants ?? []).join(", ");
  $("#vb-source").value = e.source ?? "";
  $("#vb-limit-context").value = e.limit?.context ?? "";
  $("#vb-limit-output").value = e.limit?.output ?? "";
  const modIn = e.modalities?.input ?? [];
  document.querySelectorAll('#vb-form [data-vbmod]').forEach((cb) => {
    if (cb.dataset.vbmod !== "text") cb.checked = modIn.includes(cb.dataset.vbmod);
  });
  const rsVal = e.reasoning === true ? "true" : e.reasoning === false ? "false" : "";
  $("#vb-reasoning").value = rsVal;
  $("#vb-id").focus();
}
```

（`vbCopySourceId` 放在 openVbForm 前面声明；编辑模式 `vbCopySourceId = null`，复制模式记住源 ID。）

- [ ] **Step 2: renderVbList 每行加「复制」按钮**

在第 468 行 `editBtn.textContent = "编辑";` 之后、`const delBtn` 之前插入：

```javascript
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.dataset.vb = "copy";
    copyBtn.dataset.id = id;
    copyBtn.textContent = "复制";
```

并把第 475-476 行改为：

```javascript
    ops.appendChild(editBtn);
    ops.appendChild(copyBtn);
    ops.appendChild(delBtn);
```

- [ ] **Step 3: vb-list click 处理 copy 动作**

将第 579 行 `if (btn.dataset.vb === "edit") { openVbForm(id); return; }` 之后加一行：

```javascript
  if (btn.dataset.vb === "copy") { openVbForm(id, true); return; }
```

- [ ] **Step 4: submit 从源条目取 variantParams + ID 冲突检查**

在 submit handler（第 530 行起）中：

将第 532-533 行：

```javascript
  const id = $("#vb-id").value.trim();
  if (!id) return;
```

改为：

```javascript
  const id = $("#vb-id").value.trim();
  if (!id) return;
  if (vbEntries[id] && id !== vbCopySourceId) { alert(`条目 ${id} 已存在,请换一个 ID`); return; }
```

将第 540-544 行：

```javascript
  // 编辑既有条目时保留其 variantParams(表单无此字段,编辑其他字段不应丢参数映射)
  const prevParams = vbEntries[id]?.variantParams;
```

改为：

```javascript
  // 编辑/复制时保留 variantParams(表单无此字段):编辑取自身,复制取源条目
  const paramsFrom = vbCopySourceId ?? id;
  const prevParams = vbEntries[paramsFrom]?.variantParams;
```

（说明：编辑模式 `vbCopySourceId` 为 null → `paramsFrom = id`，行为不变；复制模式从源条目取。`modalities.output` 保留逻辑第 556 行同理，复制模式下 `vbEntries[id]` 不存在 → `existingOutput` 为 undefined → 落到 `["text"]` 默认值，若源条目有自定义 output 会丢——一并改为 `vbEntries[vbCopySourceId ?? id]?.modalities?.output`。）

- [ ] **Step 5: 运行单元测试确认无回归**

Run: `bun test`
Expected: 全部 PASS（68 个测试，纯前端改动不应影响）

- [ ] **Step 6: 手动验证**

Run: `bun server.ts`，浏览器打开 `http://localhost:4173` → 变体库：
1. 每行显示 编辑/复制/删除 三个按钮
2. 点 glm-5.3 的「复制」→ 表单打开，ID 预填 `glm-5.3-copy` 且可编辑，变体/上下文/输出/模态/推理全部预填
3. 改 ID 为 `glm-5.3-copy2`，保存 → 列表出现新条目，字段与源一致，源条目未动
4. 再次复制并保持 ID `glm-5.3-copy2` → alert「已存在」阻止
5. 编辑模式回归：点「编辑」→ ID disabled，保存正常；「+ 新增条目」→ 空表单正常

- [ ] **Step 7: Commit**

```bash
git add public/app.js
git commit -m "feat: 变体库条目复制(预填源条目字段,含 variantParams 与 ID 冲突检查)"
```
