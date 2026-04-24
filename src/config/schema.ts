import { z } from "zod";

/** 模型能力，用于 /api/show 等接口告知客户端 */
export const CapabilitySchema = z.enum([
  "chat",
  "tools",
  "vision",
  "embedding",
  "completion",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const ServerConfigSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(11434),
});

export const LoggingConfigSchema = z.object({
  level: LogLevelSchema.default("info"),
  logRequests: z.boolean().default(true),
  logResponses: z.boolean().default(false),
});

export const UpstreamConfigSchema = z.object({
  /** OpenAI 兼容端点 base URL，例如 https://api.openai.com/v1 */
  baseURL: z.string().url(),
  /** API key；支持用 ${ENV_VAR} 占位，在 loader 里展开 */
  apiKey: z.string().min(1),
  /** 请求超时（ms） */
  timeoutMs: z.number().int().positive().default(120_000),
  /** 自定义请求头 */
  defaultHeaders: z.record(z.string()).default({}),
  /** 可选 organization / project（OpenAI 官方端点用） */
  organization: z.string().optional(),
  project: z.string().optional(),
});
export type UpstreamConfig = z.infer<typeof UpstreamConfigSchema>;

export const ModelConfigSchema = z.object({
  /** 客户端看到的模型名（Ollama 风格，如 "gpt-4o" 或 "llama3:8b"） */
  name: z.string().min(1),
  /** 使用哪个 upstream（对应 upstreams map 的 key） */
  upstream: z.string().min(1),
  /** 实际转发给 upstream 时使用的模型名；缺省 = name */
  remoteModel: z.string().min(1).optional(),
  /** 模型能力；影响 /api/tags、/api/show 返回 */
  capabilities: z.array(CapabilitySchema).default(["chat"]),
  /** 可选元信息，透传给 /api/show */
  family: z.string().optional(),
  parameterSize: z.string().optional(),
  quantizationLevel: z.string().optional(),
  contextLength: z.number().int().positive().optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const DefaultsSchema = z.object({
  /** 当请求模型未在 models[] 命中时使用的 upstream */
  upstream: z.string().min(1).optional(),
  /** 未命中时是否仍然透传（否则返回 404） */
  passthroughUnknownModels: z.boolean().default(true),
});

export const AppConfigSchema = z
  .object({
    $schema: z.string().optional(),
    server: ServerConfigSchema.default({}),
    logging: LoggingConfigSchema.default({}),
    defaults: DefaultsSchema.default({}),
    upstreams: z.record(UpstreamConfigSchema).refine(
      (m) => Object.keys(m).length > 0,
      { message: "At least one upstream must be configured" },
    ),
    models: z.array(ModelConfigSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    // models[].upstream 必须存在
    for (const [i, m] of cfg.models.entries()) {
      if (!(m.upstream in cfg.upstreams)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["models", i, "upstream"],
          message: `Unknown upstream "${m.upstream}"`,
        });
      }
    }
    // defaults.upstream 必须存在
    if (
      cfg.defaults.upstream !== undefined &&
      !(cfg.defaults.upstream in cfg.upstreams)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaults", "upstream"],
        message: `Unknown upstream "${cfg.defaults.upstream}"`,
      });
    }
    // name 不重复
    const seen = new Set<string>();
    for (const [i, m] of cfg.models.entries()) {
      if (seen.has(m.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["models", i, "name"],
          message: `Duplicate model name "${m.name}"`,
        });
      }
      seen.add(m.name);
    }
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;