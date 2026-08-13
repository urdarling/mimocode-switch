import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readOfficialVariants, writeOfficialVariants } from "../lib/variants-store";
import { makeTestDir, removeTestDir, TEST_TMP_ROOT } from "./helpers";

const dirs: string[] = [];
function tempFile(): string {
  const dir = makeTestDir("vb-");
  dirs.push(dir);
  return join(dir, "official.json");
}
afterAll(() => { dirs.forEach(removeTestDir); });

describe("readOfficialVariants", () => {
  test("文件不存在返回空对象", () => {
    expect(readOfficialVariants(join(TEST_TMP_ROOT, "nope", "official.json"))).toEqual({});
  });
  test("解析失败返回空对象", () => {
    const f = tempFile();
    writeFileSync(f, "{ not json", "utf8");
    expect(readOfficialVariants(f)).toEqual({});
  });
});

describe("writeOfficialVariants", () => {
  test("写入条目并保留 // 说明键", () => {
    const f = tempFile();
    writeFileSync(f, JSON.stringify({ "//": "维护说明", "a": { "variants": ["low"] } }, null, 2), "utf8");
    writeOfficialVariants(f, { "b": { "variants": ["high"] } });
    const raw = JSON.parse(readFileSync(f, "utf8"));
    expect(raw["//"]).toBe("维护说明");
    expect(raw.b).toEqual({ "variants": ["high"] });
    expect(raw.a).toBeUndefined();
  });
  test("请求体自带的 // 键不覆盖已保留的说明", () => {
    const f = tempFile();
    writeFileSync(f, JSON.stringify({ "//": "原说明", "a": { "variants": ["low"] } }, null, 2), "utf8");
    writeOfficialVariants(f, { "//": "恶意覆盖", "b": { "variants": ["high"] } });
    const raw = JSON.parse(readFileSync(f, "utf8"));
    expect(raw["//"]).toBe("原说明");
    expect(raw.b).toEqual({ "variants": ["high"] });
  });
  test("无 // 键时不注入", () => {
    const f = tempFile();
    writeOfficialVariants(f, { "a": { "variants": ["low"] } });
    const raw = JSON.parse(readFileSync(f, "utf8"));
    expect(raw["//"]).toBeUndefined();
    expect(raw.a).toEqual({ "variants": ["low"] });
  });
  test("write 保留 variantParams 字段", () => {
    const f = tempFile();
    const entries = {
      "grok-4.6": {
        name: "grok-4.6",
        variants: ["low", "medium", "high"],
        variantParams: {
          low: { reasoningEffort: "low" },
          medium: { reasoningEffort: "medium" },
          high: { reasoningEffort: "high" },
        },
        source: "",
        updated: "2026-08-13",
      },
    };
    writeOfficialVariants(f, entries);
    const back = readOfficialVariants(f);
    expect(back["grok-4.6"]?.variantParams).toEqual(entries["grok-4.6"].variantParams);
  });
  test("无 variantParams 的条目读写后不出现该键", () => {
    const f = tempFile();
    const entries = { "a": { name: "A", variants: ["low"], source: "", updated: "2026-08-13" } };
    writeOfficialVariants(f, entries);
    const back = readOfficialVariants(f);
    expect(back["a"]).not.toHaveProperty("variantParams");
  });
});
