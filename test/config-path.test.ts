import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveConfigPaths } from "../lib/config-path";

describe("resolveConfigPaths", () => {
  const oldHome = process.env.MIMOCODE_HOME;
  const oldLocal = process.env.LOCALAPPDATA;

  test("MIMOCODE_HOME 优先", () => {
    process.env.MIMOCODE_HOME = "D:/mimo";
    const p = resolveConfigPaths();
    expect(p.configFile).toBe(join("D:/mimo", "mimocode.jsonc"));
    expect(p.metadataFile).toBe(join("D:/mimo", "mimocode-ui.json"));
    expect(p.backupDir).toBe(join("D:/mimo", "backups"));
  });
  test("Windows 默认路径", () => {
    delete process.env.MIMOCODE_HOME;
    process.env.LOCALAPPDATA = "C:/Users/t/AppData/Local";
    const p = resolveConfigPaths();
    expect(p.configFile).toBe(join("C:/Users/t/AppData/Local", "mimocode", "mimocode.jsonc"));
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.MIMOCODE_HOME;
    else process.env.MIMOCODE_HOME = oldHome;
    if (oldLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = oldLocal;
  });
});
