# mimocode 供应商管理工具实施计划

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/mimocode-provider-ui.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个带 UI 的 mimocode 第三方供应商管理工具(本地 Web 应用 + 一键启动脚本),直接读写 `mimocode.jsonc`。

**Architecture:** Bun 本地 HTTP 服务提供静态 UI + REST API;前端为原生 JS 卡片列表页;供应商数据直接读写 mimocode.jsonc(SSOT),备注/链接/排序存并行元数据文件 `mimocode-ui.json`;切换采用 additive 模式(全量写 provider,只改 `model` 指针);写回前自动备份,原子写入。

**Tech Stack:** Bun 1.3.14(运行时 + 测试 `bun test`)、原生 HTML/CSS/JS(无框架)、无第三方依赖。

## Global Constraints

- 供应商数据唯一事实源是 mimocode.jsonc,元数据文件只存 mimocode 不认识的字段。
- 写回策略:JSONC 解析(strip 注释/尾逗号)→ 序列化为格式化 JSON → 原子写入(临时文件+rename)。
- 写回前必须备份当前文件到 `backups/`(保留最近 10 份)。
- 禁止删除当前启用中的供应商;至少保留一个启用中的供应商。
- provider id 校验:仅小写字母、数字、连字符(`/^[a-z0-9-]+$/`)。
- `npm` 固定为 `@ai-sdk/openai-compatible`(UI 隐藏该字段)。
- 路径解析:`MIMOCODE_HOME` 优先 → Windows `%LOCALAPPDATA%\mimocode\mimocode.jsonc` → `~/.config/mimocode/mimocode.jsonc`。
- 所有代码无第三方运行时依赖;测试用 `bun test`。
- 接口返回 JSON,统一 `{ ok: true, data }` / `{ ok: false, error }` 信封。

---

### Task 1: 项目骨架 + JSONC 解析模块

**Covers:** S2-1, S2-2

**Files:**
- Create: `package.json`
- Create: `lib/jsonc.ts`
- Test: `test/jsonc.test.ts`

**Interfaces:**
- Produces: `parseJsonc(text: string): unknown`(剥离注释/尾逗号后解析,失败抛 `Error`)、`stringifyJson(value: unknown): string`(格式化 JSON + 末尾换行)

- [ ] **Step 1: 初始化 git 与 package.json**

```bash
git init
```

`package.json`:
```json
{
  "name": "mimocode-provider-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun server.ts",
    "test": "bun test"
  }
}
```

- [ ] **Step 2: 写失败测试 `test/jsonc.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { parseJsonc, stringifyJson } from "../lib/jsonc";

describe("parseJsonc", () => {
  test("解析标准 JSON", () => {
    expect(parseJsonc('{"a": 1}')).toEqual({ a: 1 });
  });
  test("剥离单行注释", () => {
    const text = `{\n  // provider 注册表\n  "model": "a/m1"\n}`;
    expect(parseJsonc(text)).toEqual({ model: "a/m1" });
  });
  test("剥离块注释", () => {
    const text = `{ /* 块注释 */ "a": 1 }`;
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });
  test("剥离尾逗号", () => {
    const text = `{ "a": 1, "b": 2, }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: 2 });
  });
  test("字符串内的注释符号不被剥离", () => {
    const text = `{ "url": "http://x.com/a", "s": "// not comment" }`;
    expect(parseJsonc(text)).toEqual({ url: "http://x.com/a", s: "// not comment" });
  });
  test("语法错误抛 Error", () => {
    expect(() => parseJsonc("{ a: }")).toThrow();
  });
});

describe("stringifyJson", () => {
  test("格式化输出 + 末尾换行", () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test test/jsonc.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 4: 实现 `lib/jsonc.ts`**

```ts
// 逐字符扫描,正确处理字符串与转义,剥离 // 与 /* */ 注释和尾逗号
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === ",") {
      // 若下一非空白字符是 } 或 ],则跳过该逗号(尾逗号)
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") {
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test test/jsonc.test.ts`
Expected: PASS(6 个用例)

- [ ] **Step 6: Commit**

```bash
git add package.json lib/jsonc.ts test/jsonc.test.ts
git commit -m "feat: jsonc parse and stringify module"
```

---

### Task 2: 配置路径解析 + 存储(读写/备份/原子写入)

**Covers:** S2-2, S2-5

**Files:**
- Create: `lib/config-path.ts`
- Create: `lib/config-store.ts`
- Test: `test/config-path.test.ts`, `test/config-store.test.ts`

**Interfaces:**
- Consumes: `parseJsonc`, `stringifyJson`(Task 1)
- Produces:
  - `resolveConfigPaths(): { configFile: string; metadataFile: string; backupDir: string }`
  - `readConfig(configFile: string): unknown`(文件不存在返回 `null`,解析失败抛 `Error` 并携带文件名)
  - `writeConfig(configFile: string, data: unknown): void`(备份 + 原子写入,自动建目录)

- [ ] **Step 1: 写失败测试 `test/config-path.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { resolveConfigPaths } from "../lib/config-path";

describe("resolveConfigPaths", () => {
  const oldHome = process.env.MIMOCODE_HOME;
  const oldLocal = process.env.LOCALAPPDATA;
  const oldOs = process.platform;

  test("MIMOCODE_HOME 优先", () => {
    process.env.MIMOCODE_HOME = "D:/mimo";
    const p = resolveConfigPaths();
    expect(p.configFile).toBe("D:/mimo/mimocode.jsonc");
    expect(p.metadataFile).toBe("D:/mimo/mimocode-ui.json");
    expect(p.backupDir).toBe("D:/mimo/backups");
  });
  test("Windows 默认路径", () => {
    delete process.env.MIMOCODE_HOME;
    process.env.LOCALAPPDATA = "C:/Users/t/AppData/Local";
    const p = resolveConfigPaths();
    expect(p.configFile).toBe("C:/Users/t/AppData/Local/mimocode/mimocode.jsonc");
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.MIMOCODE_HOME;
    else process.env.MIMOCODE_HOME = oldHome;
    if (oldLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocal;
  });
});
```

- [ ] **Step 2: 写失败测试 `test/config-store.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfig, writeConfig } from "../lib/config-store";

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "mimo-store-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("readConfig", () => {
  test("文件不存在返回 null", () => {
    expect(readConfig(join(dir, "nope.jsonc"))).toBeNull();
  });
  test("读取 JSONC 文件", () => {
    const f = join(dir, "c.jsonc");
    writeConfig(f, { provider: { a: {} }, model: "a/m" });
    expect(readConfig(f)).toEqual({ provider: { a: {} }, model: "a/m" });
  });
});

