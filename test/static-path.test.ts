import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveStaticPath } from "../lib/static-path";

const pub = join(process.cwd(), "public");

describe("resolveStaticPath", () => {
  test("根路径映射到 index.html", () => {
    expect(resolveStaticPath(pub, "/")).toBe(join(pub, "index.html"));
  });
  test("普通文件返回 publicDir 内路径", () => {
    expect(resolveStaticPath(pub, "/app.js")).toBe(join(pub, "app.js"));
  });
  test(".. 越界返回 null", () => {
    expect(resolveStaticPath(pub, "/../server.ts")).toBeNull();
  });
  test("兄弟目录前缀(public-evil)返回 null", () => {
    expect(resolveStaticPath(pub, "/../public-evil/x.txt")).toBeNull();
  });
});
