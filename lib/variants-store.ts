import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseJsonc, stringifyJson } from "./jsonc";

// 官方变体库读写:条目由 UI/手动维护,保留文件内 `//` 说明键,原子写入(tmp+rename)
export function readOfficialVariants(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return (parseJsonc(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// 增量合并:patch 中值为 null 的条目删除,其余条目写入/更新;`//` 说明键恒保留。
// 前端只提交目标条目而非整份文件,避免内存态与文件不一致时覆盖丢失其他条目。
export function mergeOfficialEntries(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...existing };
  for (const [id, entry] of Object.entries(patch)) {
    if (id === "//") continue; // 说明键,不可覆盖
    if (entry === null) {
      delete next[id];
    } else {
      next[id] = entry;
    }
  }
  return next;
}

export function writeOfficialVariants(file: string, entries: Record<string, unknown>): void {
  const existing = readOfficialVariants(file);
  const comment = typeof existing["//"] === "string" ? existing["//"] : "";
  const { "//": _dropped, ...rest } = entries;
  const next: Record<string, unknown> = comment ? { "//": comment, ...rest } : rest;
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, stringifyJson(next), "utf8");
  renameSync(tmp, file);
}
