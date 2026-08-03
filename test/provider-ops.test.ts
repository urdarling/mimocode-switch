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
  test("models 透传 variants", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", variants: { low: {}, high: {} } } } });
    expect(p.models!.m.variants).toEqual({ low: {}, high: {} });
  });
  test("models 透传 limit", () => {
    const p = buildProvider({ name: "X", baseURL: "https://x.com", apiKey: "k", models: { m: { name: "M", limit: { context: 1050000, output: 128000 } } } });
    expect(p.models!.m.limit).toEqual({ context: 1050000, output: 128000 });
  });
});

describe("listProviders", () => {
  test("返回默认标记(model 指针指向的为默认)", () => {
    const list = listProviders(base());
    expect(list.find((x) => x.id === "a")!.isDefault).toBe(true);
    expect(list.find((x) => x.id === "a")!.active).toBeUndefined();
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
  test("删除非默认成功", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k" });
    const r = removeProvider(c, "b");
    expect(r.provider!.b).toBeUndefined();
  });
  test("删除默认供应商自动重定向 model 到剩余第一个", () => {
    const c = addProvider(base(), "b", { name: "B", baseURL: "x", apiKey: "k", models: { m2: {} } });
    // 默认是 a;先删 b(非默认),model 不动
    const r1 = removeProvider(c, "b");
    expect(r1.model).toBe("a/m1");
    // 让 b 成为默认,删除 b 后 model 重定向到 a
    const c2 = activateProvider(c, "b", "m2");
    const r2 = removeProvider(c2, "b");
    expect(r2.provider!.b).toBeUndefined();
    expect(r2.model).toBe("a/m1");
  });
  test("删除唯一供应商后 model 清空", () => {
    const r = removeProvider(base(), "a");
    expect(r.provider!.a).toBeUndefined();
    expect(r.model).toBeUndefined();
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