describe("writeConfig", () => {
  test("写入并创建目录", () => {
    const f = join(dir, "sub", "c.jsonc");
    writeConfig(f, { a: 1 });
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual({ a: 1 });
  });
  test("原子写入:不残留临时文件", () => {
    const f = join(dir, "c.jsonc");
    writeConfig(f, { a: 1 });
    const tmpFiles = readFileSync(dir).length === 0;
    expect(tmpFiles).toBe(true);
    expect(existsSync(f)).toBe(true);
  });
  test("第二次写入前生成备份", () => {
    const f = join(dir, "c.jsonc");
    writeConfig(f, { v: 1 });
    writeConfig(f, { v: 2 });
    const backups = join(dir, "backups");
    expect(existsSync(backups)).toBe(true);
    const files = readFileSync(backups);
    // backup 文件与主文件同目录结构 backups/c.jsonc.<timestamp>
    const names = files.filter((n) => n.startsWith("c.jsonc."));
    expect(names.length).toBeGreaterThan(0);
  });
  test("备份只保留最近 10 份", () => {
    const f = join(dir, "c.jsonc");
    for (let i = 0; i < 15; i++) writeConfig(f, { v: i });
    const backups = join(dir, "backups");
    const names = readFileSync(backups).filter((n) => n.startsWith("c.jsonc."));
    expect(names.length).toBe(10);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test test/config-path.test.ts test/config-store.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 4: 实现 `lib/config-path.ts`**

```ts
import { join } from "node:path";
import { homedir } from "node:os";

export interface ConfigPaths {
  configFile: string;
  metadataFile: string;
  backupDir: string;
}

export function resolveConfigPaths(): ConfigPaths {
  let base: string;
  const mimoHome = process.env.MIMOCODE_HOME;
  if (mimoHome) {
    base = mimoHome;
  } else if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    base = join(local, "mimocode");
  } else {
    base = join(homedir(), ".config", "mimocode");
  }
  return {
    configFile: join(base, "mimocode.jsonc"),
    metadataFile: join(base, "mimocode-ui.json"),
    backupDir: join(base, "backups"),
  };
}
```

- [ ] **Step 5: 实现 `lib/config-store.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseJsonc, stringifyJson } from "./jsonc";

export function readConfig(configFile: string): unknown {
  if (!existsSync(configFile)) return null;
  const text = readFileSync(configFile, "utf8");
  try {
    return parseJsonc(text);
  } catch (e) {
    throw new Error(`解析 ${configFile} 失败: ${(e as Error).message}`);
  }
}

export function writeConfig(configFile: string, data: unknown): void {
  const dir = dirname(configFile);
  mkdirSync(dir, { recursive: true });

  // 备份:第二次写入起,保留最近 10 份
  if (existsSync(configFile)) {
    const backupDir = join(dir, "backups");
    mkdirSync(backupDir, { recursive: true });
    const base = `${configFile.split(/[\\/]/).pop()}.`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(configFile, join(backupDir, `${base}${stamp}`));
    const backups = readdirSync(backupDir).filter((n) => n.startsWith(base)).sort();
    while (backups.length > 10) {
      rmSync(join(backupDir, backups.shift()!));
    }
  }

  // 原子写入:临时文件 + rename
  const tmp = join(dir, `.${configFile.split(/[\\/]/).pop()}.tmp`);
  writeFileSync(tmp, stringifyJson(data), "utf8");
  renameSync(tmp, configFile);
}

import { copyFileSync, rmSync } from "node:fs";
```

- [ ] **Step 6: 运行测试确认通过**

Run: `bun test test/config-path.test.ts test/config-store.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/config-path.ts lib/config-store.ts test/config-path.test.ts test/config-store.test.ts
git commit -m "feat: config path resolution and atomic store with backups"
```

---

### Task 3: 供应商操作(CRUD / 切换 / 复制)+ 元数据

**Covers:** S2-2, S2-3

**Files:**
- Create: `lib/provider-ops.ts`
- Create: `lib/metadata.ts`
- Test: `test/provider-ops.test.ts`

**Interfaces:**
- Consumes: `resolveConfigPaths`, `readConfig`, `writeConfig`(Task 2)
- Produces:
  - `interface ProviderInput { id: string; name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string }>; note?: string; link?: string }`
  - `interface ProviderConfig { name?: string; npm?: string; api?: string; options?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }; models?: Record<string, { name?: string }> }`
  - `interface ConfigData { model?: string; provider?: Record<string, ProviderConfig>; [k: string]: unknown }`
  - `interface Metadata { order?: string[]; notes?: Record<string, string>; links?: Record<string, string> }`
  - `readMetadata(metadataFile: string): Metadata`(不存在返回 `{}`)
  - `writeMetadata(metadataFile: string, meta: Metadata): void`(原子写入,不备份)
  - `buildProvider(input: ProviderInput): ProviderConfig`
  - `listProviders(config: ConfigData): { id: string; active: boolean; config: ProviderConfig }[]`
  - `addProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData`(id 冲突抛 `Error`)
  - `updateProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData`(不存在抛 `Error`)
  - `removeProvider(config: ConfigData, id: string): ConfigData`(激活中抛 `Error`)
  - `activateProvider(config: ConfigData, id: string, modelId: string): ConfigData`(不存在抛 `Error`)
  - `duplicateProvider(config: ConfigData, id: string): { config: ConfigData; newId: string }`

- [ ] **Step 1: 写失败测试 `test/provider-ops.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import {
  addProvider, activateProvider, buildProvider, duplicateProvider,
  listProviders, removeProvider, updateProvider,
} from "../lib/provider-ops";

const base = (): any => ({
  model: "a/m1",
  provider: {
    a: { name: "A", npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://a.com", apiKey: "k1" }, models: { m1: { name: "M1" } } },
  },
});

describe("buildProvider", () => {
  test("生成完整 provider 配置", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", headers: { "HTTP-Referer": "r" }, models: { m: { name: "M" } } });
    expect(p).toEqual({
      name: "X",
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "https://x.com", apiKey: "k", headers: { "HTTP-Referer": "r" } },
      models: { m: { name: "M" } },
    });
  });
});

describe("listProviders", () => {
  test("返回激活标记", () => {
    const list = listProviders(base());
    expect(list.find((x) => x.id === "a")!.active).toBe(true);
  });
});

describe("addProvider", () => {
  test("新增成功", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "https://b.com", apiKey: "k2" });
    expect(c.provider!.b.options!.baseURL).toBe("https://b.com");
    expect(c.model).toBe("a/m1"); // 不改变当前激活
  });
  test("id 冲突抛错", () => {
    expect(() => addProvider(base(), "a", { name: "dup", baseURL: "x", apiKey: "k" })).toThrow(/已存在/);
  });
});

describe("updateProvider", () => {
  test("更新成功", () => {
    const c = updateProvider(base(), "a", { name: "A2", baseURL: "https://a2.com", apiKey: "k2" });
    expect(c.provider!.a.name).toBe("A2");
    expect(c.provider!.a.options!.baseURL).toBe("https://a2.com");
  });
  test("不存在抛错", () => {
    expect(() => updateProvider(base(), "zzz", { name: "x", baseURL: "x", apiKey: "k" })).toThrow(/不存在/);
  });
});

describe("removeProvider", () => {
  test("删除非激活成功", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k" });
    const r = removeProvider(c, "b");
    expect(r.provider!.b).toBeUndefined();
  });
  test("删除激活中抛错", () => {
    expect(() => removeProvider(base(), "a")).toThrow(/启用/);
  });
});

describe("activateProvider", () => {
  test("切换 model 指针", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k", models: { m2: {} } });
    const r = activateProvider(c, "b", "m2");
    expect(r.model).toBe("b/m2");
  });
});

describe("duplicateProvider", () => {
  test("复制并加 -copy 后缀", () => {
    const { config, newId } = duplicateProvider(base(), "a");
    expect(newId).toBe("a-copy");
    expect(config.provider!["a-copy"]).toEqual(config.provider!.a);
    expect(config.model).toBe("a/m1"); // 激活不变
  });
  test("重复复制递增后缀", () => {
    let { config, newId } = duplicateProvider(base(), "a");
    ({ config, newId } = duplicateProvider(config, "a"));
    expect(newId).toBe("a-copy-2");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test test/provider-ops.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 `lib/metadata.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseJsonc, stringifyJson } from "./jsonc";

export interface Metadata {
  order?: string[];
  notes?: Record<string, string>;
  links?: Record<string, string>;
}

export function readMetadata(metadataFile: string): Metadata {
  if (!existsSync(metadataFile)) return {};
  try {
    return (parseJsonc(readFileSync(metadataFile, "utf8")) ?? {}) as Metadata;
  } catch {
    return {};
  }
}

export function writeMetadata(metadataFile: string, meta: Metadata): void {
  mkdirSync(dirname(metadataFile), { recursive: true });
  const tmp = `${metadataFile}.tmp`;
  writeFileSync(tmp, stringifyJson(meta), "utf8");
  renameSync(tmp, metadataFile);
}
```

- [ ] **Step 4: 实现 `lib/provider-ops.ts`**

```ts
const PROVIDER_ID_RE = /^[a-z0-9-]+$/;

export interface ProviderInput {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  models?: Record<string, { name?: string }>;
}

export interface ProviderConfig {
  name?: string;
  npm?: string;
  api?: string;
  options?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> };
  models?: Record<string, { name?: string }>;
}

export interface ConfigData {
  model?: string;
  provider?: Record<string, ProviderConfig>;
  [k: string]: unknown;
}

export function assertValidId(id: string): void {
  if (!PROVIDER_ID_RE.test(id)) {
    throw new Error("供应商标识只能包含小写字母、数字和连字符");
  }
}

export function buildProvider(input: Omit<ProviderInput, "id">): ProviderConfig {
  const p: ProviderConfig = {
    name: input.name,
    npm: "@ai-sdk/openai-compatible",
    options: { baseURL: input.baseURL, apiKey: input.apiKey },
  };
  if (input.headers && Object.keys(input.headers).length > 0) {
    p.options!.headers = input.headers;
  }
  if (input.models && Object.keys(input.models).length > 0) {
    p.models = input.models;
  }
  return p;
}

export function listProviders(config: ConfigData): { id: string; active: boolean; config: ProviderConfig }[] {
  const providers = config.provider ?? {};
  const active = config.model ?? "";
  return Object.entries(providers).map(([id, cfg]) => ({
    id,
    active: active.startsWith(`${id}/`),
    config: cfg ?? {},
  }));
}

export function addProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData {
  assertValidId(id);
  const providers = config.provider ?? {};
  if (providers[id]) throw new Error(`供应商 ${id} 已存在`);
  return {
    ...config,
    provider: { ...providers, [id]: buildProvider(input) },
  };
}

export function updateProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) throw new Error(`供应商 ${id} 不存在`);
  return {
    ...config,
    provider: { ...providers, [id]: buildProvider(input) },
  };
}

