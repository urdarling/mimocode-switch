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
