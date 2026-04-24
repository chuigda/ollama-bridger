import { Hono } from "hono";
import { stream as honoStream } from "hono/streaming";
import { resolveModel } from "../config.ts";
import { getClient } from "../provider.ts";

const chat = new Hono();

// POST /v1/chat/completions — OpenAI-compatible endpoint (pass-through)
chat.post("/v1/chat/completions", async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const modelName = body["model"];

  if (typeof modelName !== "string") {
    return c.json({ error: { message: "model is required", type: "invalid_request_error" } }, 400);
  }

  const resolved = resolveModel(modelName);

  if (!resolved) {
    return c.json({ error: { message: `Model not found: ${modelName}`, type: "invalid_request_error" } }, 404);
  }

  const client = getClient(resolved.provider);

  // Replace model name with the actual upstream model ID
  body["model"] = resolved.model.id;

  const isStream = body["stream"] ?? false;

  const params = body as unknown as Parameters<typeof client.chat.completions.create>[0];

  if (isStream) {
    const response = await client.chat.completions.create(params);

    if (Symbol.asyncIterator in (response as object)) {
      return honoStream(c, async (stream) => {
        c.header("Content-Type", "text/event-stream");
        c.header("Cache-Control", "no-cache");
        c.header("Connection", "keep-alive");

        try {
          const iter = response as AsyncIterable<unknown>;
          for await (const chunk of iter) {
            const line = `data: ${JSON.stringify(chunk)}\n\n`;
            await stream.write(line);
          }
          await stream.write("data: [DONE]\n\n");
        } catch (err) {
          console.error("Stream error (v1):", err);
          const errMsg = err instanceof Error ? err.message : String(err);
          await stream.write(`data: ${JSON.stringify({ error: { message: errMsg, type: "server_error" } })}\n\n`);
        }
      });
    }
  }

  // Non-streaming
  const completion = await client.chat.completions.create(params);
  return c.json(completion);
});

export { chat };