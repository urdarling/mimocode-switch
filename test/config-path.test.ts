import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolveConfigPaths } from "../lib/config-path";
import { makeTestDir, removeTestDir } from "./helpers";

describe("resolveConfigPaths", () => {
  const oldHome = process.env.MIMOCODE_HOME;
  const oldUser = process.env.USERPROFILE;

  test("MIMOCODE_HOME 模式下 config 是 $HOME/config 子目录", () => {
    const p = resolveConfigPaths({ MIMOCODE_HOME: "D:/mimo" });
    expect(p.configFile).toBe(join("D:/mimo", "config", "mimocode.jsonc"));
    expect(p.metadataFile).toBe(join("D:/mimo", "config", "mimocode-ui.json"));
    expect(p.backupDir).toBe(join("D:/mimo", "config", "backups"));
  });

  test("无 MIMOCODE_HOME 时用 ~/.config/mimocode(Windows 也如此)", () => {
    const p = resolveConfigPaths({ USERPROFILE: "C:/Users/t", HOME: undefined });
    expect(p.configFile).toBe(join("C:/Users/t", ".config", "mimocode", "mimocode.jsonc"));
  });

  test("候选顺序:已存在 mimocode.json 时优先选择它", () => {
    const root = makeTestDir("mimo-pick-");
    const cfgDir = join(root, "config");
    mkdirSync(cfgDir);
    writeFileSync(join(cfgDir, "mimocode.json"), "{}");
    try {
      const p = resolveConfigPaths({ MIMOCODE_HOME: root });
      expect(p.configFile).toBe(join(cfgDir, "mimocode.json"));
    } finally {
      removeTestDir(root);
    }
  });

  test("候选顺序:mimocode.jsonc 优先于 mimocode.json", () => {
    const root = makeTestDir("mimo-pick-");
    const cfgDir = join(root, "config");
    mkdirSync(cfgDir);
    writeFileSync(join(cfgDir, "mimocode.jsonc"), "{}");
    writeFileSync(join(cfgDir, "mimocode.json"), "{}");
    try {
      const p = resolveConfigPaths({ MIMOCODE_HOME: root });
      expect(p.configFile).toBe(join(cfgDir, "mimocode.jsonc"));
    } finally {
      removeTestDir(root);
    }
  });

  test("候选顺序:config.json 兜底", () => {
    const root = makeTestDir("mimo-pick-");
    const cfgDir = join(root, "config");
    mkdirSync(cfgDir);
    writeFileSync(join(cfgDir, "config.json"), "{}");
    try {
      const p = resolveConfigPaths({ MIMOCODE_HOME: root });
      expect(p.configFile).toBe(join(cfgDir, "config.json"));
    } finally {
      removeTestDir(root);
    }
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.MIMOCODE_HOME;
    else process.env.MIMOCODE_HOME = oldHome;
    if (oldUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUser;
  });
});
