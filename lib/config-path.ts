import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ConfigPaths {
  configFile: string;
  metadataFile: string;
  backupDir: string;
  authFile: string;
}

// mimocode 的配置文件候选顺序(与源码 config.ts 的 globalConfigFile 一致)
const CONFIG_FILE_CANDIDATES = ["mimocode.jsonc", "mimocode.json", "config.json"];

function pickConfigFile(dir: string): string {
  for (const name of CONFIG_FILE_CANDIDATES) {
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }
  return join(dir, CONFIG_FILE_CANDIDATES[0]);
}

// 与 mimocode 源码 resolveMimocodeHome 一致:
// - MIMOCODE_HOME 设置时,config 目录为 $MIMOCODE_HOME/config
// - 否则用 XDG 默认: ~/.config/mimocode(Windows 也如此,mimocode 不遵循 %LOCALAPPDATA%)
export function resolveConfigPaths(env: NodeJS.ProcessEnv = process.env): ConfigPaths {
  let configDir: string;
  let dataDir: string;
  const mimoHome = env.MIMOCODE_HOME;
  if (mimoHome) {
    configDir = join(mimoHome, "config");
    dataDir = join(mimoHome, "data");
  } else {
    const home = env.HOME || env.USERPROFILE || homedir();
    configDir = join(home, ".config", "mimocode");
    dataDir = join(home, ".local", "share", "mimocode");
  }
  return {
    configFile: pickConfigFile(configDir),
    metadataFile: join(configDir, "mimocode-ui.json"),
    backupDir: join(configDir, "backups"),
    authFile: join(dataDir, "auth.json"),
  };
}
