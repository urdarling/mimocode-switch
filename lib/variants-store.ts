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
