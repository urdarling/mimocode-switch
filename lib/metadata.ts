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
