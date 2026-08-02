---
feature: mimocode-provider-ui
status: delivered
specs:
  - docs/compose/specs/2026-08-02-mimocode-provider-ui-design.md
plans:
  - docs/compose/plans/2026-08-02-mimocode-provider-ui.md
branch: feat/mimocode-provider-ui
commits: 966e91d..1c7b913
---

# mimocode 供应商管理工具 — 最终报告

## What Was Built

一个带 UI 的 mimocode 第三方供应商管理工具。用户通过浏览器界面管理多个第三方 API 供应商(中转站等),供应商数据直接读写 mimocode 的真实配置文件 `mimocode.jsonc`,切换激活只改顶层 `model` 指针——与 cc-switch 对 opencode 的 additive 切换机制一致。

工具形态是本地 Web 应用:`start.bat` 双击启动 Bun HTTP 服务并自动打开浏览器,无需安装任何工具链(仅需用户已有的 Bun)。所有配置读写、备份、模型拉取代理都由本地服务完成,浏览器仅作为 UI 壳。

## Architecture

```
start.bat → bun server.ts → 本地 HTTP 服务(127.0.0.1:4173)
  ├─ 静态资源:public/ (index.html + style.css + app.js,原生 JS 无框架)
  ├─ REST API:供应商 CRUD / 激活 / 复制 / 排序
  └─ 代理:POST /api/fetch-models → 上游 /models(解决浏览器 CORS)
            │ 读写
            ├─ mimocode.jsonc      ← 供应商数据(唯一事实源)
            └─ mimocode-ui.json    ← 备注/链接/排序顺序(元数据)
```

模块划分(`lib/`):
- `jsonc.ts` — JSONC 解析(逐字符扫描剥离 `//`、`/* */` 注释和尾逗号)+ 格式化序列化
- `config-path.ts` — 路径解析:`MIMOCODE_HOME` → `%LOCALAPPDATA%\mimocode\` → `~/.config/mimocode/`
- `config-store.ts` — 读写配置:自动建目录、原子写入(临时文件+rename)、写回前备份到 `backups/`(保留 10 份)
- `metadata.ts` — 元数据文件读写(备注/链接/排序,不入 mimocode.jsonc)
- `provider-ops.ts` — 供应商纯函数操作:增/改/删/激活/复制/列表

### Design Decisions

- **直接读写 mimocode.jsonc 而非中间存储**:mimocode 配置天然是多 provider 注册表 + model 指针结构,直接读写无同步冲突;备注/链接等 mimocode 不认识的字段放并行元数据文件。cc-switch 用 SQLite 是因为它跨 8 工具 + MCP/Skills 重型功能,单工具场景不需要。
- **写回为格式化 JSON(丢弃注释)**:JSONC 注释只服务可读性,工具接管后统一格式化更整洁,数据零丢失。避免引入 JSONC AST 库的复杂度。
- **写操作自动初始化空配置**:首次使用无 mimocode.jsonc 时,POST 创建供应商会自动生成 `{ provider: {} }` 模板,而非报错。
- **仅原生 JS 无前端框架**:功能简单(卡片列表 + 一个表单),零构建依赖符合"双击即用"目标。

## Usage

1. 双击 `start.bat`(或运行 `bun server.ts`),浏览器自动打开 http://127.0.0.1:4173
2. 点「+ 添加供应商」:填写标识(小写+连字符)/ 名称 / API Key / Base URL / 可选备注链接模型
3. 点「获取模型」自动从该供应商 `/models` 端点拉取模型列表(需已填 key 和 baseURL)
4. 卡片上操作:「启用」切换激活(改 model 指针,重启 mimo 生效)/ 编辑 / 复制 / 删除 / 拖拽排序
5. 当前启用中的供应商不可删除(最小侵入原则);切换回原配置可在 mimocode.jsonc 的 `backups/` 找到历史备份

API 信封统一 `{ ok: true, data }` / `{ ok: false, error }`;端点:`GET /api/config`、`POST /api/providers`、`PUT/DELETE /api/providers/:id`、`POST /api/providers/:id/activate|duplicate`、`PUT /api/order`、`POST /api/fetch-models`。

## Verification

- **单元测试**:26 个测试全过(`bun test`)——JSONC 解析(注释/尾逗号/字符串内符号/语法错误)、路径解析(环境变量覆盖/平台默认)、存储(原子写入/备份轮转 10 份)、provider 操作(CRUD/激活/复制后缀递增/删除激活中拒绝)。
- **API 冒烟测试**:curl 验证首次自动建配置、增删改查、激活、复制、删除激活限制、排序、元数据写回。
- **端到端验证**:完整用户流程(添加 2 个 → 启用 → 编辑 → 复制 → 排序)后检查生成的 mimocode.jsonc 内容与格式正确。
- **静态资源验证**:html/css/js 均 200,不存在路径 404,路径穿越 403。

实施中修复的问题:activate/duplicate 路由 id 解析 bug(多段路径匹配失败)、静态资源仅允许 .html 的 bug、首次使用无法创建配置的设计缺陷。

## Journey Log

- [lesson] mimocode 的 provider schema 无任何强制字段,必要字段仅 npm + options.baseURL/apiKey——表单不需要照抄 cc-switch 的全部字段(备注/官网链接在 mimocode 里无对应位置)。
- [pivot] 数据模型从"中间存储 + 写回"(cc-switch 式)改为"直接读写 mimocode.jsonc + 并行元数据文件",因为单工具场景双份真相会引入同步冲突。
- [dead end] server.ts 早期把 activate/duplicate 的 id 从单段路径正则提取,多段路径(id/activate)匹配失败返回 404,改为独立正则后修复。
- [lesson] Windows 上 `path.join` 返回反斜杠,测试期望值必须用 join 构造而非硬编码正斜杠,否则跨平台测试失败。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-02-mimocode-provider-ui-design.md` | 设计文档 | 需求与决策来源 |
| `docs/compose/plans/2026-08-02-mimocode-provider-ui.md` | 实施计划 | 7 任务,全部完成 |
