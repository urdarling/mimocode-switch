import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listAuthProviders, readAuthProviders, removeAuthProvider } from "../lib/auth-store";
import { makeTestDir, removeTestDir, TEST_TMP_ROOT } from "./helpers";

const dirs: string[] = [];
function authFile(): string {
  const dir = makeTestDir("auth-");
  dirs.push(dir);
  return join(dir, "auth.json");
}
afterAll(() => { dirs.forEach(removeTestDir); });

describe("readAuthProviders", () => {
  test("文件不存在返回空对象", () => {
    expect(readAuthProviders(join(TEST_TMP_ROOT, "nope", "auth.json"))).toEqual({});
  });
  test("解析失败返回空对象", () => {
    const f = authFile();
    writeFileSync(f, "{ not json", "utf8");
    expect(readAuthProviders(f)).toEqual({});
  });
  test("正常读取认证条目", () => {
    const f = authFile();
    writeFileSync(f, JSON.stringify({
      xiaomi: { type: "api", key: "sk-x" },
      deepseek: { type: "api", key: "sk-d", metadata: { name: "DeepSeek" } },
    }), "utf8");
    const data = readAuthProviders(f);
    expect(data.xiaomi).toEqual({ type: "api", key: "sk-x" });
    expect(data.deepseek.metadata).toEqual({ name: "DeepSeek" });
  });
});

describe("listAuthProviders", () => {
  test("列出 id/type/hasMetadata 且不含 key(脱敏)", () => {
    const f = authFile();
    writeFileSync(f, JSON.stringify({
      xiaomi: { type: "api", key: "sk-secret-x" },
      deepseek: { type: "api", key: "sk-secret-d", metadata: { name: "D" } },
    }), "utf8");
    const list = listAuthProviders(f);
    expect(list).toEqual([
      { id: "xiaomi", type: "api", hasMetadata: false },
      { id: "deepseek", type: "api", hasMetadata: true },
    ]);
    expect(JSON.stringify(list)).not.toContain("sk-secret");
  });
  test("文件不存在返回空数组", () => {
    expect(listAuthProviders(join(TEST_TMP_ROOT, "nope", "auth.json"))).toEqual([]);
  });
});

describe("removeAuthProvider", () => {
  test("删除条目并保留其他条目", () => {
    const f = authFile();
    writeFileSync(f, JSON.stringify({
      xiaomi: { type: "api", key: "sk-x" },
      deepseek: { type: "api", key: "sk-d" },
    }), "utf8");
    removeAuthProvider(f, "xiaomi");
    const data = JSON.parse(readFileSync(f, "utf8"));
    expect(data.xiaomi).toBeUndefined();
    expect(data.deepseek).toEqual({ type: "api", key: "sk-d" });
  });
  test("删除前先备份到 backups/", () => {
    const f = authFile();
    writeFileSync(f, JSON.stringify({ xiaomi: { type: "api", key: "sk-x" } }), "utf8");
    removeAuthProvider(f, "xiaomi");
    const backupDir = join(dirname(f), "backups");
    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir).filter((n) => n.startsWith("auth.json."));
    expect(backups.length).toBeGreaterThan(0);
  });
  test("删除不存在的 id 抛错", () => {
    const f = authFile();
    writeFileSync(f, JSON.stringify({ xiaomi: { type: "api", key: "sk-x" } }), "utf8");
    expect(() => removeAuthProvider(f, "nope")).toThrow("未登录");
  });
  test("auth.json 不存在时抛错", () => {
    expect(() => removeAuthProvider(join(TEST_TMP_ROOT, "nope", "auth.json"), "x")).toThrow();
  });
});
