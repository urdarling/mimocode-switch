// scripts/extract-mimo-catalog.ts
import { existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { extractCatalog } from "../lib/catalog-extract";

function findExe(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const hit = findExe(full);
      if (hit) return hit;
    } else if (entry === "mimo.exe" || entry === "mimo") {
      return full;
    }
  }
  return null;
}

function findBinary(): string {
  if (process.env.MIMO_BIN && existsSync(process.env.MIMO_BIN)) return process.env.MIMO_BIN;
  const whichMimo = Bun.which("mimo");
  const prefixes = [
    process.env.npm_config_prefix,
    whichMimo ? dirname(whichMimo) : undefined, // npm 全局 shim 所在目录(含 node_modules/@mimo-ai)
    join(homedir(), "AppData", "Roaming", "npm"),
    join(homedir(), ".npm-global"),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".mimo"),
  ].filter(Boolean) as string[];
  let cwd = process.cwd();
  while (cwd.length > 3) {
    prefixes.push(join(cwd, ".."));
    cwd = dirname(cwd);
  }
  for (const p of prefixes) {
    const base = join(p, "node_modules", "@mimo-ai");
    const hit = findExe(base);
    if (hit) return hit;
  }
  throw new Error("未找到 mimo 二进制(mimo/mimo.exe),请设置 MIMO_BIN 环境变量指向它");
}

const bin = findBinary();
console.log(`mimo 二进制: ${bin}`);
const text = new TextDecoder("latin1").decode(readFileSync(bin));
const out = extractCatalog(text);

const ds = out["deepseek-v4-flash"];
if (!ds || !ds.variants.includes("high") || !ds.variants.includes("max")) {
  throw new Error("自检失败: deepseek-v4-flash 应含 high/max");
}
// limit 自检:官方 CONTEXT 1M / MAX OUTPUT 384K;向前错配的 2e6 应被本条目向后提取替换
if (!ds.limit || ds.limit.context! < 1000000 || ds.limit.context! > 2000000) {
  throw new Error(`自检失败: deepseek-v4-flash limit 异常: ${JSON.stringify(ds.limit)}`);
}

const outPath = join(import.meta.dir, "..", "data", "variants", "mimo.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`已提取 → ${outPath}(${Object.keys(out).length} 个模型);该文件由脚本生成,勿手改`);
