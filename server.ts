import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import {
  activateProvider, addProvider, duplicateProvider,
  listProviders, removeProvider, updateProvider,
} from "./lib/provider-ops";
import { readMetadata, writeMetadata } from "./lib/metadata";
import { readConfig, writeConfig } from "./lib/config-store";
import { resolveConfigPaths } from "./lib/config-path";
import { readOfficialVariants, writeOfficialVariants } from "./lib/variants-store";

const paths = resolveConfigPaths();
const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC_DIR = join(import.meta.dir, "public");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function ok(data: unknown): Response {
  return json({ ok: true, data });
}

function fail(status: number, error: string): Response {
  return json({ ok: false, error }, status);
}

function loadConfig(createIfMissing = false): unknown {
  const cfg = readConfig(paths.configFile);
  if (cfg === null) {
    if (createIfMissing) {
      const empty = { provider: {} };
      writeConfig(paths.configFile, empty);
      return empty;
    }
    throw Object.assign(new Error("未找到 mimocode.jsonc"), { code: "NO_CONFIG" });
  }
  return cfg as Record<string, unknown>;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/config") {
      try {
        const cfg = loadConfig();
        const meta = readMetadata(paths.metadataFile);
        const providers = listProviders(cfg as never);
        return ok({
          providers,
          activeModel: cfg.model ?? "",
          configFile: paths.configFile,
          hasConfig: existsSync(paths.configFile),
          metadata: meta,
        });
      } catch (e) {
        const err = e as Error & { code?: string };
        return fail(err.code === "NO_CONFIG" ? 404 : 500, err.message);
      }
    }

    if (method === "GET" && pathname === "/api/variants") {
      const read = (p: string): Record<string, unknown> => {
        try {
          return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
        } catch {
          return {};
        }
      };
      return ok({
        builtin: read(join(import.meta.dir, "data", "variants", "mimo.json")),
        official: readOfficialVariants(join(import.meta.dir, "data", "variants", "official.json")),
      });
    }

    if (method === "POST" && pathname === "/api/variants/extract") {
      try {
        const proc = Bun.spawn(["bun", "run", "scripts/extract-mimo-catalog.ts"], {
          cwd: import.meta.dir,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [code, outBuf, errBuf] = await Promise.all([
          proc.exited,
          new Response(proc.stdout).arrayBuffer(),
          new Response(proc.stderr).arrayBuffer(),
        ]);
        const out = new TextDecoder().decode(outBuf);
        const err = new TextDecoder().decode(errBuf);
        if (code !== 0) return fail(500, (err || out).trim() || "提取失败");
        return ok({ output: out.trim() });
      } catch (e) {
        return fail(500, (e as Error).message);
      }
    }

    if (method === "PUT" && pathname === "/api/variants/official") {
      try {
        const body = await req.json() as Record<string, unknown>;
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return fail(400, "请求体必须是条目对象");
        }
        for (const [id, entry] of Object.entries(body)) {
          if (id === "//") continue; // 说明键,非条目
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            return fail(400, `条目 ${id} 必须是对象`);
          }
          const v = (entry as Record<string, unknown>).variants;
          if (v !== undefined && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
            return fail(400, `条目 ${id} 的 variants 必须是字符串数组`);
          }
        }
        writeOfficialVariants(join(import.meta.dir, "data", "variants", "official.json"), body);
        return ok({});
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "POST" && pathname === "/api/providers") {
      try {
        const body = await req.json() as { id: string; name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string; variants?: Record<string, unknown>; limit?: { context?: number; output?: number } }>; note?: string; link?: string };
        if (!body.id || !body.name || !body.baseURL || !body.apiKey) {
          return fail(400, "标识、名称、Base URL、API Key 均为必填");
        }
        const cfg = loadConfig(true) as never;
        const next = addProvider(cfg, body.id, body);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        if (body.note || body.link) {
          meta.notes = { ...meta.notes, [body.id]: body.note ?? "" };
          meta.links = { ...meta.links, [body.id]: body.link ?? "" };
          writeMetadata(paths.metadataFile, meta);
        }
        return ok({ id: body.id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    const providerMatch = pathname.match(/^\/api\/providers\/([^/]+)$/);
    const id = providerMatch?.[1];

    if (method === "PUT" && providerMatch) {
      try {
        const body = await req.json() as { name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string; variants?: Record<string, unknown>; limit?: { context?: number; output?: number } }>; note?: string; link?: string };
        const cfg = loadConfig() as never;
        const next = updateProvider(cfg, id, body);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        if (body.note !== undefined) meta.notes = { ...meta.notes, [id]: body.note };
        if (body.link !== undefined) meta.links = { ...meta.links, [id]: body.link };
        writeMetadata(paths.metadataFile, meta);
        return ok({ id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "DELETE" && providerMatch) {
      try {
        const cfg = loadConfig() as never;
        const next = removeProvider(cfg, id);
        writeConfig(paths.configFile, next);
        const meta = readMetadata(paths.metadataFile);
        delete meta.notes?.[id];
        delete meta.links?.[id];
        if (meta.order) meta.order = meta.order.filter((x) => x !== id);
        writeMetadata(paths.metadataFile, meta);
        return ok({ id });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    const activateMatch = pathname.match(/^\/api\/providers\/([^/]+)\/activate$/);
    if (method === "POST" && activateMatch) {
      try {
        const body = await req.json() as { modelId: string };
        const cfg = loadConfig() as never;
        const next = activateProvider(cfg, activateMatch[1], body.modelId);
        writeConfig(paths.configFile, next);
        return ok({ model: next.model });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    const duplicateMatch = pathname.match(/^\/api\/providers\/([^/]+)\/duplicate$/);
    if (method === "POST" && duplicateMatch) {
      try {
        const cfg = loadConfig() as never;
        const { config: next, newId } = duplicateProvider(cfg, duplicateMatch[1]);
        writeConfig(paths.configFile, next);
        return ok({ id: newId });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (method === "PUT" && pathname === "/api/order") {
      try {
        const body = await req.json() as { ids: string[] };
        const meta = readMetadata(paths.metadataFile);
        meta.order = body.ids;
        writeMetadata(paths.metadataFile, meta);
        return ok({ order: body.ids });
      } catch (e) {
        return fail(400, (e as Error).message);
      }
    }

    if (pathname === "/api/fetch-models" && method === "POST") {
      try {
        const body = await req.json() as { baseURL: string; apiKey: string };
        if (!body.baseURL || !body.apiKey) return fail(400, "baseURL 和 apiKey 必填");
        const endpoint = `${body.baseURL.replace(/\/+$/, "")}/models`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${body.apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        if (res.status === 401 || res.status === 403) return fail(401, "认证失败:请检查 API Key");
        if (res.status === 404 || res.status === 405) return fail(404, "该供应商未提供 /models 端点");
        if (!res.ok) return fail(502, `端点返回 ${res.status}`);
        const data = await res.json() as { data?: { id: string }[] };
        const models = (data.data ?? []).map((m) => m.id).filter(Boolean).sort();
        if (models.length === 0) return fail(404, "端点未返回模型列表");
        return ok({ models });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("timeout") || msg.includes("timed out")) return fail(408, "请求超时,请检查网络");
        return fail(502, `请求失败: ${msg}`);
      }
    }

    // 静态资源
    let filePath = normalize(join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) return fail(403, "forbidden");
    if (!existsSync(filePath) || !filePath.startsWith(PUBLIC_DIR)) return fail(404, "not found");
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const mime: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "application/javascript; charset=utf-8",
      json: "application/json; charset=utf-8",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
    };
    return new Response(readFileSync(filePath), {
      headers: { "Content-Type": mime[ext] ?? "application/octet-stream" },
    });
  },
});

console.log(`mimocode 供应商管理工具: http://127.0.0.1:${server.port}`);
