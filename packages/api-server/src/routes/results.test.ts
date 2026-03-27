import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { registerResultsRoutes } from "./results.js";

// ─── In-memory DB setup ───────────────────────────────────────────────────────

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let testDb: TestDb;

vi.mock("../db/connection.js", () => ({
  getDb: () => testDb,
}));

function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      test_plan_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      environment TEXT NOT NULL DEFAULT 'default',
      parallel INTEGER DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      results_summary_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL,
      analysis_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

// ─── App factory ─────────────────────────────────────────────────────────────

async function makeApp() {
  const app = Fastify({ logger: false });
  registerResultsRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/runs", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty list when no runs exist", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ results: unknown[] }>();
    expect(body.results).toEqual([]);
  });

  it("returns seeded runs", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.testRuns).values({
      id: "run-1",
      status: "completed",
      environment: "staging",
      createdAt: now,
    }).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ results: Array<{ id: string; status: string }> }>();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe("run-1");
    expect(body.results[0].status).toBe("completed");
  });

  it("filters by status query param", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.testRuns).values([
      { id: "r1", status: "completed", environment: "default", createdAt: now },
      { id: "r2", status: "running", environment: "default", createdAt: now },
    ]).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs?status=completed" });
    const body = res.json<{ results: Array<{ id: string }> }>();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe("r1");
  });

  it("respects limit query param", async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      testDb.insert(schema.testRuns).values({
        id: `run-${i}`,
        status: "completed",
        environment: "default",
        createdAt: now,
      }).run();
    }

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs?limit=2" });
    const body = res.json<{ results: unknown[] }>();
    expect(body.results).toHaveLength(2);
  });
});

describe("GET /api/runs/:runId", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 for unknown run", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe("Run not found");
  });

  it("returns run with results", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.testRuns).values({
      id: "run-abc",
      status: "completed",
      environment: "default",
      resultsSummaryJson: JSON.stringify({ passed: 1, failed: 0 }),
      createdAt: now,
    }).run();
    testDb.insert(schema.testResults).values({
      id: "result-1",
      runId: "run-abc",
      testId: "t1",
      testName: "Login test",
      status: "success",
      duration: 200,
      resultJson: JSON.stringify({ ok: true }),
      createdAt: now,
    }).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/runs/run-abc" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      run: { id: string; status: string; resultsSummaryJson: { passed: number } };
      results: Array<{ testName: string; status: string }>;
    }>();
    expect(body.run.id).toBe("run-abc");
    expect(body.run.resultsSummaryJson).toEqual({ passed: 1, failed: 0 });
    expect(body.results).toHaveLength(1);
    expect(body.results[0].testName).toBe("Login test");
    expect(body.results[0].status).toBe("success");
  });
});

describe("GET /api/status", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns healthy status with stats", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.testRuns).values([
      { id: "r1", status: "completed", environment: "default", createdAt: now },
      { id: "r2", status: "running", environment: "default", createdAt: now },
    ]).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      status: string;
      version: string;
      stats: { totalRuns: number; completedRuns: number; runningRuns: number };
    }>();
    expect(body.status).toBe("healthy");
    expect(body.version).toBe("0.1.0");
    expect(body.stats.totalRuns).toBe(2);
    expect(body.stats.completedRuns).toBe(1);
    expect(body.stats.runningRuns).toBe(1);
  });
});
