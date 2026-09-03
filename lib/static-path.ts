import { join, normalize, sep } from "node:path";

// 静态文件路径解析:限制在 publicDir 内,越界返回 null。
// startsWith 必须带分隔符边界——否则兄弟目录(如 public-evil/)也能通过前缀匹配。
export function resolveStaticPath(publicDir: string, pathname: string): string | null {
  const filePath = normalize(join(publicDir, pathname === "/" ? "index.html" : pathname));
  return filePath.startsWith(publicDir + sep) ? filePath : null;
}
