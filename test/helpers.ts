import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

// 测试临时目录:统一放项目内 test/.tmp/(已 gitignore),不用系统临时目录,
// 避免跨目录权限请求与残留垃圾
export const TEST_TMP_ROOT = join(import.meta.dir, ".tmp");

export function makeTestDir(prefix = "t-"): string {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  return mkdtempSync(join(TEST_TMP_ROOT, prefix));
}

export function removeTestDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
