# 官方库扩展 limit 字段 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/official-limit.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 官方库 `official.json` 条目支持可选 `limit {context, output}` 字段,UI 获取模型列表后按「已存 ?? 官方 ?? 内置」优先级预填,变体库管理对话框可编辑 limit。

**Architecture:** 数据层 `data/variants/official.json` 条目加可选 limit 字段(与内置快照 `mimo.json` 同构);`server.ts` 的 `PUT /api/variants/official` 加逐条校验;前端 `public/app.js` 改预填优先级并扩展变体库对话框表单;`public/index.html` 加两个输入框。无 lib 层新逻辑,无新依赖。

**Tech Stack:** Bun + 原生 HTML/CSS/JS,零依赖。

## Global Constraints

- 供应商 id 正则 `^[a-z0-9-]+$`;API 统一 `{ok:true,data}` / `{ok:false,error}` 信封
- 测试/临时文件一律放 `test/.tmp/`(已 gitignore),不用系统临时目录
- 冒烟/E2E 用临时 `$env:MIMOCODE_HOME` 指向 `test/.tmp/smoke-*`,不污染真实用户配置
- 写回型 API 冒烟用 round-trip(先 GET 现状再 PUT 相同内容),不污染 `data/variants/official.json` 真实数据
- `public/*.js` 必须纯 JS(无 TS 类型标注,否则 bun build 报错);前端验证 = `bun build public/app.js --outfile test/.tmp/app_check.js`
- `official.json` 的 `//` 说明键恒在文件头,请求体 `//` 不可覆盖(variants-store 保证)
- limit 语义:`context`/`output` 均为有限正整数;空 = 不写键(与变体「空=不写」语义一致)

---

### Task 1: 数据模型 + server 校验

**Covers:** [S2, S3]

**Files:**
- Modify: `data/variants/official.json:2`(说明键)
- Modify: `server.ts:104-125`(PUT /api/variants/official 校验块)
- Test: `test/.tmp/smoke-official-limit/`(冒烟,手动验证)

**Interfaces:**
- Consumes: 无(纯数据/路由层)
- Produces: `PUT /api/variants/official` 接受带 `limit: {context?, output?}` 的条目;非法 limit → 400

- [ ] **Step 1: 更新 official.json 说明键**

编辑 `data/variants/official.json:2`,将 `"//"` 值改为:

```json
"//": "官方文档模型库:手动维护。字段:name 显示名, variants 官方支持的变体列表, limit 可选(模型上下文/输出上限,如 {\\\"context\\\":200000,\\\"output\\\":64000}), source 文档链接, updated 更新日期。新增条目:查模型官方文档确认支持哪些思考强度与上下文/输出限制后追加。"
```

注:实际写入文件时该行是 JSON 字符串,直接写中文即可,无需转义(上面转义仅因 Markdown 展示)。

- [ ] **Step 2: 给 server.ts 加 limit 校验**

编辑 `server.ts`,在现有 variants 校验之后(`server.ts:118` 的 `}` 之后、`writeOfficialVariants` 调用之前)插入:

```ts
          const lim = (entry as Record<string, unknown>).limit;
          if (lim !== undefined) {
            if (typeof lim !== "object" || lim === null || Array.isArray(lim)) {
              return fail(400, `条目 ${id} 的 limit 必须是对象`);
            }
            for (const k of ["context", "output"] as const) {
              const val = (lim as Record<string, unknown>)[k];
              if (val !== undefined && (typeof val !== "number" || !Number.isFinite(val) || val <= 0)) {
                return fail(400, `条目 ${id} 的 limit.${k} 必须是正整数`);
              }
            }
          }
```

- [ ] **Step 3: 语法检查 server.ts**

Run: `bun build server.ts --outfile test/.tmp/server_check.js`
Expected: 构建成功,无报错

- [ ] **Step 4: 冒烟验证校验行为**

Run(临时 MIMOCODE_HOME,避免读真实配置;真实 official.json 用 round-trip 保护):

