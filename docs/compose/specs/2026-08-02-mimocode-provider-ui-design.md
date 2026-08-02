---
feature: mimocode-provider-ui
status: delivered
updated: 2026-08-02
---

# mimocode 供应商管理工具设计

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mimocode-provider-ui.md)

## [S1] Problem

用户使用 mimocode(小米 MiMoCode,opencode 的官方 fork,仓库 XiaomiMiMo/MiMo-Code)时需要
管理多个第三方 API 供应商(中转站等),目前只能手动编辑 `mimocode.jsonc`。cc-switch
(开源)支持 8 个 AI CLI 工具但不支持 mimocode,且其重型架构(SQLite 中间存储、
MCP/Skills/代理/用量)对单工具场景过重。用户需要一个**只服务 mimocode 的、
带 UI 的第三方供应商管理工具**。

mimocode 配置格式(.mimocode/mimocode.jsonc,Windows 为 `%LOCALAPPDATA%\mimocode\`,
可用 `MIMOCODE_HOME` 覆盖)天然是**多 provider 注册表 + model 指针**的 additive 结构:

```jsonc
{
  "provider": {
    "my-provider": {
      "name": "显示名",
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "...", "apiKey": "..." },
      "models": { "model-id": { "name": "模型显示名" } }
    }
  },
  "model": "my-provider/model-id"
}
```

官方 schema 确认:provider 对象**无任何强制字段**;必要字段仅
`npm`(或 `api`)、`options.baseURL`、`options.apiKey`;`name`/`models` 建议填写;
`options.headers`、`options.setCacheKey`、`options.timeout` 等为可选。
备注/官网链接在 mimocode schema 中**无对应字段**。

## [S2] Design

### 1. 形态与技术栈

- 本地 Web 应用 + 一键启动脚本:`start.bat` 双击 → `bun server.ts` 起本地 HTTP
  服务(127.0.0.1)→ 自动打开浏览器 → 关闭窗口服务退出。
- 运行时:Bun(用户机器已有,无需安装新工具链)。
- 前端:极简单页(原生 HTML/CSS/JS,无框架、无构建依赖)。
- 借鉴 cc-switch 的 opencode 适配器思路:additive 切换机制(全量写 provider,
  只改 model 指针)、原子写入(临时文件 + rename)、最小侵入(至少保留一个启用中的
  供应商)。

### 2. 数据模型

- **mimocode.jsonc = 唯一事实源**:所有供应商数据直接读写该文件。
- **并行元数据文件 `mimocode-ui.json`**(与 mimocode.jsonc 同目录):按 provider id
  存 mimocode 不认识的 UI 字段——备注、官网链接、显示排序顺序。
- **写回策略**:JSONC 解析(strip 注释 + 尾逗号)→ 修改 → 序列化为格式化 JSON
  (注释丢弃,数据零丢失)→ 原子写入(临时文件 + rename)。
- **写回前自动备份**当前文件到 `backups/`(保留最近 10 份)。

### 3. 功能清单(MVP)

1. **自定义添加供应商**:表单字段 = 供应商标识(键名,小写+连字符校验)/ 名称 /
   API Key / Base URL / 模型列表(手动添加 + 自动获取)/ 可选:请求头、备注、官网链接。
   隐藏字段:`npm` 固定为 `@ai-sdk/openai-compatible`;`setCacheKey` 保持默认。
2. **启用/切换**:点"启用" → 改顶层 `model` 指针为 `provider/model` → 原子写回。
3. **编辑**:修改已有供应商的任意字段,写回。
4. **复制**:复制完整 provider 条目,新 key 加 `-copy` 后缀,插入原条目下方。
5. **删除**:确认后删除;**禁止删除当前启用中的供应商**(最小侵入原则)。
6. **自动获取模型**:UI 点按钮 → Bun 服务端用该供应商的 apiKey 代理请求
   `/v1/models`(解决浏览器 CORS)→ 返回模型列表填入。
7. **拖拽排序**:排序顺序存 `mimocode-ui.json`(mimocode.jsonc 的 provider 对象
   键序不保证语义)。

不做:预设库(mimocode 内置常用供应商)、MCP/Skills 管理、用量统计、代理服务、
云同步、多语言。

### 4. 服务端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/config` | 读 mimocode.jsonc + 元数据,返回 providers 列表、当前激活、路径信息 |
| POST | `/api/providers` | 新增供应商 |
| PUT | `/api/providers/:id` | 更新供应商 |
| DELETE | `/api/providers/:id` | 删除(校验非激活) |
| POST | `/api/providers/:id/activate` | 切换激活(改 model 指针) |
| POST | `/api/providers/:id/duplicate` | 复制 |
| PUT | `/api/order` | 保存排序 |
| POST | `/api/fetch-models` | 代理 `/v1/models`(请求体含 baseURL/apiKey) |
| GET | `/` | 静态 UI |

### 5. 路径解析

- `MIMOCODE_HOME` 环境变量优先;否则 Windows `%LOCALAPPDATA%\mimocode\mimocode.jsonc`;
  macOS/Linux `~/.config/mimocode/mimocode.jsonc`。
- 配置不存在 → UI 提示,提供"创建空模板"。
- 解析失败 → 显示错误,拒绝任何写回(防止覆盖损坏配置)。

### 6. 错误处理

- JSONC 解析失败:拒绝写回,UI 显示错误。
- 重复 provider id:拒绝添加,提示改名。
- 删除激活中供应商:阻止。
- `/v1/models` 代理失败(401/404/超时):分类提示(借鉴 cc-switch 手册的错误分类)。

### 7. 测试

- 配置读写模块单测:JSONC 解析(注释/尾逗号)、序列化 round-trip、原子写入、
  路径解析、切换指针正确性、复制/删除边界。
- 前端手工验证:增删改切换全流程、排序、获取模型。

## [S3] Out of Scope

- 不做预设库(常用第三方供应商 mimocode 已内置)。
- 不改造 cc-switch、不合并 upstream。
- 不做 MCP/Skills/用量/代理/云同步/多语言。
- 不处理 mimocode 之外的 CLI 工具。

## Tasks

- [ ] T1: 项目骨架 — start.bat + server.ts 静态服务 + index.html 占位页 (covers: S2-1)
- [ ] T2: 配置读写模块 — JSONC 解析/序列化/原子写入/路径解析/备份 (covers: S2-2, S2-5)
- [ ] T3: 配置读写模块单测 (covers: S2-7)
- [ ] T4: 服务端 API — config/providers CRUD/activate/duplicate/order (covers: S2-4)
- [ ] T5: fetch-models 代理 (covers: S2-3-6)
- [ ] T6: 前端 UI — 卡片列表/添加表单/编辑/复制/删除/切换/排序 (covers: S2-3)
- [ ] T7: 前端手工验证全流程 (covers: S2-7)
