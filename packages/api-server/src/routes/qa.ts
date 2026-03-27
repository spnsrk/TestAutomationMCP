import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { qaRuns } from "../db/schema.js";
import { QAAgent } from "@test-automation-mcp/agent-qa";
import type { QAInput, QAEvent } from "@test-automation-mcp/agent-qa";
import { McpRouter } from "@test-automation-mcp/gateway";
import type { GatewayServer } from "@test-automation-mcp/gateway";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-qa");

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function registerQARoutes(
  app: FastifyInstance,
  gateway: GatewayServer | null,
  wsClients: Map<string, Set<(msg: string) => void>>
): void {

  /**
   * POST /api/qa/run
   * Start a new AI QA run. Accepts any QAInput type.
   * Returns immediately with a runId; client can subscribe to
   * /ws/qa/:runId for live events.
   */
  app.post("/api/qa/run", async (request, reply) => {
    const body = request.body as {
      input: QAInput;
      environment?: string;
      model?: string;
    };

    if (!body.input) {
      return reply.status(400).send({ error: "input is required" });
    }

    const apiKey =
      process.env["ANTHROPIC_API_KEY"] ??
      process.env["LLM_API_KEY"] ??
      "";

    if (!apiKey) {
      return reply.status(400).send({
        error: "ANTHROPIC_API_KEY is not configured. Set it in your .env file.",
      });
    }

    if (!gateway) {
      logger.warn("No gateway — QA agent will reason without tool execution");
    }

    const runId = uuid();
    const now = new Date().toISOString();
    const environment = body.environment ?? "default";

    // Determine a title from the input for display
    const inputTitle = body.input.type === "text"
      ? (body.input.title ?? "Pasted Requirement")
      : body.input.type === "jira"
      ? `Jira: ${body.input.issueKeyOrUrl}`
      : body.input.type === "github"
      ? `GitHub: ${body.input.repo}`
      : body.input.filePath ?? "Document";

    const db = getDb();
    db.insert(qaRuns).values({
      id: runId,
      title: inputTitle,
      source: body.input.type,
      environment,
      status: "running",
      startedAt: now,
      createdAt: now,
    }).run();

    reply.status(202).send({ runId, status: "running", title: inputTitle });

    // Broadcast helper for this run's WebSocket channel
    const broadcast = (event: QAEvent) => {
      const clients = wsClients.get(`qa:${runId}`);
      if (clients) {
        const payload = JSON.stringify(event);
        for (const send of clients) {
          send(payload);
        }
      }
    };

    setImmediate(async () => {
      try {
        const router = gateway ? gateway.getRouter() : new McpRouter();
        const agent = new QAAgent({
          apiKey,
          router,
          model: body.model,
        });

        const result = await agent.run({
          input: body.input,
          environment,
          onEvent: (event) => {
            broadcast(event);
            if (event.type === "tool_call") {
              logger.debug({ runId, tool: event.tool }, "Tool called");
            }
          },
        });

        db.update(qaRuns)
          .set({
            status: "completed",
            reportJson: JSON.stringify(result.report),
            reportMarkdown: result.reportMarkdown,
            completedAt: new Date().toISOString(),
          })
          .where(eq(qaRuns.id, runId))
          .run();

        logger.info(
          {
            runId,
            passed: result.report.summary.passed,
            failed: result.report.summary.failed,
            riskLevel: result.report.summary.riskLevel,
          },
          "QA run completed"
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ runId, error: message }, "QA run failed");

        db.update(qaRuns)
          .set({
            status: "failed",
            errorMessage: message,
            completedAt: new Date().toISOString(),
          })
          .where(eq(qaRuns.id, runId))
          .run();

        broadcast({ type: "error", runId, message });
      }
    });
  });

  /**
   * GET /api/qa/runs
   * List all QA runs (latest first).
   */
  app.get("/api/qa/runs", async (request, reply) => {
    const query = request.query as { limit?: string; status?: string };
    const limit = Math.min(parseInt(query.limit ?? "20", 10) || 20, 100);
    const db = getDb();

    let rows = db.select().from(qaRuns).orderBy(desc(qaRuns.createdAt)).all();

    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }

    return reply.send({
      runs: rows.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source,
        environment: r.environment,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
        summary: r.reportJson
          ? (safeJsonParse(r.reportJson) as Record<string, unknown>)?.summary
          : null,
        errorMessage: r.errorMessage,
      })),
    });
  });

  /**
   * GET /api/qa/runs/:id
   * Full detail for a single QA run including the complete report.
   */
  app.get("/api/qa/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const row = db.select().from(qaRuns).where(eq(qaRuns.id, id)).get();
    if (!row) {
      return reply.status(404).send({ error: "QA run not found" });
    }

    return reply.send({
      id: row.id,
      title: row.title,
      source: row.source,
      environment: row.environment,
      status: row.status,
      report: safeJsonParse(row.reportJson),
      reportMarkdown: row.reportMarkdown,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
    });
  });

  /**
   * WebSocket: /ws/qa/:runId
   * Subscribe to live events for a QA run.
   */
  app.register(async function (wsApp) {
    wsApp.get("/ws/qa/:runId", { websocket: true }, (socket, request) => {
      const { runId } = request.params as { runId: string };
      const key = `qa:${runId}`;

      if (!wsClients.has(key)) wsClients.set(key, new Set());

      const sender = (msg: string) => {
        try { socket.send(msg); } catch { /* client disconnected */ }
      };

      wsClients.get(key)!.add(sender);

      socket.on("close", () => {
        wsClients.get(key)?.delete(sender);
        if (wsClients.get(key)?.size === 0) wsClients.delete(key);
      });
    });
  });
}