```powershell
$env:MIMOCODE_HOME = "E:\code\ccswitch_mimo_ds\test\.tmp\smoke-official-limit"
bun server.ts (后台 Start-Job,稍候)
# 1) 非法 limit(负数)→ 400
Invoke-RestMethod -Method Put -Uri http://127.0.0.1:4173/api/variants/official -ContentType application/json -Body '{"x":{"variants":["low"],"limit":{"context":-1}}}'
# 期望: { ok: false, error: "条目 x 的 limit.context 必须是正整数" },HTTP 400
# 2) 合法 limit → 200,然后 round-trip 恢复
# 先 GET 现状 → PUT 相同内容 → 断言 200 且文件字节不变
```

Expected: 非法 limit 返回 400 带清晰错误;合法 limit 返回 `{ok:true,data:{}}`;round-trip 后 `data/variants/official.json` 字节不变

- [ ] **Step 5: Commit**

```bash
git add data/variants/official.json server.ts
git commit -m "feat: official 条目支持 limit 字段及校验"
```

---

### Task 2: 前端 limit 预填优先级

**Covers:** [S4]

**Files:**
- Modify: `public/app.js:252-254`(renderModels 的 limit 预填)
- Test: `test/.tmp/app_check.js`(bun build 语法检查)

**Interfaces:**
- Consumes: `variantData.official[id].limit`(Task 1 数据模型提供)
- Produces: 无(内部渲染逻辑)

- [ ] **Step 1: 修改 renderModels 预填**

编辑 `public/app.js:252-254`,将:

```js
    const bl = variantData.builtin?.[id]?.limit;
    const ctx = m?.limit?.context ?? bl?.context ?? "";
    const out = m?.limit?.output ?? bl?.output ?? "";
```

改为:

```js
    const bl = variantData.builtin?.[id]?.limit;
    const ol = variantData.official?.[id]?.limit;
    const ctx = m?.limit?.context ?? ol?.context ?? bl?.context ?? "";
    const out = m?.limit?.output ?? ol?.output ?? bl?.output ?? "";
```

- [ ] **Step 2: 语法检查**

Run: `bun build public/app.js --outfile test/.tmp/app_check.js`
Expected: 构建成功

- [ ] **Step 3: 冒烟验证预填**

Run: 启动 server(临时 MIMOCODE_HOME)→ 手动/脚本打开供应商编辑对话框。为验证"官方优先",临时向 `data/variants/official.json` 加一个带 limit 的测试条目 → 添加供应商 → 获取模型 → 断言无内置模型的 limit 输入框回显官方值 → 测完删除测试条目并恢复文件(round-trip)。

Expected: 无内置模型的模型行,「上下文/输出」输入框预填官方 limit 值;有内置的仍以已存配置 > 官方 > 内置优先级

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: limit 预填优先级改为已存/官方/内置"
```

---

### Task 3: 变体库管理对话框 limit 编辑

**Covers:** [S5]

**Files:**
- Modify: `public/index.html:67`(vb-form 加两个输入框)
- Modify: `public/app.js`(openVbForm 回填 / submit 收集 / renderVbList 显示)
- Modify: `public/style.css`(limit 输入行样式,如需)
- Test: `test/.tmp/app_check.js`(bun build 语法检查)

**Interfaces:**
- Consumes: `PUT /api/variants/official` 的 limit 校验(Task 1);`vbEntries[id].limit`(前端本地状态)
- Produces: 表单可录入 limit;列表显示 limit;提交写入 `entry.limit`

- [ ] **Step 1: index.html 加输入框**

编辑 `public/index.html:67`(`变体列表` 输入框行)之后插入:

```html
          <label>上下文 <input id="vb-limit-context" inputmode="numeric" placeholder="可选,如 200000"></label>
          <label>输出 <input id="vb-limit-output" inputmode="numeric" placeholder="可选,如 64000"></label>
