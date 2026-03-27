import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { createLogger, GatewayConfigSchema } from "@test-automation-mcp/core";
import { GatewayServer } from "@test-automation-mcp/gateway";
import { LLMRouter, LLMConfigSchema } from "@test-automation-mcp/llm";
import { RequirementExtractor } from "./services/requirement-extractor.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerTestPlanRoutes } from "./routes/test-plans.js";
import { registerExecutionRoutes } from "./routes/execution.js";
import { registerResultsRoutes } from "./routes/results.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerQARoutes } from "./routes/qa.js";
import { getDb } from "./db/connection.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const logger = createLogger("api-server");

export interface ApiServerConfig {
  port: number;
  host: string;
  llm?: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  };
  dbPath?: string;
  dashboardPath?: string;
  /** Path to gateway.yaml config; defaults to ./config/gateway.yaml */
  gatewayConfigPath?: string;
}

export async function createServer(config: ApiServerConfig) {
  const app = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024, // 50MB for document uploads
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(websocket);

  const dashboardDir = config.dashboardPath
    ? resolve(config.dashboardPath)
    : resolve("../dashboard/out");

  if (existsSync(dashboardDir)) {
    await app.register(fastifyStatic, {
      root: dashboardDir,
      prefix: "/",
      wildcard: false,
    });
  }

  getDb(config.dbPath);

  const llmConfig = LLMConfigSchema.parse(config.llm ?? {});
  const llmRouter = new LLMRouter(llmConfig);
  const extractor = new RequirementExtractor(llmRouter);

  // ── Gateway: load config and initialise all MCP servers ───────────────────
  const gatewayConfigPath = config.gatewayConfigPath ?? "./config/gateway.yaml";
  let gateway: GatewayServer | null = null;
  try {
    if (existsSync(gatewayConfigPath)) {
      const raw = parseYaml(readFileSync(gatewayConfigPath, "utf-8"));
      const gatewayConfig = GatewayConfigSchema.parse(raw);
      gateway = new GatewayServer(gatewayConfig);
      await gateway.initialize();
      logger.info("Gateway initialised with real MCP servers");
    } else {
      logger.warn({ path: gatewayConfigPath }, "Gateway config not found — tool execution will be simulated");
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, "Gateway init failed — tool execution will be simulated");
    gateway = null;
  }

  const wsClients = new Map<string, Set<(msg: string) => void>>();

  registerDocumentRoutes(app, extractor);
  registerTestPlanRoutes(app);
  registerExecutionRoutes(app, wsClients, gateway);
  registerResultsRoutes(app);
  registerConnectorRoutes(app, extractor);
  registerQARoutes(app, gateway, wsClients);

  app.register(async function (wsApp) {
    wsApp.get("/ws/runs/:runId", { websocket: true }, (socket, request) => {
      const { runId } = request.params as { runId: string };
      if (!wsClients.has(runId)) {
        wsClients.set(runId, new Set());
      }
      const sender = (msg: string) => {
        try { socket.send(msg); } catch { /* client disconnected */ }
      };
      wsClients.get(runId)!.add(sender);
      socket.on("close", () => {
        wsClients.get(runId)?.delete(sender);
        if (wsClients.get(runId)?.size === 0) {
          wsClients.delete(runId);
        }
      });
    });
  });

  app.get("/api/config/llm", async (_request, reply) => {
    return reply.send({
      provider: llmConfig.provider,
      model: llmConfig.model,
      available: await llmRouter.isAvailable(),
    });
  });

  app.get("/api/config/environments", async (_request, reply) => {
    return reply.send({
      environments: [
        { name: "default", description: "Local development environment" },
        { name: "staging", description: "Staging environment" },
      ],
    });
  });

  app.addHook("onClose", async () => {
    if (gateway) {
      await gateway.shutdown();
      logger.info("Gateway shut down");
    }
  });

  return app;
}
