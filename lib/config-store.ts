import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
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
