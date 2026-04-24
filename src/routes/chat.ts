import { Hono } from "hono";
import { stream as honoStream } from "hono/streaming";
import type OpenAI from "openai";
import { resolveModel } from "../config.ts";
import { getClient } from "../provider.ts";
import {
  buildOpenAIRequest,
  deltaToOllamaChunk,
  toOllamaResponse,
  type StreamState,
} from "../transform.ts";
import type { OllamaChatRequest } from "../types.ts";

const chat = new Hono();

// POST /v1/chat/completions — OpenAI-compatible endpoint (pass-through)
chat.post("/v1/chat/completions", async (c) => {
  const body = (await c.req.json()) as { model: string } & Record<
    string,
    unknown
  >;
  const resolved = resolveModel(body.model);

  if (!resolved) {
    return c.json({ error: { message: `Model not found: ${body.model}`, type: "invalid_request_error" } }, 404);
  }

  const client = getClient(resolved.provider);

  // Replace model name with the actual upstream model ID
  body.model = resolved.model.id;

  const isStream = body.stream ?? false;

  if (isStream) {
    const response = await client.chat.completions.create(
      body as Parameters<typeof client.chat.completions.create>[0],
    );

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
  const completion = await client.chat.completions.create(
    body as Parameters<typeof client.chat.completions.create>[0],
  );
  return c.json(completion);
});

// POST /api/chat — Ollama-native chat endpoint (translated to OpenAI)
chat.post("/api/chat", async (c) => {
  const body = (await c.req.json()) as OllamaChatRequest;
  const resolved = resolveModel(body.model);

  if (!resolved) {
    return c.json({ error: `Model not found: ${body.model}` }, 404);
  }

  const { provider, model: modelCfg } = resolved;
  const client = getClient(provider);
  const shouldStream = body.stream !== false; // default true in Ollama
  const think = body.think ?? modelCfg.supportsReasoning;

  const openaiParams = buildOpenAIRequest(body, modelCfg);

  if (shouldStream) {
    openaiParams.stream = true;
    openaiParams.stream_options = { include_usage: true };

    const streamResponse = await client.chat.completions.create(openaiParams);

    return honoStream(c, async (stream) => {
      c.header("Content-Type", "application/x-ndjson");
      c.header("Transfer-Encoding", "chunked");

      const state: StreamState = {
        thinkingBuffer: "",
        inThinking: false,
        toolCallBuffers: new Map(),
      };

      const iter = streamResponse as AsyncIterable<
        import("openai").ChatCompletionChunk
      >;

      try {
        for await (const chunk of iter) {
          // Skip chunks with no choices (e.g., final usage-only chunk that has empty choices)
          if (!chunk.choices?.length && !chunk.usage) continue;

          // Handle final usage-only chunk
          if (!chunk.choices?.length && chunk.usage) {
            const finalChunk = {
              model: modelCfg.alias,
              created_at: new Date().toISOString(),
              message: { role: "assistant" as const, content: "" },
              done: true,
              done_reason: "stop",
              prompt_eval_count: chunk.usage.prompt_tokens,
              eval_count: chunk.usage.completion_tokens,
              total_duration: 0,
              load_duration: 0,
              prompt_eval_duration: 0,
              eval_duration: 0,
            };
            await stream.write(JSON.stringify(finalChunk) + "\n");
            continue;
          }

          const ollamaChunk = deltaToOllamaChunk(
            chunk,
            modelCfg.alias,
            think,
            state,
          );
          await stream.write(JSON.stringify(ollamaChunk) + "\n");
        }
      } catch (err) {
        console.error("Stream error (ollama):", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorChunk = {
          model: modelCfg.alias,
          created_at: new Date().toISOString(),
          message: { role: "assistant" as const, content: "" },
          done: true,
          done_reason: "error",
          error: errMsg,
        };
        await stream.write(JSON.stringify(errorChunk) + "\n");
      }
    });
  }

  // Non-streaming
  openaiParams.stream = false;
  const completion = (await client.chat.completions.create(
    openaiParams,
  )) as import("openai").ChatCompletion;
  const ollamaResponse = toOllamaResponse(completion, modelCfg.alias, think);
  return c.json(ollamaResponse);
});

export { chat };