```

- [ ] **Step 2: style.css 加 limit 行样式(可选,先不加若布局可接受)**

编辑 `public/style.css` 的 `.vb-form` 区块后追加(仅当 Step 4 冒烟发现布局问题才需要;预期 label 纵向排列天然可用,先不加):

```css
.vb-limit-row { display: flex; gap: 8px; }
.vb-limit-row label { flex: 1; }
```

- [ ] **Step 3: app.js 回填 limit**

编辑 `public/app.js` `openVbForm`(约 374-383 行),在 `$("#vb-source").value = e.source ?? "";` 后加:

```js
  $("#vb-limit-context").value = e.limit?.context ?? "";
  $("#vb-limit-output").value = e.limit?.output ?? "";
```

- [ ] **Step 4: app.js submit 收集 limit**

编辑 `public/app.js` `$("#vb-form").addEventListener("submit", ...)`(约 412-421 行),将 entry 构造改为:

```js
  const entry = {
    name: $("#vb-name").value.trim(),
    variants: $("#vb-variants").value.split(",").map((x) => x.trim()).filter(Boolean),
    source: $("#vb-source").value.trim(),
    updated: new Date().toISOString().slice(0, 10),
  };
  const cRaw = Number($("#vb-limit-context").value);
  const oRaw = Number($("#vb-limit-output").value);
  const hasC = Number.isFinite(cRaw) && cRaw > 0;
  const hasO = Number.isFinite(oRaw) && oRaw > 0;
  if (hasC || hasO) {
    entry.limit = { ...(hasC ? { context: cRaw } : {}), ...(hasO ? { output: oRaw } : {}) };
  }
```

(保留原有 `const next = { ...vbEntries, [id]: entry };` 等后续逻辑不变)

- [ ] **Step 5: app.js renderVbList 显示 limit**

编辑 `public/app.js` `renderVbList` 的 `sub` 构造(约 343-347 行),改为:

```js
    const lim = e.limit;
    const sub = document.createElement("div");
    sub.className = "vb-sub";
    sub.textContent = [e.name, lim ? `ctx ${lim.context ?? "?"} · out ${lim.output ?? "?"}` : "", e.source, e.updated].filter(Boolean).join(" · ");
    sub.title = sub.textContent;
```

- [ ] **Step 6: 语法检查 + 冒烟**

Run: `bun build public/app.js --outfile test/.tmp/app_check.js`
Expected: 构建成功

冒烟:启动 server → 打开变体库对话框 → 新增条目录入 limit → 保存 → 列表显示 `ctx … · out …` → 编辑回显 limit → 清空两框保存 → 条目无 limit 键(round-trip 后恢复文件)。

Expected: 表单录入/回显/显示闭环正常;空两框不写 limit 键

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: 变体库对话框支持编辑 limit"
```

---

### Task 4: 全量回归验证

**Covers:** [S6]

**Files:**
- Test: 全量(见下)

**Interfaces:**
- Consumes: 所有 Task 1-3 产出

- [ ] **Step 1: bun test 全绿**

Run: `bun test`
Expected: 全部通过(现有 31 个,本次无 lib 新逻辑,数量不变)

- [ ] **Step 2: 前端语法检查**

Run: `bun build public/app.js --outfile test/.tmp/app_check.js`
Expected: 构建成功

- [ ] **Step 3: 冒烟回归(临时 MIMOCODE_HOME)**

Run: `bun server.ts`(Start-Job 后台)+ Invoke-WebRequest `/`、`/app.js`、`/style.css`、`GET /api/variants` 断言 200;Stop-Job/Remove-Job 清理;删除 `test/.tmp/smoke-*` 目录。

Expected: 四个端点全 200;临时目录清理干净;真实配置与 `data/variants/official.json` 未被污染(git status 确认只有本次预期改动)

- [ ] **Step 4: 清理临时文件**

Run: 删除 `test/.tmp/` 下本次冒烟产物(app_check.js、server_check.js、smoke-* 目录)
Expected: 无残留

- [ ] **Step 5: Commit(如有验证期修复)**

```bash
git add -A && git commit -m "chore: 回归验证修复"
```

仅当验证中发现需修复的问题时执行;否则跳过本步。
