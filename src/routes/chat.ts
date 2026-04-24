import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { ResolvedConfig } from "../config/loader.js";
import type { UpstreamPool } from "../upstream/client.js";
import type { Logger } from "../util/logger.js";
import type { OllamaChatRequest } from "../ollama/types.js";
import {
    ChatStreamTranslator,
    buildChatParams,
    openAIChatToOllama,
} from "../translate/chat.js";

export const chatRoutes = (
    cfg: ResolvedConfig,
    pool: UpstreamPool,
    log: Logger,
) => {
    const app = new Hono();

    app.post("/api/chat", async (c) => {
        const body = (await c.req.json()) as OllamaChatRequest;
        if (!body?.model || !Array.isArray(body.messages)) {
            return c.json({ error: "invalid request" }, 400);
        }
        const stream$ = body.stream !== false; // 默认 true（Ollama 行为）
        const { upstream, upstreamName, remoteModel } = cfg.resolveModel(body.model);
        const client = pool.get(upstreamName);
        const params = buildChatParams(body, remoteModel);

        if (cfg.raw.logging.logRequests) {
            log.info(
                `POST /api/chat model=${body.model} → ${upstreamName}:${remoteModel} stream=${stream$} msgs=${body.messages.length}`,
            );
        }

        const startMs = performance.now();

        if (!stream$) {
            try {
                const res = await client.chat.completions.create({
                    ...params,
                    stream: false,
                });
                return c.json(openAIChatToOllama(res, body.model, startMs));
            } catch (e) {
                log.error("chat error:", (e as Error).message);
                return c.json({ error: (e as Error).message }, 502);
            }
        }

        // 流式
        return stream(c, async (s) => {
            s.onAbort(() => log.debug("chat stream aborted by client"));
            c.header("Content-Type", "application/x-ndjson");
            c.header("Cache-Control", "no-store");

            const translator = new ChatStreamTranslator(body.model);
            try {
                const iter = await client.chat.completions.create({
                    ...params,
                    stream: true,
                    stream_options: { include_usage: true },
                });
                for await (const chunk of iter) {
                    const out = translator.handleChunk(chunk);
                    if (out) await s.write(JSON.stringify(out) + "\n");
                }
                await s.write(JSON.stringify(translator.finalize()) + "\n");
            } catch (e) {
                log.error("chat stream error:", (e as Error).message);
                await s.write(
                    JSON.stringify({
                        model: body.model,
                        created_at: new Date().toISOString(),
                        message: { role: "assistant", content: "" },
                        done: true,
                        done_reason: "error",
                        error: (e as Error).message,
                    }) + "\n",
                );
            }
        });
    });

    return app;
};