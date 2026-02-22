#!/usr/bin/env node

import { createServer } from "./server.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-server");

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function main() {
  const server = await createServer({
    port: PORT,
    host: HOST,
    llm: {
      provider: process.env["LLM_PROVIDER"] ?? "ollama",
      model: process.env["LLM_MODEL"] ?? "llama3",
      baseUrl: process.env["LLM_BASE_URL"],
      apiKey: process.env["LLM_API_KEY"],
    },
    dbPath: process.env["DB_PATH"] ?? "./data/tamcp.db",
  });

  await server.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, "API server started");

  process.on("SIGINT", async () => {
    logger.info("Shutting down API server");
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start API server");
  process.exit(1);
});
