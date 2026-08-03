import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readConfig, writeConfig } from "../lib/config-store";
import { makeTestDir, removeTestDir } from "./helpers";

let dir: string;

beforeEach(() => { dir = makeTestDir("mimo-store-"); });
afterEach(() => { removeTestDir(dir); });

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
    const tmpFiles = readdirSync(dir).filter((n) => n.includes(".tmp"));
    expect(tmpFiles).toEqual([]);
    expect(existsSync(f)).toBe(true);
  });
  test("第二次写入前生成备份", () => {
    const f = join(dir, "c.jsonc");
    writeConfig(f, { v: 1 });
    writeConfig(f, { v: 2 });
    const backups = join(dir, "backups");
    expect(existsSync(backups)).toBe(true);
    const names = readdirSync(backups).filter((n) => n.startsWith("c.jsonc."));
    expect(names.length).toBeGreaterThan(0);
  });
  test("备份只保留最近 10 份", () => {
    const f = join(dir, "c.jsonc");
    for (let i = 0; i < 15; i++) writeConfig(f, { v: i });
    const backups = join(dir, "backups");
    const names = readdirSync(backups).filter((n) => n.startsWith("c.jsonc."));
    expect(names.length).toBe(10);
  });
});
