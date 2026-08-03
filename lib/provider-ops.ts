const PROVIDER_ID_RE = /^[a-z0-9-]+$/;

export interface ProviderInput {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  models?: Record<string, ModelSpec>;
}

export interface ProviderConfig {
  name?: string;
  npm?: string;
  api?: string;
  options?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> };
  models?: Record<string, ModelSpec>;
}

export interface ModelSpec {
  name?: string;
  variants?: Record<string, unknown>;
  limit?: { context?: number; output?: number };
}

export interface ConfigData {
  model?: string;
  provider?: Record<string, ProviderConfig>;
  [k: string]: unknown;
}

export function assertValidId(id: string): void {
  if (!PROVIDER_ID_RE.test(id)) {
    throw new Error("供应商标识只能包含小写字母、数字和连字符");
  }
}

export function buildProvider(input: Omit<ProviderInput, "id">): ProviderConfig {
  const p: ProviderConfig = {
    name: input.name,
    npm: "@ai-sdk/openai-compatible",
    options: { baseURL: input.baseURL, apiKey: input.apiKey },
  };
  if (input.headers && Object.keys(input.headers).length > 0) {
    p.options!.headers = input.headers;
  }
  if (input.models && Object.keys(input.models).length > 0) {
    p.models = input.models;
  }
  return p;
}

export function listProviders(config: ConfigData): { id: string; isDefault: boolean; config: ProviderConfig }[] {
  const providers = config.provider ?? {};
  const active = config.model ?? "";
  return Object.entries(providers).map(([id, cfg]) => ({
    id,
    isDefault: active.startsWith(`${id}/`),
    config: cfg ?? {},
  }));
}

export function addProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData {
  assertValidId(id);
  const providers = config.provider ?? {};
  if (providers[id]) throw new Error(`供应商 ${id} 已存在`);
  return {
    ...config,
    provider: { ...providers, [id]: buildProvider(input) },
  };
}

export function updateProvider(config: ConfigData, id: string, input: Omit<ProviderInput, "id">): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) throw new Error(`供应商 ${id} 不存在`);
  return {
    ...config,
    provider: { ...providers, [id]: buildProvider(input) },
  };
}

export function removeProvider(config: ConfigData, id: string): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) return config;
  const next = { ...providers };
  delete next[id];
  // additive 模式:删除默认供应商后,model 指针重定向到剩余第一个,避免悬空
  let model: string | undefined = config.model;
  const isDefault = (config.model ?? "").startsWith(`${id}/`);
  if (isDefault) {
    const remaining = Object.keys(next);
    if (remaining.length === 0) {
      model = undefined;
    } else {
      const fallback = remaining[0];
      const fallbackModels = Object.keys(next[fallback]?.models ?? {});
      model = fallbackModels.length > 0 ? `${fallback}/${fallbackModels[0]}` : `${fallback}/`;
    }
  }
  return { ...config, provider: next, model };
}

export function activateProvider(config: ConfigData, id: string, modelId: string): ConfigData {
  const providers = config.provider ?? {};
  if (!providers[id]) throw new Error(`供应商 ${id} 不存在`);
  return { ...config, model: `${id}/${modelId}` };
}

export function duplicateProvider(config: ConfigData, id: string): { config: ConfigData; newId: string } {
  const providers = config.provider ?? {};
  const src = providers[id];
  if (!src) throw new Error(`供应商 ${id} 不存在`);
  let newId = `${id}-copy`;
  let n = 2;
  while (providers[newId]) {
    newId = `${id}-copy-${n}`;
    n++;
  }
  return {
    config: { ...config, provider: { ...providers, [newId]: JSON.parse(JSON.stringify(src)) } },
    newId,
  };
}
