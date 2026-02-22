#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebMcpServer } from "./server.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("mcp-server-web");

async function main() {
  const webServer = new WebMcpServer();
  const transport = new StdioServerTransport();
  await webServer.getServer().connect(transport);
  logger.info("Web MCP Server running on stdio");

  process.on("SIGINT", async () => {
    logger.info("Shutting down");
    await webServer.cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start Web MCP Server");
  process.exit(1);
});
