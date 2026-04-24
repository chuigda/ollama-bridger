import { Hono } from "hono";
import type { ResolvedConfig } from "../config/loader.js";
import type { UpstreamPool } from "../upstream/client.js";
import type { Logger } from "../util/logger.js";
import type { OllamaEmbedRequest } from "../ollama/types.js";
import {
    buildEmbedParams,
    normalizeEmbedInput,
    openAIEmbedToOllama,
} from "../translate/embed.js";

export const embedRoutes = (
    cfg: ResolvedConfig,
    pool: UpstreamPool,
    log: Logger,
) => {
    const app = new Hono();

    // 新版 /api/embed
    app.post("/api/embed", async (c) => {
        const body = (await c.req.json()) as OllamaEmbedRequest;
        if (!body?.model) {
            return c.json({ error: "missing model" }, 400);
        }
        const inputs = normalizeEmbedInput(body);
        if (inputs.length === 0) {
            return c.json({ error: "missing input" }, 400);
        }

        const { upstreamName, remoteModel } = cfg.resolveModel(body.model);
        const client = pool.get(upstreamName);
        const params = buildEmbedParams(body, remoteModel);

        if (cfg.raw.logging.logRequests) {
            log.info(
                `POST /api/embed model=${body.model} → ${upstreamName}:${remoteModel} n=${inputs.length}`,
            );
        }

        const startNs = process.hrtime.bigint();
        try {
            const res = await client.embeddings.create(params);
            return c.json(openAIEmbedToOllama(res, body.model, startNs));
        } catch (e) {
            log.error("embed error:", (e as Error).message);
            return c.json({ error: (e as Error).message }, 502);
        }
    });

    // 旧版 /api/embeddings（兼容 ollama <0.4）
    // 请求体用 { model, prompt }，响应只返回单个 embedding
    app.post("/api/embeddings", async (c) => {
        const body = (await c.req.json()) as OllamaEmbedRequest;
        if (!body?.model || typeof body.prompt !== "string") {
            return c.json({ error: "missing model or prompt" }, 400);
        }

        const { upstreamName, remoteModel } = cfg.resolveModel(body.model);
        const client = pool.get(upstreamName);

        if (cfg.raw.logging.logRequests) {
            log.info(
                `POST /api/embeddings model=${body.model} → ${upstreamName}:${remoteModel}`,
            );
        }

        try {
            const res = await client.embeddings.create({
                model: remoteModel,
                input: body.prompt,
            });
            const embedding = res.data[0]?.embedding ?? [];
            return c.json({ embedding });
        } catch (e) {
            log.error("embeddings error:", (e as Error).message);
            return c.json({ error: (e as Error).message }, 502);
        }
    });

    return app;
};