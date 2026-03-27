import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { registerQARoutes } from "./qa.js";

// ─── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock("@test-automation-mcp/agent-qa", () => ({
  QAAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({
      runId: "mock-run",
      report: {
        summary: { passed: 1, failed: 0, riskLevel: "LOW" },
        testCases: [],
        recommendations: [],
        narrative: "All good",
      },
      reportMarkdown: "# Report\nAll good",
    }),
  })),
}));

vi.mock("@test-automation-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@test-automation-mcp/core")>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

// ─── In-memory DB setup ───────────────────────────────────────────────────────

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let testDb: TestDb;

vi.mock("../db/connection.js", () => ({
  getDb: () => testDb,
}));

function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qa_runs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'running',
      report_json TEXT,
      report_markdown TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

// ─── App factory ─────────────────────────────────────────────────────────────

async function makeApp() {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  const wsClients = new Map<string, Set<(msg: string) => void>>();
  registerQARoutes(app, null, wsClients);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/qa/runs", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty list when no QA runs exist", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ runs: unknown[] }>().runs).toEqual([]);
  });

  it("returns seeded QA runs", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.qaRuns).values({
      id: "qa-1",
      title: "Login page test",
      source: "text",
      environment: "staging",
      status: "completed",
      startedAt: now,
      createdAt: now,
    }).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ runs: Array<{ id: string; title: string; status: string }> }>();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].id).toBe("qa-1");
    expect(body.runs[0].title).toBe("Login page test");
    expect(body.runs[0].status).toBe("completed");
  });

  it("filters by status", async () => {
    const now = new Date().toISOString();
    testDb.insert(schema.qaRuns).values([
      { id: "qa-1", title: "Test A", source: "text", status: "completed", startedAt: now, createdAt: now },
      { id: "qa-2", title: "Test B", source: "text", status: "running", startedAt: now, createdAt: now },
    ]).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs?status=running" });
    const body = res.json<{ runs: Array<{ id: string }> }>();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].id).toBe("qa-2");
  });

  it("exposes summary from reportJson", async () => {
    const now = new Date().toISOString();
    const report = { summary: { passed: 3, failed: 1, riskLevel: "MEDIUM" } };
    testDb.insert(schema.qaRuns).values({
      id: "qa-3",
      title: "Full run",
      source: "text",
      status: "completed",
      reportJson: JSON.stringify(report),
      startedAt: now,
      createdAt: now,
    }).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs" });
    const body = res.json<{ runs: Array<{ id: string; summary: unknown }> }>();
    expect(body.runs[0].summary).toEqual(report.summary);
  });
});

describe("GET /api/qa/runs/:id", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 for unknown QA run", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe("QA run not found");
  });

  it("returns full run detail including parsed report", async () => {
    const now = new Date().toISOString();
    const report = { summary: { passed: 2, failed: 0, riskLevel: "LOW" }, testCases: [] };
    testDb.insert(schema.qaRuns).values({
      id: "qa-detail",
      title: "Detail test",
      source: "jira",
      environment: "production",
      status: "completed",
      reportJson: JSON.stringify(report),
      reportMarkdown: "# Report",
      startedAt: now,
      completedAt: now,
      createdAt: now,
    }).run();

    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/qa/runs/qa-detail" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      id: string;
      title: string;
      source: string;
      environment: string;
      status: string;
      report: typeof report;
      reportMarkdown: string;
    }>();
    expect(body.id).toBe("qa-detail");
    expect(body.title).toBe("Detail test");
    expect(body.source).toBe("jira");
    expect(body.report).toEqual(report);
    expect(body.reportMarkdown).toBe("# Report");
  });
});

describe("POST /api/qa/run", () => {
  beforeEach(() => {
    testDb = createTestDb();
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["LLM_API_KEY"];
  });

  it("returns 400 when input is missing", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/qa/run",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/input is required/i);
  });

  it("returns 400 when ANTHROPIC_API_KEY is not set", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/qa/run",
      payload: { input: { type: "text", content: "Test login flow" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("returns 202 and inserts DB record when valid", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/qa/run",
      payload: {
        input: { type: "text", content: "Test the checkout flow", title: "Checkout Tests" },
        environment: "staging",
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ runId: string; status: string; title: string }>();
    expect(body.status).toBe("running");
    expect(body.title).toBe("Checkout Tests");
    expect(body.runId).toBeTruthy();

    // Verify DB record was created
    const row = testDb
      .select()
      .from(schema.qaRuns)
      .all()
      .find((r) => r.id === body.runId);
    expect(row).toBeTruthy();
    expect(row!.status).toBe("running");
    expect(row!.environment).toBe("staging");
  });

  it("derives title from Jira input type", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/qa/run",
      payload: {
        input: { type: "jira", issueKeyOrUrl: "PROJ-123", baseUrl: "https://example.atlassian.net", token: "tok" },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ title: string }>();
    expect(body.title).toBe("Jira: PROJ-123");
  });

  it("derives title from GitHub input type", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/qa/run",
      payload: {
        input: { type: "github", repo: "org/my-repo", issueNumber: 42 },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json<{ title: string }>();
    expect(body.title).toBe("GitHub: org/my-repo");
  });
});
