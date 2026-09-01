import { existsSync, readFileSync } from "node:fs";
import { writeConfig } from "./config-store";

export interface AuthEntry {
  type?: string;
  key?: string;
  metadata?: unknown;
}

export interface AuthProviderInfo {
  id: string;
  type: string;
  hasMetadata: boolean;
}

// 内置供应商认证(auth.json):文件不存在/解析失败返回空对象,与 variants-store 的 readOfficialVariants 一致
export function readAuthProviders(authFile: string): Record<string, AuthEntry> {
  if (!existsSync(authFile)) return {};
  try {
    return JSON.parse(readFileSync(authFile, "utf8")) as Record<string, AuthEntry>;
  } catch {
    return {};
  }
}

// 列表脱敏:不暴露 key/凭证,仅 id/type/hasMetadata
export function listAuthProviders(authFile: string): AuthProviderInfo[] {
  const data = readAuthProviders(authFile);
  return Object.entries(data).map(([id, entry]) => ({
    id,
    type: typeof entry?.type === "string" ? entry.type : "",
    hasMetadata: entry?.metadata !== undefined,
  }));
}

// 登出 = 删除 auth.json 中的条目;写入复用 writeConfig(备份到 backups/ + 原子写)
export function removeAuthProvider(authFile: string, id: string): void {
  const data = readAuthProviders(authFile);
  if (Object.keys(data).length === 0) {
    throw new Error(`未找到已认证的供应商 ${id}`);
  }
  if (!data[id]) throw new Error(`未登录供应商 ${id}`);
  delete data[id];
  writeConfig(authFile, data);
}
