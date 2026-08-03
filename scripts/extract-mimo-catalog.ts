// scripts/extract-mimo-catalog.ts
import { existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

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
interface Snapshot {
  reasoning: boolean;
  variants: string[];
  limit?: { context?: number; output?: number };
}
const out: Record<string, Snapshot> = {};

const marker = "reasoning_options:[";
let searchFrom = 0;
let count = 0;
while (true) {
  const start = text.indexOf(marker, searchFrom);
  if (start === -1) break;
  searchFrom = start + marker.length;
  // 括号配平,定位数组真正的结束 ]
  let depth = 0;
  let end = -1;
  for (let i = start + marker.length - 1; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) break;
  const arrText = text.slice(start + marker.length - 1, end + 1);
  const back = text.slice(Math.max(0, start - 8192), start);
  const ids = [...back.matchAll(/id:"([^"]+)"/g)];
  if (ids.length === 0) continue;
  const modelId = ids[ids.length - 1][1].split("/").pop()!;
  let values: string[] = [];
  for (const item of arrText.matchAll(/\{type:"effort",values:\[([^\]]*)\]\}/g)) {
    values = item[1].match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
  }
  const hasToggle = /\{type:"toggle"\}/.test(arrText);
  const reasoningFlag = [...back.matchAll(/reasoning:(!0|!1)/g)].pop()?.[1] === "!0";
  const prev = out[modelId] ?? { reasoning: false, variants: [] as string[] };
  prev.reasoning = prev.reasoning || hasToggle || values.length > 0 || reasoningFlag;
  prev.variants = [...new Set([...prev.variants, ...values])];
  // limit:目录条目可能带 input,取 context/output 的最大值作为默认
  const limitRe = back.match(/limit:\{context:(\d+),input:(\d+),output:(\d+)\}/) ?? back.match(/limit:\{context:(\d+),output:(\d+)\}/);
  if (limitRe) {
    const ctx = Number(limitRe[1]);
    const outN = Number(limitRe[limitRe.length - 1]);
    if (ctx > 0 && outN > 0) {
      prev.limit = {
        context: Math.max(prev.limit?.context ?? 0, ctx),
        output: Math.max(prev.limit?.output ?? 0, outN),
      };
    }
  }
  out[modelId] = prev;
  count++;
}
if (count === 0) throw new Error("未提取到任何 reasoning_options,二进制结构可能已变化");

const ds = out["deepseek-v4-flash"];
if (!ds || !ds.variants.includes("high") || !ds.variants.includes("max")) {
  throw new Error("自检失败: deepseek-v4-flash 应含 high/max");
}

const outPath = join(import.meta.dir, "..", "data", "variants", "mimo.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`已提取 ${count} 条 reasoning_options → ${outPath}(${Object.keys(out).length} 个模型);该文件由脚本生成,勿手改`);