export function removeProvider(config: ConfigData, id: string): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) return config;
  const active = config.model ?? "";
  if (active.startsWith(`${id}/`)) {
    throw new Error(`供应商 ${id} 正在启用中,请先切换到其他供应商`);
  }
  const next = { ...providers };
  delete next[id];
  return { ...config, provider: next };
}

export function activateProvider(config: ConfigData, id: string, modelId: string): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) throw new Error(`供应商 ${id} 不存在`);
  return { ...config, model: `${id}/${modelId}` };
}

export function duplicateProvider(config: ConfigData, id: string): { config: ConfigData; newId: string } {
  const providers = config.provider ?? {};
  const src = providers[id];
  if (!src) throw new Error(`供应商 ${id} 不存在`);
  let newId = `${id}-copy`;
  let n = 2;
  while (providers[newId]) {
    newId = `${id}-copy-${n}`;
    n++;
  }
  return {
    config: { ...config, provider: { ...providers, [newId]: JSON.parse(JSON.stringify(src)) } },
    newId,
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test test/provider-ops.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/metadata.ts lib/provider-ops.ts test/provider-ops.test.ts
git commit -m "feat: provider CRUD, activate, duplicate and metadata"
```

---

### Task 4: Bun HTTP 服务 + REST API

**Covers:** S2-1, S2-4

**Files:**
- Create: `server.ts`

**Interfaces:**
- Consumes: `resolveConfigPaths`, `readConfig`, `writeConfig`(Task 2)、`readMetadata`, `writeMetadata`, `listProviders`, `addProvider`, `updateProvider`, `removeProvider`, `activateProvider`, `duplicateProvider`(Task 3)
- Produces: HTTP 服务,端点见设计 S2-4;响应信封 `{ ok, data | error }`;`POST /api/fetch-models` 在 Task 5 接入(本任务先返回 501)

- [ ] **Step 1: 实现 `server.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import {
  activateProvider, addProvider, duplicateProvider,
  listProviders, removeProvider, updateProvider,
} from "./lib/provider-ops";
import { readMetadata, writeMetadata } from "./lib/metadata";
import { readConfig, writeConfig } from "./lib/config-store";
import { resolveConfigPaths } from "./lib/config-path";

const paths = resolveConfigPaths();
const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC_DIR = join(import.meta.dir, "public");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function ok(data: unknown): Response {
  return json({ ok: true, data });
}

function fail(status: number, error: string): Response {
  return json({ ok: false, error }, status);
}

function loadConfig(): unknown {
  const cfg = readConfig(paths.configFile);
  if (cfg === null) {
    throw Object.assign(new Error("未找到 mimocode.jsonc"), { code: "NO_CONFIG" });
  }
  return cfg as Record<string, unknown>;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/config") {
      try {
        const cfg = loadConfig();
        const meta = readMetadata(paths.metadataFile);
        const providers = listProviders(cfg as never);
        return ok({
          providers,
          activeModel: cfg.model ?? "",
          configFile: paths.configFile,
          hasConfig: existsSync(paths.configFile),
          metadata: meta,
        });
      } catch (e) {
        const err = e as Error & { code?: string };
        return fail(err.code === "NO_CONFIG" ? 404 : 500, err.message);
      }
    }

    if (method === "POST" && pathname === "/api/providers") {
      try {
        const body = await req.json() as { id: string; name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string }>; note?: string; link?: string };
        if (!body.id || !body.name || !body.baseURL || !body.apiKey) {
          return fail(400, "标识、名称、Base URL、API Key 均为必填");
        }
        const cfg = loadConfig() as never;
        const next = addProvider(cfg, body.id, body);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        if (body.note || body.link) {
          meta.notes = { ...meta.notes, [body.id]: body.note ?? "" };
          meta.links = { ...meta.links, [body.id]: body.link ?? "" };
          writeMetadata(paths.metadataFile, meta);
        }
        return ok({ id: body.id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    const providerMatch = pathname.match(/^\/api\/providers\/([^/]+)$/);
    const id = providerMatch?.[1];

    if (method === "PUT" && providerMatch) {
      try {
        const body = await req.json() as { name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string }>; note?: string; link?: string };
        const cfg = loadConfig() as never;
        const next = updateProvider(cfg, id, body);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        if (body.note !== undefined) meta.notes = { ...meta.notes, [id]: body.note };
        if (body.link !== undefined) meta.links = { ...meta.links, [id]: body.link };
        writeMetadata(paths.metadataFile, meta);
        return ok({ id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "DELETE" && providerMatch) {
      try {
        const cfg = loadConfig() as never;
        const next = removeProvider(cfg, id);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        delete meta.notes?.[id];
        delete meta.links?.[id];
        if (meta.order) meta.order = meta.order.filter((x) => x !== id);
        writeMetadata(paths.metadataFile, meta);
        return ok({ id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "POST" && pathname === `/api/providers/${id}/activate`) {
      try {
        const body = await req.json() as { modelId: string };
        const cfg = loadConfig() as never;
        const next = activateProvider(cfg, id, body.modelId);
        writeConfig(paths.configFile, next);
        return ok({ model: next.model });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "POST" && pathname === `/api/providers/${id}/duplicate`) {
      try {
        const cfg = loadConfig() as never;
        const { config: next, newId } = duplicateProvider(cfg, id);
        writeConfig(paths.configFile, next);
        return ok({ id: newId });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "PUT" && pathname === "/api/order") {
      try {
        const body = await req.json() as { ids: string[] };
        const meta = readMetadata(paths.metadataFile);
        meta.order = body.ids;
        writeMetadata(paths.metadataFile, meta);
        return ok({ order: body.ids });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (pathname === "/api/fetch-models") {
      return fail(501, "尚未实现");
    }

    // 静态资源
    let filePath = normalize(join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) return fail(403, "forbidden");
    if (!existsSync(filePath) || !filePath.endsWith(".html")) return fail(404, "not found");
    return new Response(readFileSync(filePath), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`mimocode 供应商管理工具: http://127.0.0.1:${server.port}`);
```

- [ ] **Step 2: 创建占位 UI 并验证服务启动**

`public/index.html`(占位,Task 6 替换):
```html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>mimocode 供应商管理</title></head>
<body><h1>mimocode 供应商管理</h1><p>占位页,Task 6 实现 UI</p></body>
</html>
```

Run: `bun server.ts`(后台),然后:
```bash
curl -s http://127.0.0.1:4173/api/config
```
Expected: `{"ok":false,"error":"未找到 mimocode.jsonc"}`(当前机器无该配置,属预期 404 路径)

- [ ] **Step 3: 冒烟验证 API 循环**(用临时 MIMOCODE_HOME)

```bash
$env:MIMOCODE_HOME = "$env:TEMP\mimo-smoke"; bun server.ts
```
另开终端:
```bash
curl -s -X POST http://127.0.0.1:4173/api/providers -H "Content-Type: application/json" -d '{"id":"demo","name":"Demo","baseURL":"https://demo.com","apiKey":"k"}'
curl -s http://127.0.0.1:4173/api/config
curl -s -X POST http://127.0.0.1:4173/api/providers/demo/activate -H "Content-Type: application/json" -d '{"modelId":"demo-model"}'
```
Expected: 新增 ok → config 中 provider.demo 存在 → activate 后 model = "demo/demo-model"。验证后删除临时目录。

- [ ] **Step 4: Commit**

```bash
git add server.ts public/index.html
git commit -m "feat: bun http server with provider REST API"
```

---

### Task 5: fetch-models 代理

**Covers:** S2-3-6

**Files:**
- Modify: `server.ts`(替换 501 分支)

**Interfaces:**
- Consumes: 现有路由
- Produces: `POST /api/fetch-models`,请求体 `{ baseURL, apiKey }`,响应 `{ models: string[] }`(模型 id 列表,去重排序);错误分类 401/404/超时

- [ ] **Step 1: 实现 fetch-models 分支**

在 `server.ts` 中,把 501 占位替换为:

```ts
    if (pathname === "/api/fetch-models" && method === "POST") {
      try {
        const body = await req.json() as { baseURL: string; apiKey: string };
        if (!body.baseURL || !body.apiKey) return fail(400, "baseURL 和 apiKey 必填");
        const endpoint = `${body.baseURL.replace(/\/+$/, "")}/models`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${body.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 401 || res.status === 403) return fail(401, "认证失败:请检查 API Key");
        if (res.status === 404 || res.status === 405) return fail(404, "该供应商未提供 /models 端点");
        if (!res.ok) return fail(502, `端点返回 ${res.status}`);
        const data = await res.json() as { data?: { id: string }[] };
        const models = (data.data ?? []).map((m) => m.id).filter(Boolean).sort();
        if (models.length === 0) return fail(404, "端点未返回模型列表");
        return ok({ models });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("timeout") || msg.includes("timed out")) return fail(408, "请求超时,请检查网络");
        return fail(502, `请求失败: ${msg}`);
      }
    }
```

- [ ] **Step 2: 验证路由可用**(临时 MIMOCODE_HOME 下启动,用无效 key 测 401 分类)

```bash
curl -s -X POST http://127.0.0.1:4173/api/fetch-models -H "Content-Type: application/json" -d '{"baseURL":"https://api.example.com/v1","apiKey":"bad"}'
```
Expected: `{"ok":false,"error":"认证失败..."}` 或网络类错误(端点不可达时走 502/408 分支)

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: fetch models proxy endpoint"
```

---

### Task 6: 前端 UI(卡片列表)

**Covers:** S2-1, S2-3

**Files:**
- Create: `public/index.html`(替换占位)
- Create: `public/app.js`
- Create: `public/style.css`

**Interfaces:**
- Consumes: Task 4/5 的 HTTP API
- Produces: 可交互 UI:卡片列表(名称/激活徽标/备注/操作按钮)、添加/编辑表单(标识/名称/key/baseURL/模型列表/备注/链接/获取模型)、复制/删除/切换/拖拽排序

- [ ] **Step 1: 实现 `public/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mimocode 供应商管理</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1>mimocode 供应商管理</h1>
    <span id="config-path" class="path"></span>
    <button id="btn-add" class="primary">+ 添加供应商</button>
  </header>
  <main>
    <div id="list" class="cards"></div>
    <p id="empty" class="empty hidden">暂无供应商,点击右上角添加。</p>
  </main>

  <dialog id="form-dialog">
    <form id="provider-form" method="dialog">
      <h2 id="form-title">添加供应商</h2>
      <input type="hidden" id="f-original-id">
      <label>供应商标识 <input id="f-id" required pattern="[a-z0-9-]+" placeholder="my-provider"></label>
      <label>名称 <input id="f-name" required placeholder="例如:某中转站"></label>
      <label>API Key <input id="f-apiKey" required placeholder="sk-..."></label>
      <label>Base URL <input id="f-baseURL" required placeholder="https://api.example.com/v1"></label>
      <label>备注 <input id="f-note" placeholder="可选"></label>
      <label>官网链接 <input id="f-link" type="url" placeholder="可选 https://..."></label>
      <fieldset>
        <legend>模型配置</legend>
        <div id="models"></div>
        <div class="row">
          <input id="f-model-new" placeholder="模型 id,如 deepseek-v4-flash">
          <button type="button" id="btn-add-model">添加模型</button>
          <button type="button" id="btn-fetch-models">获取模型</button>
        </div>
      </fieldset>
      <div class="actions">
        <button type="button" id="btn-cancel">取消</button>
        <button type="submit" class="primary">保存</button>
      </div>
    </form>
  </dialog>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 实现 `public/style.css`**

```css
:root { --bg: #0f1115; --card: #171a21; --border: #2a2e38; --text: #e6e8ee; --muted: #8b90a0; --accent: #3b82f6; --danger: #ef4444; --ok: #22c55e; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); }
header h1 { font-size: 18px; margin: 0; flex: 0 0 auto; }
.path { color: var(--muted); font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
main { padding: 24px; max-width: 960px; margin: 0 auto; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; cursor: grab; }
.card.active { border-color: var(--accent); }
.card .top { display: flex; align-items: center; gap: 8px; }
.card .name { font-weight: 600; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent); color: #fff; }
.badge.off { background: var(--border); color: var(--muted); }
.card .meta { color: var(--muted); font-size: 12px; margin: 6px 0; word-break: break-all; }
.card .ops { display: flex; gap: 8px; margin-top: 10px; }
button { background: var(--border); color: var(--text); border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
button:hover { filter: brightness(1.2); }
button.primary { background: var(--accent); color: #fff; }
button.danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.empty { color: var(--muted); text-align: center; margin-top: 60px; }
.hidden { display: none; }
dialog { background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 480px; max-width: 90vw; }
dialog form { display: flex; flex-direction: column; gap: 10px; }
dialog label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
dialog input { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 8px; }
fieldset { border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 8px; }
.row input { flex: 1; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.model-row { display: flex; gap: 8px; align-items: center; }
.model-row input { flex: 1; }
.model-row button { padding: 2px 8px; }
```

- [ ] **Step 3: 实现 `public/app.js`**

```js
const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const emptyEl = $("#empty");

let state = { providers: [], activeModel: "", metadata: { order: [], notes: {}, links: {} } };

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "请求失败");
  return body.data;
}

async function refresh() {
  const data = await api("/api/config");
  state = data;
  $("#config-path").textContent = data.configFile;
  render();
}

function orderedIds() {
  const ids = state.providers.map((p) => p.id);
  const order = state.metadata.order ?? [];
  const ordered = order.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

function render() {
  const ids = orderedIds();
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", ids.length > 0);
  ids.forEach((id, idx) => {
    const p = state.providers.find((x) => x.id === id);
    if (!p) return;
    const card = document.createElement("div");
    card.className = "card" + (p.active ? " active" : "");
    card.draggable = true;
    card.dataset.id = id;
    card.innerHTML = `
      <div class="top">
        <span class="drag">≡</span>
        <span class="name">${escapeHtml(p.config.name ?? id)}</span>
        <span class="badge ${p.active ? "" : "off"}">${p.active ? "启用中" : "未启用"}</span>
      </div>
      <div class="meta">${escapeHtml(p.config.options?.baseURL ?? "")}</div>
      ${state.metadata.notes?.[id] ? `<div class="meta">📝 ${escapeHtml(state.metadata.notes[id])}</div>` : ""}
      <div class="meta">${(Object.keys(p.config.models ?? {}).length)} 个模型</div>
      <div class="ops">
        ${p.active ? "" : `<button data-act="activate" data-id="${id}">启用</button>`}
        <button data-act="edit" data-id="${id}">编辑</button>
        <button data-act="dup" data-id="${id}">复制</button>
        <button data-act="del" data-id="${id}" class="danger">删除</button>
      </div>`;
    card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); });
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain");
      const ids = orderedIds();
      const fromIdx = ids.indexOf(from);
      const toIdx = ids.indexOf(id);
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, from);
      api("/api/order", { method: "PUT", body: JSON.stringify({ ids }) }).then(refresh);
    });
    listEl.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- 表单 ----
const dialog = $("#form-dialog");
const modelsEl = $("#models");
let editingId = null;
let models = {};

function openForm(provider) {
  editingId = provider?.id ?? null;
  models = provider?.config?.models ? JSON.parse(JSON.stringify(provider.config.models)) : {};
  $("#form-title").textContent = editingId ? "编辑供应商" : "添加供应商";
  $("#f-original-id").value = provider?.id ?? "";
  $("#f-id").value = provider?.id ?? "";
  $("#f-id").disabled = !!provider;
  $("#f-name").value = provider?.config?.name ?? "";
  $("#f-apiKey").value = provider?.config?.options?.apiKey ?? "";
  $("#f-baseURL").value = provider?.config?.options?.baseURL ?? "";
  $("#f-note").value = state.metadata.notes?.[provider?.id] ?? "";
  $("#f-link").value = state.metadata.links?.[provider?.id] ?? "";
  renderModels();
  dialog.showModal();
}

function renderModels() {
  modelsEl.innerHTML = "";
  Object.entries(models).forEach(([id, m]) => {
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `<input value="${escapeHtml(id)}" disabled><span class="meta">${escapeHtml(m?.name ?? "")}</span>`;
    const del = document.createElement("button");
    del.textContent = "×";
    del.onclick = () => { delete models[id]; renderModels(); };
    row.appendChild(del);
    modelsEl.appendChild(row);
  });
}

$("#btn-add").onclick = () => openForm(null);
$("#btn-cancel").onclick = () => dialog.close();

$("#btn-add-model").onclick = () => {
  const input = $("#f-model-new");
  const id = input.value.trim();
  if (id && !models[id]) { models[id] = { name: id }; renderModels(); }
  input.value = "";
};

$("#btn-fetch-models").onclick = async () => {
  const btn = $("#btn-fetch-models");
  btn.disabled = true; btn.textContent = "获取中...";
  try {
    const data = await api("/api/fetch-models", {
      method: "POST",
      body: JSON.stringify({ baseURL: $("#f-baseURL").value, apiKey: $("#f-apiKey").value }),
    });
    data.models.forEach((m) => { models[m] = models[m] ?? { name: m }; });
    renderModels();
  } catch (e) {
    alert("获取模型失败: " + e.message);
  }
  btn.disabled = false; btn.textContent = "获取模型";
};

$("#provider-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: $("#f-name").value,
    baseURL: $("#f-baseURL").value,
    apiKey: $("#f-apiKey").value,
    note: $("#f-note").value,
    link: $("#f-link").value,
    models,
  };
  try {
    if (editingId) {
      await api(`/api/providers/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/api/providers", { method: "POST", body: JSON.stringify({ id: $("#f-id").value, ...payload }) });
    }
    dialog.close();
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

// ---- 列表操作 ----
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  const p = state.providers.find((x) => x.id === id);
  try {
    if (act === "activate") {
      const models = Object.keys(p.config.models ?? {});
      const modelId = models.length > 0 ? models[0] : `${id}-default`;
      await api(`/api/providers/${id}/activate`, { method: "POST", body: JSON.stringify({ modelId }) });
    } else if (act === "edit") {
      openForm(p);
      return;
    } else if (act === "dup") {
      await api(`/api/providers/${id}/duplicate`, { method: "POST" });
    } else if (act === "del") {
      if (!confirm(`删除供应商 ${id}?`)) return;
      await api(`/api/providers/${id}`, { method: "DELETE" });
    }
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

refresh().catch((e) => {
  if (e.message.includes("未找到")) {
    listEl.innerHTML = `<p class="empty">未找到 mimocode.jsonc,请先运行 mimocode 生成配置,或设置 MIMOCODE_HOME 环境变量。</p>`;
  } else {
    alert(e.message);
  }
});
```

- [ ] **Step 4: 手工验证 UI**(临时 MIMOCODE_HOME 下启动)

```bash
$env:MIMOCODE_HOME = "$env:TEMP\mimo-ui"; bun server.ts
```
浏览器打开 http://127.0.0.1:4173,验证:添加供应商 → 显示卡片 → 启用 → 编辑 → 复制 → 删除 → 拖拽排序。检查 `$env:TEMP\mimo-ui\mimocode.jsonc` 内容正确。

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: provider card UI with CRUD, activate, duplicate, reorder"
```

---

### Task 7: start.bat 一键启动 + 最终验证

**Covers:** S2-1, S2-7

**Files:**
- Create: `start.bat`
- Create: `README.md`

**Interfaces:**
- Consumes: Task 4 的 `bun server.ts`

- [ ] **Step 1: 实现 `start.bat`**

```bat
@echo off
cd /d %~dp0
where bun >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 bun,请先安装: https://bun.sh/docs/installation
  pause
  exit /b 1
)
echo 启动 mimocode 供应商管理工具...
echo 关闭此窗口即退出服务。
start "" http://127.0.0.1:4173
bun server.ts
```

- [ ] **Step 2: 实现 `README.md`**

```markdown
# mimocode 供应商管理工具

带 UI 的 mimocode 第三方供应商管理工具。供应商数据直接读写 mimocode.jsonc,
备注/链接/排序存并行元数据文件 mimocode-ui.json。

## 使用

1. 双击 `start.bat`(或运行 `bun server.ts`)
2. 浏览器自动打开 http://127.0.0.1:4173
3. 添加/编辑/复制/删除供应商,点「启用」切换激活;切换后重启 mimo 生效

## 配置路径

- `MIMOCODE_HOME` 环境变量优先
- Windows: `%LOCALAPPDATA%\mimocode\mimocode.jsonc`
- macOS/Linux: `~/.config/mimocode/mimocode.jsonc`

写回前自动备份到 `backups/`(保留最近 10 份)。写回会移除注释并格式化为标准 JSON。

## 测试

```bash
bun test
```
```

- [ ] **Step 3: 最终验证**

```bash
bun test
```
Expected: 全部测试 PASS(jsonc / config-path / config-store / provider-ops)

双击 `start.bat`,浏览器打开页面,走一遍:添加 → 启用 → 编辑 → 复制 → 删除 → 排序 → 获取模型。

- [ ] **Step 4: Commit**

```bash
git add start.bat README.md
git commit -m "docs: one-click start script and readme"
```

---

## Self-Review

**Spec coverage 检查:**
- S2-1(形态/技术栈)→ Task 1, 4, 6, 7 ✅
- S2-2(数据模型/写回策略/备份)→ Task 1, 2, 3 ✅
- S2-3(功能清单)→ Task 3, 6 ✅(自动获取模型 → Task 5)
- S2-4(服务端 API)→ Task 4, 5 ✅
- S2-5(路径解析)→ Task 2 ✅
- S2-7(测试)→ Task 1, 2, 3, 7 ✅
- S2-6(错误处理)→ 分散于 Task 2(解析失败拒绝写回)、Task 3(删除激活/重复 id)、Task 5(401/404/超时分类)✅

**Type consistency:** `ProviderInput`/`ProviderConfig`/`ConfigData`/`Metadata` 在 Task 3 定义,Task 4 server.ts 使用一致;`listProviders` 返回 `{ id, active, config }` 与前端 `state.providers` 字段一致;`readConfig` 返回 `unknown` 但 server.ts 用 `as never`/`as Record` 收窄 ✅

**已知取舍(计划内说明):**
- `listProviders` 的 active 判断用 `model.startsWith(id + "/")`——mimocode 只按第一个 `/` 切分 provider/model,该判断与官方行为一致。
- 激活时若供应商无模型,前端自动用 `{id}-default` 作为 modelId(需用户知晓该模型名需在 mimo 中可用;也可在 UI 后续版本改为强制先添加模型)。
