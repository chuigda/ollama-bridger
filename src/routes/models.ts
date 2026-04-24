import { Hono } from "hono";
import { getAllResolvedModels } from "../config.ts";
import type { OllamaListResponse, OllamaModel } from "../types.ts";

const models = new Hono();

function buildModelEntry(
  alias: string,
  providerName: string,
  contextLength?: number,
): OllamaModel {
  return {
    name: alias,
    model: alias,
    modified_at: new Date().toISOString(),
    size: 0,
    digest: Buffer.from(alias).toString("hex").slice(0, 64).padEnd(64, "0"),
    details: {
      parent_model: "",
      format: "gguf",
      family: providerName,
      families: [providerName],
      parameter_size: "unknown",
      quantization_level: "none",
      ...(contextLength && { context_length: contextLength }),
    },
    ...(contextLength && { context_length: contextLength }),
  };
}

// GET /api/tags — Ollama model list
models.get("/api/tags", (c) => {
  const resolved = getAllResolvedModels();
  const response: OllamaListResponse = {
    models: resolved.map((r) =>
      buildModelEntry(r.model.alias, r.provider.name, r.model.contextLength),
    ),
  };
  console.info(response)
  return c.json(response);
});

// Also support the OpenAI-style /v1/models
models.get("/v1/models", (c) => {
  const resolved = getAllResolvedModels();
  return c.json({
    object: "list",
    data: resolved.map((r) => ({
      id: r.model.alias,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: r.provider.name,
    })),
  });
});

export { models };