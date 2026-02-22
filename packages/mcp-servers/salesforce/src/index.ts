#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SalesforceMcpServer } from "./server.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("mcp-server-salesforce");

async function main() {
  const sfServer = new SalesforceMcpServer();
  const transport = new StdioServerTransport();
  await sfServer.getServer().connect(transport);
  logger.info("Salesforce MCP Server running on stdio");

  const shutdown = async () => {
    logger.info("Shutting down Salesforce MCP Server");
    await sfServer.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start Salesforce MCP Server");
  process.exit(1);
});
