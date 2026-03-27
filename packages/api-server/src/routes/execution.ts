import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { testPlans, testDefinitions, testRuns, testResults } from "../db/schema.js";
import { ExecutorAgent } from "@test-automation-mcp/agent-executor";
import { AnalyzerAgent } from "@test-automation-mcp/agent-analyzer";
import type { GatewayServer } from "@test-automation-mcp/gateway";
import type { TestDefinition, ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-execution");

function createSimulatedToolCaller() {
  return {
    async callTool(toolName: string, _params: Record<string, unknown>): Promise<ToolResult> {
      await new Promise((r) => setTimeout(r, 50));
      return {
        status: "success" as const,
        tool: toolName,
        duration: 50,
        data: { simulated: true, tool: toolName },
      };
    },
  };
}

function createGatewayToolCaller(gateway: GatewayServer) {
  return {
    async callTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
      return gateway.getRouter().callTool(toolName, params);
    },
  };
}

export function registerExecutionRoutes(
  app: FastifyInstance,
  wsClients: Map<string, Set<(msg: string) => void>>,
  gateway: GatewayServer | null
): void {
  app.post("/api/tests/run", async (request, reply) => {
    const body = request.body as {
      testPlanId?: string;
      testDefinitionIds?: string[];
      environment?: string;
      parallel?: boolean;
    };

    const db = getDb();
    const runId = uuid();
    const now = new Date().toISOString();
    const environment = body.environment ?? "default";

    let definitions: TestDefinition[] = [];

    if (body.testPlanId) {
      const defRows = db.select().from(testDefinitions)
        .where(eq(testDefinitions.testPlanId, body.testPlanId))
        .all();
      definitions = defRows.map((r) => JSON.parse(r.definitionJson) as TestDefinition);
    } else if (body.testDefinitionIds && body.testDefinitionIds.length > 0) {
      for (const defId of body.testDefinitionIds) {
        const row = db.select().from(testDefinitions).where(eq(testDefinitions.id, defId)).get();
        if (row) {
          definitions.push(JSON.parse(row.definitionJson) as TestDefinition);
        }
      }
    }

    if (definitions.length === 0) {
      return reply.status(400).send({ error: "No test definitions found" });
    }

    db.insert(testRuns).values({
      id: runId,
      testPlanId: body.testPlanId ?? null,
      status: "running",
      environment,
      parallel: body.parallel ?? false,
      startedAt: now,
      createdAt: now,
    }).run();

    const broadcast = (msg: object) => {
      const clients = wsClients.get(runId);
      if (clients) {
        const payload = JSON.stringify(msg);
        for (const send of clients) {
          send(payload);
        }
      }
    };

    broadcast({ type: "run_started", runId, testCount: definitions.length });
    reply.status(202).send({ runId, status: "running", testCount: definitions.length });

    setImmediate(async () => {
      try {
        const toolCaller = gateway
          ? createGatewayToolCaller(gateway)
          : createSimulatedToolCaller();

        if (!gateway) {
          logger.warn({ runId }, "No gateway available — running in simulation mode");
        }

        const executor = new ExecutorAgent(toolCaller);
        const execResponse = await executor.execute({
          tests: definitions,
          environment,
          parallel: body.parallel,
        });

        const resultNow = new Date().toISOString();
        for (const result of execResponse.results) {
          db.insert(testResults).values({
            id: uuid(),
            runId,
            testId: result.testId,
            testName: result.testName,
            status: result.status,
            duration: result.duration,
            resultJson: JSON.stringify(result),
            createdAt: resultNow,
          }).run();

          broadcast({
            type: "test_completed",
            testId: result.testId,
            testName: result.testName,
            status: result.status,
            duration: result.duration,
          });
        }

        const analyzer = new AnalyzerAgent();
        const analysis = await analyzer.analyze({ results: execResponse.results });

        const passed = execResponse.results.filter((r) => r.status === "success").length;
        const failed = execResponse.results.filter((r) => r.status === "failure").length;
        const errors = execResponse.results.filter((r) => r.status === "error").length;

        const summary = {
          total: execResponse.results.length,
          passed,
          failed,
          errors,
          passRate: execResponse.results.length > 0 ? (passed / execResponse.results.length) * 100 : 0,
          analysis: analysis.summary,
          recommendations: analysis.recommendations,
          failures: analysis.failures,
          simulated: !gateway,
        };

        db.update(testRuns)
          .set({
            status: "completed",
            finishedAt: new Date().toISOString(),
            resultsSummaryJson: JSON.stringify(summary),
          })
          .where(eq(testRuns.id, runId))
          .run();

        broadcast({ type: "run_completed", runId, summary });
      } catch (err) {
        logger.error({ runId, error: err instanceof Error ? err.message : String(err) }, "Run failed");
        db.update(testRuns)
          .set({
            status: "failed",
            finishedAt: new Date().toISOString(),
            resultsSummaryJson: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          })
          .where(eq(testRuns.id, runId))
          .run();
        broadcast({ type: "run_failed", runId, error: err instanceof Error ? err.message : String(err) });
      }
    });
  });

}
