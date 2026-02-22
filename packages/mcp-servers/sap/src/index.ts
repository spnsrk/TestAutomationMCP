#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SapMcpServer } from "./server.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("mcp-server-sap");

async function main() {
  const sapServer = new SapMcpServer();
  const transport = new StdioServerTransport();
  await sapServer.getServer().connect(transport);
  logger.info("SAP MCP Server running on stdio");

  const shutdown = async () => {
    logger.info("Shutting down SAP MCP Server");
    await sapServer.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start SAP MCP Server");
  process.exit(1);
});
