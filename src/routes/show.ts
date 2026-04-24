import { Hono } from "hono";
import { resolveModel } from "../config.ts";

const show = new Hono();

interface ShowRequest {
  model?: string;
  name?: string;
}

show.post("/api/show", async (c) => {
  const body = (await c.req.json()) as ShowRequest;
  const modelName = body.model ?? body.name;

  if (!modelName) {
    return c.json({ error: "model is required" }, 400);
  }

  const resolved = resolveModel(modelName);

  if (!resolved) {
    return c.json({ error: `model '${modelName}' not found` }, 404);
  }

  const { provider, model: m } = resolved;

  const capabilities = [
    "chat",
    m.supportsVision && "vision",
    m.supportsTools && "tools",
    m.supportsReasoning && "reasoning",
  ].filter(Boolean) as string[];

  const familyList = [provider.name];

  const r = ({
    template: "",
    name: m.alias,
    model: m.alias,
    size: 0,
    digest: "sha256:abcd1234", // Dummy digest
    details: {
      parent_model: m.id,
      format: "gguf",
      family: provider.name,
      families: familyList,
      parameter_size: "unknown",
      quantization_level: "unknowns",
    },
    model_info: {
      "general.architecture": provider.name,
      "general.basename": m.id,
      "general.name": m.alias,
      "general.capabilities": capabilities,
      "general.context_length": m.contextLength,
      "provider.name": provider.name,
      "provider.base_url": provider.baseURL,
      "model.supports_vision": m.supportsVision,
      "model.supports_tools": m.supportsTools,
      "model.supports_reasoning": m.supportsReasoning,
      model: {
        supports_vision: m.supportsVision,
        supports_tools: m.supportsTools,
        supports_reasoning: m.supportsReasoning,
        default_reasoning_effort: m.defaultReasoningEffort,
      },
      ...(m.defaultReasoningEffort && {
        "model.default_reasoning_effort": m.defaultReasoningEffort,
      }),
    },
    capabilities,
    modified_at: new Date().toISOString(),
  });
  console.info(r)
  return c.json(r);
});

export { show };