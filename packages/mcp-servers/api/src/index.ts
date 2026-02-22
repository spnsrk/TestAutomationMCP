#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiMcpServer } from "./server.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("mcp-server-api");

async function main() {
  const apiServer = new ApiMcpServer();
  const transport = new StdioServerTransport();
  await apiServer.getServer().connect(transport);
  logger.info("API MCP Server running on stdio");

  process.on("SIGINT", () => {
    logger.info("Shutting down");
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start API MCP Server");
  process.exit(1);
});
