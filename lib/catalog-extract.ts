// 从 mimo 二进制内嵌目录文本中提取模型快照(reasoning/variants/limit)
export interface CatalogSnapshot {
  reasoning: boolean;
  variants: string[];
  variantParams?: Record<string, Record<string, unknown>>;
  limit?: { context?: number; output?: number };
}

const MARKER = "reasoning_options:[";

// 解析 limit 值:支持整数(1048576)与科学计数法(1e6 / 1.5e6)
function parseLimitNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// 取众数:同一模型跨供应商条目的 limit 各自投票,取出现次数最多者;
// 平票取 context/output 更大者(聚合商条目通常声明更大,但官方/多数派条目应胜出)。
function pickModeLimit(
  votes: { context: number; output: number }[],
): { context: number; output: number } | undefined {
  if (votes.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of votes) {
    const k = `${v.context}:${v.output}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, c]) => {
      const [ctx, outN] = k.split(":").map(Number);
      return { context: ctx, output: outN, count: c };
    })
    .sort((a, b) => b.count - a.count || b.context - a.context || b.output - a.output)
    .map(({ context, output }) => ({ context, output }))[0];
}

export function extractCatalog(text: string): Record<string, CatalogSnapshot> {
  const out: Record<string, CatalogSnapshot> = {};
  const limitVotes = new Map<string, { context: number; output: number }[]>();
  let searchFrom = 0;
  let count = 0;
  while (true) {
    const start = text.indexOf(MARKER, searchFrom);
    if (start === -1) break;
    searchFrom = start + MARKER.length;
    // 括号配平,定位 reasoning_options 数组真正的结束 ]
    let depth = 0;
    let end = -1;
    for (let i = start + MARKER.length - 1; i < text.length; i++) {
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
    const arrText = text.slice(start + MARKER.length - 1, end + 1);
    const back = text.slice(Math.max(0, start - 8192), start);
    const ids = [...back.matchAll(/id:"([^"]+)"/g)];
    if (ids.length === 0) continue;
    const modelId = ids[ids.length - 1][1].split("/").pop()!;
    let values: string[] = [];
    const params: Record<string, Record<string, unknown>> = {};
    for (const item of arrText.matchAll(/\{type:"effort",values:\[([^\]]*)\]\}/g)) {
      values = item[1].match(/"([^"]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
      for (const v of values) params[v] = { reasoningEffort: v };
    }
    const hasToggle = /\{type:"toggle"\}/.test(arrText);
    const reasoningFlag = [...back.matchAll(/reasoning:(!0|!1)/g)].pop()?.[1] === "!0";
    const prev = out[modelId] ?? { reasoning: false, variants: [] as string[] };
    prev.reasoning = prev.reasoning || hasToggle || values.length > 0 || reasoningFlag;
    prev.variants = [...new Set([...prev.variants, ...values])];
    if (Object.keys(params).length > 0) prev.variantParams = { ...prev.variantParams, ...params };
    // limit 在 reasoning_options 数组之后、该条目结束 } 之前;向后扫描本条目自己的 limit,
    // 不向前回看(向前会误配到前一条目)。条目结束 = 下一个 }," (对象闭合 + 逗号 + 下一条目键引号),
    // 嵌套对象(如 interleaved:{...})的 } 后跟字段名而非引号,可正确跳过。
    const afterEnd = text.slice(end + 1, Math.min(text.length, end + 1 + 4096));
    const entryEndMatch = afterEnd.match(/\},\s*"/);
    const entryText = entryEndMatch ? afterEnd.slice(0, entryEndMatch.index! + 1) : afterEnd;
    const limitRe =
      entryText.match(/limit:\{context:([\d.e+]+),input:[\d.e+]+?,output:([\d.e+]+)\}/) ??
      entryText.match(/limit:\{context:([\d.e+]+),output:([\d.e+]+)\}/);
    if (limitRe) {
      const ctx = parseLimitNumber(limitRe[1]);
      const outN = parseLimitNumber(limitRe[2]);
      if (ctx > 0 && outN > 0) {
        const votes = limitVotes.get(modelId) ?? [];
        votes.push({ context: ctx, output: outN });
        limitVotes.set(modelId, votes);
      }
    }
    out[modelId] = prev;
    count++;
  }
  if (count === 0) throw new Error("未提取到任何 reasoning_options,二进制结构可能已变化");
  // 最后按众数决定每个模型的 limit(官方/多数派条目优先)
  for (const [modelId, votes] of limitVotes) {
    const picked = pickModeLimit(votes);
    if (picked) out[modelId].limit = picked;
  }
  return out;
}
