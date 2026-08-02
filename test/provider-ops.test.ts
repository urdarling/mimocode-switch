import { describe, expect, test } from "bun:test";
import {
  addProvider, activateProvider, buildProvider, duplicateProvider,
  listProviders, removeProvider, updateProvider,
} from "../lib/provider-ops";

const base = (): any => ({
  model: "a/m1",
  provider: {
    a: { name: "A", npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://a.com", apiKey: "k1" }, models: { m1: { name: "M1" } } },
  },
});

describe("buildProvider", () => {
  test("生成完整 provider 配置", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", headers: { "HTTP-Referer": "r" }, models: { m: { name: "M" } } });
    expect(p).toEqual({
      name: "X",
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "https://x.com", apiKey: "k", headers: { "HTTP-Referer": "r" } },
      models: { m: { name: "M" } },
    });
  });
});

describe("listProviders", () => {
  test("返回激活标记", () => {
    const list = listProviders(base());
    expect(list.find((x) => x.id === "a")!.active).toBe(true);
  });
});

describe("addProvider", () => {
  test("新增成功", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "https://b.com", apiKey: "k2" });
    expect(c.provider!.b.options!.baseURL).toBe("https://b.com");
    expect(c.model).toBe("a/m1"); // 不改变当前激活
  });
  test("id 冲突抛错", () => {
    expect(() => addProvider(base(), "a", { name: "dup", baseURL: "x", apiKey: "k" })).toThrow(/已存在/);
  });
});

describe("updateProvider", () => {
  test("更新成功", () => {
    const c = updateProvider(base(), "a", { name: "A2", baseURL: "https://a2.com", apiKey: "k2" });
    expect(c.provider!.a.name).toBe("A2");
    expect(c.provider!.a.options!.baseURL).toBe("https://a2.com");
  });
  test("不存在抛错", () => {
    expect(() => updateProvider(base(), "zzz", { name: "x", baseURL: "x", apiKey: "k" })).toThrow(/不存在/);
  });
});

describe("removeProvider", () => {
  test("删除非激活成功", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k" });
    const r = removeProvider(c, "b");
    expect(r.provider!.b).toBeUndefined();
  });
  test("删除激活中抛错", () => {
    expect(() => removeProvider(base(), "a")).toThrow(/启用/);
  });
});

describe("activateProvider", () => {
  test("切换 model 指针", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k", models: { m2: {} } });
    const r = activateProvider(c, "b", "m2");
    expect(r.model).toBe("b/m2");
  });
});

describe("duplicateProvider", () => {
  test("复制并加 -copy 后缀", () => {
    const { config, newId } = duplicateProvider(base(), "a");
    expect(newId).toBe("a-copy");
    expect(config.provider!["a-copy"]).toEqual(config.provider!.a);
    expect(config.model).toBe("a/m1"); // 激活不变
  });
  test("重复复制递增后缀", () => {
    let { config, newId } = duplicateProvider(base(), "a");
    ({ config, newId } = duplicateProvider(config, "a"));
    expect(newId).toBe("a-copy-2");
  });
});
