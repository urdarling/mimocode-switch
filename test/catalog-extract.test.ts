import { describe, expect, test } from "bun:test";
import { extractCatalog } from "../lib/catalog-extract";

// 模拟 mimo 二进制内嵌目录片段:条目结构为
// "key":{id:"...",reasoning:!0,reasoning_options:[...],...,limit:{context:1e6,output:384000}}
// 注意:limit 字段在 reasoning_options 之后,且值可能用科学计数法(1e6)
function sampleText(): string {
  return (
    // 前一条目:limit 巨大(2e6),用于检验错配——若向后提取方向正确,不应被 deepseek 条目拿到
    `"x-ai/grok-4.1-fast-non-reasoning":{id:"x-ai/grok-4.1-fast-non-reasoning",name:"Grok 4.1 Fast",reasoning:!1,reasoning_options:[],tool_call:!0,limit:{context:2000000,output:64000}}` +
    // 本条目:limit 在 reasoning_options 之后,用科学计数法 1e6
    `,"deepseek/deepseek-v4-flash":{id:"deepseek/deepseek-v4-flash",name:"DeepSeek V4 Flash",reasoning:!0,reasoning_options:[{type:"effort",values:["high","max"]}],tool_call:!0,interleaved:{field:"reasoning_content"},limit:{context:1e6,output:384000}}`
  );
}

describe("extractCatalog", () => {
  test("limit 从本条目内提取(在 reasoning_options 之后),不误配前一条目", () => {
    const out = extractCatalog(sampleText());
    const ds = out["deepseek-v4-flash"];
    expect(ds).toBeDefined();
    // 官方值:context 1M(1e6),output 384K(384000)——取自本条目,而非前一条目的 2000000/64000
    expect(ds.limit).toEqual({ context: 1000000, output: 384000 });
    // 前一条目的巨大 limit 不应泄漏进来
    expect(ds.limit?.context).not.toBe(2000000);
  });

  test("无 limit 的条目不写 limit 键", () => {
    const text = `"a":{id:"a",reasoning:!0,reasoning_options:[{type:"toggle"}]}`;
    const out = extractCatalog(text);
    expect(out["a"]?.limit).toBeUndefined();
  });

  test("同模型多条目取众数(官方/多数派条目优先),平票取最大", () => {
    // 官方条目(1e6/384000)出现 2 次,聚合商(TEE 1048576/1048576)1 次 → 众数 = 官方值
    const text =
      `"deepseek/deepseek-v4-flash":{id:"deepseek/deepseek-v4-flash",reasoning:!0,reasoning_options:[],limit:{context:1e6,output:384000}}` +
      `,"deepseek-v4-flash":{id:"deepseek-v4-flash",reasoning:!0,reasoning_options:[],limit:{context:1e6,output:384000}}` +
      `,"TEE/deepseek-v4-flash":{id:"TEE/deepseek-v4-flash",reasoning:!0,reasoning_options:[],limit:{context:1048576,output:1048576}}`;
    const out = extractCatalog(text);
    expect(out["deepseek-v4-flash"]?.limit).toEqual({ context: 1000000, output: 384000 });
  });

  test("多条目众数平票时取最大值", () => {
    const text =
      `"a/a":{id:"a/a",reasoning:!0,reasoning_options:[],limit:{context:1048576,output:65536}}` +
      `,"b/a":{id:"b/a",reasoning:!0,reasoning_options:[],limit:{context:1048576,output:384000}}`;
    const out = extractCatalog(text);
    expect(out["a"]?.limit).toEqual({ context: 1048576, output: 384000 });
  });

  test("单一条目直接采用该值", () => {
    const text = `"deepseek/deepseek-v4-flash":{id:"deepseek/deepseek-v4-flash",reasoning:!0,reasoning_options:[],limit:{context:1e6,output:384000}}`;
    const out = extractCatalog(text);
    expect(out["deepseek-v4-flash"]?.limit).toEqual({ context: 1000000, output: 384000 });
  });
});
