# AGENTS.md

mimocode 供应商管理工具 —— 带 UI 的 mimocode 第三方供应商管理。供应商写入真实配置文件 `mimocode.jsonc`,备注/链接/排序存并行元数据文件 `mimocode-ui.json`。

## 命令

- 启动:`bun server.ts`(默认端口 4173,`PORT` 环境变量可覆盖;Windows 用户可用 `start.bat`)
- 测试:`bun test`(bun:test,测试文件在 `test/*.test.ts`,与 `lib/*.ts` 一一对应)
- 无 tsconfig、无 lint/typecheck 脚本、无 node_modules —— 纯 Bun 直接跑 TS,没有构建步骤

## 架构

- `server.ts`:单个 `Bun.serve` —— REST API + `public/` 静态文件,无框架
- `lib/*.ts`:纯逻辑层,不依赖 Bun.serve,可独立单测;改逻辑优先改这里
- `public/`:原生 HTML/CSS/JS,无框架无构建
- `docs/compose/`:specs/plans/reports 是设计决策的权威来源(如 additive semantics 修订),改行为前先读

## 关键约束

- **配置路径**(`lib/config-path.ts`,与 mimocode 源码一致):`MIMOCODE_HOME` 设置时为 `$MIMOCODE_HOME/config`,否则一律 `~/.config/mimocode` —— Windows 也不走 `%LOCALAPPDATA%`(README 此处理旧,以代码为准)。候选文件名按序:`mimocode.jsonc` → `mimocode.json` → `config.json`
- **写回会剥离 JSONC 注释**并格式化为标准 JSON,原子写入(tmp+rename),同时备份到 `<config目录>/backups/` 保留最近 10 份 —— 经 UI/API 编辑后 mimocode.jsonc 的注释会丢失
- 供应商 id 必须匹配 `^[a-z0-9-]+$`(`lib/provider-ops.ts`)
- **additive 语义**:默认供应商由 `model: "<id>/<modelId>"` 指针表示(`isDefault = model.startsWith(id + "/")`),没有独立的激活标志。删除默认供应商时 `model` 自动重定向到剩余第一个,删光则清空
- `mimocode-ui.json`(与 mimocode.jsonc 同目录):字段为 `order` / `notes` / `links`
- API Key 明文存于 mimocode.jsonc;`/api/fetch-models` 仅代理供应商 `/models` 端点(15s 超时),不落盘
