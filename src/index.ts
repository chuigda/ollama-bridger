import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { loadConfig } from "./config.ts";
import { models } from "./routes/models.ts";
import { chat } from "./routes/chat.ts";
import { show } from "./routes/show.ts";

async function main(): Promise<void> {
  const configPath = process.argv[2];
  const config = await loadConfig(configPath);

  const app = new Hono();

  // Middleware
  app.use(logger());

  // Global error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  });

  // 404 handler
  app.notFound((c) =>
    c.json({ error: `not found: ${c.req.method} ${c.req.path}` }, 404),
  );

  // Health check — Ollama returns 200 on GET /
  app.get("/", (c) => c.text("Ollama is running"));

  // Version endpoint
  app.get("/api/version", (c) =>
    c.json({ version: "0.6.4" }),
  );

  // Mount routes
  app.route("/", models);
  app.route("/", chat);
  app.route("/", show);

  // Start server
  const { host, port } = config;

  console.log(`\n🚀 Ollama-compatible proxy server`);
  console.log(`   Listening on http://${host}:${port}`);
  console.log(`   Providers:`);
  for (const p of config.providers) {
    console.log(`     • ${p.name} (${p.baseURL}) — ${p.models.length} model(s)`);
    for (const m of p.models) {
      const features = [
        m.supportsVision && "vision",
        m.supportsTools && "tools",
        m.supportsReasoning && `reasoning(${m.defaultReasoningEffort ?? "medium"})`,
      ].filter(Boolean);
      console.log(`       ↳ ${m.alias} → ${m.id} [${features.join(", ")}]`);
    }
  }
  console.log();

  const server = serve({
    fetch: app.fetch,
    hostname: host,
    port,
  }) as Server;

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n⏳ Shutting down gracefully...");
    server.close(() => {
      console.log("✅ Server closed");
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});