import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { createLogger } from "@test-automation-mcp/core";
import { LLMRouter, LLMConfigSchema } from "@test-automation-mcp/llm";
import { RequirementExtractor } from "./services/requirement-extractor.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerTestPlanRoutes } from "./routes/test-plans.js";
import { registerExecutionRoutes } from "./routes/execution.js";
import { registerResultsRoutes } from "./routes/results.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { getDb } from "./db/connection.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

  const wsClients = new Map<string, Set<(msg: string) => void>>();

  registerDocumentRoutes(app, extractor);
  registerTestPlanRoutes(app);
  registerExecutionRoutes(app, wsClients);
  registerResultsRoutes(app);
  registerConnectorRoutes(app, extractor);

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

  return app;
}
