import { Hono } from "hono";
import { cors } from "hono/cors";
import { timing } from "hono/timing";
import type { ResolvedConfig } from "./config/loader.ts";
import { UpstreamPool } from "./upstream/client.ts";
import { Logger } from "./util/logger.ts";
import { metaRoutes } from "./routes/meta.ts";
import { chatRoutes } from "./routes/chat.ts";
import { generateRoutes } from "./routes/generate.ts";
import { embedRoutes } from "./routes/embed.ts";
import { ModelNotFoundError } from "./config/loader.ts";

export const createApp = (cfg: ResolvedConfig) => {
    const log = new Logger(cfg.raw.logging.level);
    const pool = new UpstreamPool(cfg);

    const app = new Hono();

    // 中间件
    app.use("*", cors());
    app.use("*", timing());

    // 请求日志
    app.use("*", async (c, next) => {
        const start = performance.now();
        await next();
        if (cfg.raw.logging.logRequests) {
            const ms = (performance.now() - start).toFixed(1);
            log.info(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
        }
    });

    // ModelNotFoundError → 404
    app.onError((err, c) => {
        if (err instanceof ModelNotFoundError) {
            return c.json({ error: err.message }, 404);
        }
        log.error("unhandled:", err.message);
        return c.json({ error: err.message }, 500);
    });

    // 挂路由
    app.route("/", metaRoutes(cfg));
    app.route("/", chatRoutes(cfg, pool, log));
    app.route("/", generateRoutes(cfg, pool, log));
    app.route("/", embedRoutes(cfg, pool, log));

    // 兜底
    // /api/pull /api/push /api/copy /api/delete /api/create — 代理不支持
    app.all("/api/pull", (c) =>
        c.json({ error: "pull is not supported by proxy" }, 501),
    );
    app.all("/api/push", (c) =>
        c.json({ error: "push is not supported by proxy" }, 501),
    );
    app.all("/api/copy", (c) =>
        c.json({ error: "copy is not supported by proxy" }, 501),
    );
    app.all("/api/delete", (c) =>
        c.json({ error: "delete is not supported by proxy" }, 501),
    );
    app.all("/api/create", (c) =>
        c.json({ error: "create is not supported by proxy" }, 501),
    );

    return { app, log, pool };
};