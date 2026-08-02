import { describe, expect, test } from "bun:test";
import { parseJsonc, stringifyJson } from "../lib/jsonc";

describe("parseJsonc", () => {
  test("解析标准 JSON", () => {
    expect(parseJsonc('{"a": 1}')).toEqual({ a: 1 });
  });
  test("剥离单行注释", () => {
    const text = `{\n  // provider 注册表\n  "model": "a/m1"\n}`;
    expect(parseJsonc(text)).toEqual({ model: "a/m1" });
  });
  test("剥离块注释", () => {
    const text = `{ /* 块注释 */ "a": 1 }`;
    expect(parseJsonc(text)).toEqual({ a: 1 });
  });
  test("剥离尾逗号", () => {
    const text = `{ "a": 1, "b": 2, }`;
    expect(parseJsonc(text)).toEqual({ a: 1, b: 2 });
  });
  test("字符串内的注释符号不被剥离", () => {
    const text = `{ "url": "http://x.com/a", "s": "// not comment" }`;
    expect(parseJsonc(text)).toEqual({ url: "http://x.com/a", s: "// not comment" });
  });
  test("语法错误抛 Error", () => {
    expect(() => parseJsonc("{ a: }")).toThrow();
  });
});

describe("stringifyJson", () => {
  test("格式化输出 + 末尾换行", () => {
    expect(stringifyJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
