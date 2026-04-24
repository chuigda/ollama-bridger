import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AppConfigSchema,
  type AppConfig,
  type ModelConfig,
  type UpstreamConfig,
} from "./schema.js";

/** 递归展开字符串中的 ${ENV_VAR} 占位符 */
const expandEnv = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, k: string) => {
      const v = process.env[k];
      if (v === undefined) {
        throw new Error(`Environment variable "${k}" is not defined`);
      }
      return v;
    });
  }
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        expandEnv(v),
      ]),
    );
  }
  return value;
};

/** 已解析、带索引的运行时配置 */
export interface ResolvedConfig {
  readonly raw: AppConfig;
  readonly modelByName: ReadonlyMap<string, ModelConfig>;
  readonly upstreams: ReadonlyMap<string, UpstreamConfig>;
  /** 根据客户端请求的 model 名解析出 { upstream, remoteModel } */
  resolveModel(name: string): {
    upstream: UpstreamConfig;
    upstreamName: string;
    remoteModel: string;
    model?: ModelConfig;
  };
}

export const loadConfig = async (
  path: string = process.env["CONFIG_PATH"] ?? "./config.json",
): Promise<ResolvedConfig> => {
  const absPath = resolve(path);
  const text = await readFile(absPath, "utf8");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Failed to parse config JSON at ${absPath}: ${(e as Error).message}`,
    );
  }

  const expanded = expandEnv(json);
  const parsed = AppConfigSchema.safeParse(expanded);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config at ${absPath}:\n${msg}`);
  }

  const cfg = parsed.data;
  const modelByName = new Map(cfg.models.map((m) => [m.name, m]));
  const upstreams = new Map(Object.entries(cfg.upstreams));

  const resolveModel: ResolvedConfig["resolveModel"] = (name) => {
    const model = modelByName.get(name);
    if (model) {
      const upstream = upstreams.get(model.upstream);
      if (!upstream) {
        // 理论上 schema 已校验过
        throw new Error(`Upstream "${model.upstream}" not found`);
      }
      return {
        upstream,
        upstreamName: model.upstream,
        remoteModel: model.remoteModel ?? model.name,
        model,
      };
    }
    // 未知模型 → 回退到默认 upstream（如果允许）
    if (!cfg.defaults.passthroughUnknownModels) {
      throw new ModelNotFoundError(name);
    }
    const fallback = cfg.defaults.upstream ?? upstreams.keys().next().value;
    if (!fallback) throw new Error("No upstream available");
    const upstream = upstreams.get(fallback)!;
    return {
      upstream,
      upstreamName: fallback,
      remoteModel: name,
    };
  };

  return { raw: cfg, modelByName, upstreams, resolveModel };
};

export class ModelNotFoundError extends Error {
  constructor(public readonly modelName: string) {
    super(`Model "${modelName}" not found`);
    this.name = "ModelNotFoundError";
  }
}