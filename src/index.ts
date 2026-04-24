import { serve } from "@hono/node-server";
import { loadConfig } from "./config/loader.js";
import { createApp } from "./server.js";

const main = async () => {
  const cfg = await loadConfig();
  const { app, log } = createApp(cfg);

  const { host, port } = cfg.raw.server;
  serve(
    {
      fetch: app.fetch,
      hostname: host,
      port,
    },
    (info) => {
      log.info(`Ollama-compatible proxy listening on http://${info.address}:${info.port}`);
      log.info(
        `Upstreams: ${[...cfg.upstreams.keys()].join(", ")} | Models: ${cfg.raw.models.length}`,
      );
    },
  );
};

main().catch((e: unknown) => {
  console.error("Fatal:", e);
  process.exit(1);
});