import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import {
  activateProvider, addProvider, duplicateProvider,
  listProviders, removeProvider, updateProvider,
} from "./lib/provider-ops";
import { readMetadata, writeMetadata } from "./lib/metadata";
import { readConfig, writeConfig } from "./lib/config-store";
import { resolveConfigPaths } from "./lib/config-path";

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

    if (method === "POST" && pathname === "/api/providers") {
      try {
        const body = await req.json() as { id: string; name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string }>; note?: string; link?: string };
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
        const body = await req.json() as { name: string; baseURL: string; apiKey: string; headers?: Record<string, string>; models?: Record<string, { name?: string }>; note?: string; link?: string };
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

    if (pathname === "/api/fetch-models") {
      return fail(501, "尚未实现");
    }

    // 静态资源
    let filePath = normalize(join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) return fail(403, "forbidden");
    if (!existsSync(filePath) || !filePath.endsWith(".html")) return fail(404, "not found");
    return new Response(readFileSync(filePath), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`mimocode 供应商管理工具: http://127.0.0.1:${server.port}`);
