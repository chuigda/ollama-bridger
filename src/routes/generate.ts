import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { ResolvedConfig } from "../config/loader.js";
import type { UpstreamPool } from "../upstream/client.js";
import type { Logger } from "../util/logger.js";
import type { OllamaGenerateRequest } from "../ollama/types.js";
import {
    GenerateStreamTranslator,
    buildGenerateParams,
    openAIChatToOllamaGenerate,
} from "../translate/chat.js";

export const generateRoutes = (
    cfg: ResolvedConfig,
    pool: UpstreamPool,
    log: Logger,
) => {
    const app = new Hono();

    app.post("/api/generate", async (c) => {
        const body = (await c.req.json()) as OllamaGenerateRequest;
        if (!body?.model || typeof body.prompt !== "string") {
            return c.json({ error: "invalid request" }, 400);
        }
        const stream$ = body.stream !== false;
        const { upstreamName, remoteModel } = cfg.resolveModel(body.model);
        const client = pool.get(upstreamName);
        const params = buildGenerateParams(body, remoteModel);

        if (cfg.raw.logging.logRequests) {
            log.info(
                `POST /api/generate model=${body.model} → ${upstreamName}:${remoteModel} stream=${stream$}`,
            );
        }
        const startMs = performance.now();

        if (!stream$) {
            try {
                const res = await client.chat.completions.create({
                    ...params,
                    stream: false,
                });
                return c.json(openAIChatToOllamaGenerate(res, body.model, startMs));
            } catch (e) {
                log.error("generate error:", (e as Error).message);
                return c.json({ error: (e as Error).message }, 502);
            }
        }

        return stream(c, async (s) => {
            c.header("Content-Type", "application/x-ndjson");
            c.header("Cache-Control", "no-store");
            const tr = new GenerateStreamTranslator(body.model);
            try {
                const iter = await client.chat.completions.create({
                    ...params,
                    stream: true,
                    stream_options: { include_usage: true },
                });
                for await (const chunk of iter) {
                    const out = tr.handleChunk(chunk);
                    if (out) await s.write(JSON.stringify(out) + "\n");
                }
                await s.write(JSON.stringify(tr.finalize()) + "\n");
            } catch (e) {
                log.error("generate stream error:", (e as Error).message);
                await s.write(
                    JSON.stringify({
                        model: body.model,
                        created_at: new Date().toISOString(),
                        response: "",
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