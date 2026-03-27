import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { testRuns, testResults } from "../db/schema.js";

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function registerResultsRoutes(app: FastifyInstance): void {
  app.get("/api/runs", async (request, reply) => {
    const query = request.query as { limit?: string; status?: string };
    const parsed = parseInt(query.limit ?? "20", 10);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20;
    const db = getDb();

    let rows = db.select().from(testRuns).orderBy(desc(testRuns.createdAt)).all();

    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }

    rows = rows.slice(0, limit);

    return reply.send({
      results: rows.map((r) => ({
        ...r,
        resultsSummaryJson: safeJsonParse(r.resultsSummaryJson),
      })),
    });
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const db = getDb();

    const run = db.select().from(testRuns).where(eq(testRuns.id, runId)).get();
    if (!run) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const results = db.select().from(testResults).where(eq(testResults.runId, runId)).all();

    return reply.send({
      run: {
        ...run,
        resultsSummaryJson: safeJsonParse(run.resultsSummaryJson),
      },
      results: results.map((r) => ({
        id: r.id,
        testId: r.testId,
        testName: r.testName,
        status: r.status,
        duration: r.duration,
        result: safeJsonParse(r.resultJson),
        analysis: safeJsonParse(r.analysisJson),
        createdAt: r.createdAt,
      })),
    });
  });

  app.get("/api/status", async (_request, reply) => {
    const db = getDb();
    const allRuns = db.select().from(testRuns).all();
    const completedRuns = allRuns.filter((r) => r.status === "completed");
    const runningRuns = allRuns.filter((r) => r.status === "running");

    return reply.send({
      status: "healthy",
      version: "0.1.0",
      stats: {
        totalRuns: allRuns.length,
        completedRuns: completedRuns.length,
        runningRuns: runningRuns.length,
      },
    });
  });
}
