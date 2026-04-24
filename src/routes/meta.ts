import { Hono } from "hono";
import type { ResolvedConfig } from "../config/loader.js";
import type { ModelConfig } from "../config/schema.js";

const PROXY_VERSION = "0.1.0";
// 伪造一个让大多数 Ollama 客户端满意的版本号
const FAKE_OLLAMA_VERSION = "0.6.4";

const fakeDigest = (name: string): string => {
  // 形如 "sha256:xxxxx..."（64 位 hex）
  let h = 0n;
  for (const ch of name) h = (h * 131n + BigInt(ch.charCodeAt(0))) & ((1n << 64n) - 1n);
  const hex = h.toString(16).padStart(16, "0");
  return "sha256:" + hex.repeat(4);
};

const modelToTag = (m: ModelConfig) => ({
  name: m.name,
  model: m.name,
  modified_at: new Date().toISOString(),
  size: 0,
  digest: fakeDigest(m.name),
  details: {
    parent_model: "",
    format: "gguf",
    family: m.family ?? "openai",
    families: [m.family ?? "openai"],
    parameter_size: m.parameterSize ?? "unknown",
    quantization_level: m.quantizationLevel ?? "unknown",
  },
});

export const metaRoutes = (cfg: ResolvedConfig) => {
  const app = new Hono();

  app.get("/", (c) => c.text("Ollama is running"));

  app.get("/api/version", (c) =>
    c.json({ version: FAKE_OLLAMA_VERSION, proxy: PROXY_VERSION }),
  );

  app.get("/api/tags", (c) =>
    c.json({ models: cfg.raw.models.map(modelToTag) }),
  );

  // 运行中的模型列表；我们是无状态代理，总是空
  app.get("/api/ps", (c) => c.json({ models: [] }));

  // POST /api/show { name/model: "..." }
  app.post("/api/show", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      model?: string;
    };
    const name = body.model ?? body.name;
    if (!name) return c.json({ error: "missing model name" }, 400);
    const m = cfg.modelByName.get(name);
    if (!m) return c.json({ error: `model "${name}" not found` }, 404);

    return c.json({
      modelfile: `# proxy: ${m.name} -> ${m.upstream}:${m.remoteModel ?? m.name}`,
      parameters: "",
      template: "",
      details: modelToTag(m).details,
      model_info: {
        "general.architecture": m.family ?? "openai",
        ...(m.contextLength
          ? { "general.context_length": m.contextLength }
          : {}),
      },
      capabilities: m.capabilities,
    });
  });

  return app;
};