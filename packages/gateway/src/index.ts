#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger, GatewayConfigSchema } from "@test-automation-mcp/core";
import { GatewayServer } from "./server.js";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { existsSync } from "node:fs";

const logger = createLogger("gateway");

const DEFAULT_CONFIG = {
  port: 3100,
  host: "localhost",
  logLevel: "info" as const,
  environments: {
    default: {
      name: "default",
      description: "Default local environment",
    },
  },
  defaultEnvironment: "default",
  mcpServers: {},
  execution: {
    maxParallelTests: 4,
    defaultTimeout: 300000,
    retryAttempts: 1,
    retryDelay: 5000,
  },
  reporting: {
    outputDir: "./reports",
    formats: ["json" as const],
    screenshotsOnFailure: true,
  },
};

async function loadConfig() {
  const configPaths = [
    "./config/gateway.yaml",
    "./config/gateway.yml",
    "./config/gateway.json",
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      logger.info({ path: configPath }, "Loading configuration");
      const content = await readFile(configPath, "utf-8");
      const raw = configPath.endsWith(".json")
        ? JSON.parse(content)
        : parseYaml(content);
      return GatewayConfigSchema.parse(raw);
    }
  }

  logger.info("No config file found, using defaults");
  return GatewayConfigSchema.parse(DEFAULT_CONFIG);
}

async function main() {
  const config = await loadConfig();
  const gateway = new GatewayServer(config);

  await gateway.initialize();

  const transport = new StdioServerTransport();
  await gateway.getServer().connect(transport);
  logger.info("Gateway MCP Server running on stdio");

  process.on("SIGINT", async () => {
    logger.info("Shutting down gateway");
    await gateway.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ error: err }, "Failed to start Gateway");
  process.exit(1);
});
