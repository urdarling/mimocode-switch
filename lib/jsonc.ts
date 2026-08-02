// 逐字符扫描,正确处理字符串与转义,剥离 // 与 /* */ 注释和尾逗号
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === ",") {
      // 若下一非空白字符是 } 或 ],则跳过该逗号(尾逗号)
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") {
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
