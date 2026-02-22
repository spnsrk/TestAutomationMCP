import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayConfig, TestResult } from "@test-automation-mcp/core";

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    tool = vi.fn();
    resource = vi.fn();
  },
}));

vi.mock("./router.js", () => ({
  McpRouter: class MockMcpRouter {
    listTools = vi.fn().mockReturnValue([]);
    callTool = vi.fn();
    registerServer = vi.fn();
    shutdown = vi.fn();
  },
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

import { GatewayServer } from "./server.js";
import { McpRouter } from "./router.js";

const minConfig: GatewayConfig = {
  port: 3100,
  host: "localhost",
  logLevel: "info",
  environments: { default: { name: "default" } },
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
    formats: ["json"],
    screenshotsOnFailure: true,
  },
};

function makeTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    testId: "T-001",
    testName: "Sample Test",
    status: "success",
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:00:05Z",
    duration: 5000,
    setupResults: [],
    stepResults: [],
    teardownResults: [],
    environment: "default",
    tags: [],
    retryCount: 0,
    ...overrides,
  };
}

describe("GatewayServer", () => {
  it("should construct without errors", () => {
    const server = new GatewayServer(minConfig);
    expect(server).toBeDefined();
  });

  describe("addResults()", () => {
    it("should store test results", () => {
      const server = new GatewayServer(minConfig);
      server.addResults([makeTestResult(), makeTestResult({ testId: "T-002" })]);

      const suite = server.getSuiteResult();
      expect(suite).not.toBeNull();
      expect(suite!.testResults).toHaveLength(2);
    });
  });

  describe("getSuiteResult()", () => {
    it("should return null when no results exist", () => {
      const server = new GatewayServer(minConfig);
      expect(server.getSuiteResult()).toBeNull();
    });

    it("should compute correct summary with mixed statuses", () => {
      const server = new GatewayServer(minConfig);
      server.addResults([
        makeTestResult({ testId: "T-1", status: "success", duration: 1000 }),
        makeTestResult({ testId: "T-2", status: "success", duration: 2000 }),
        makeTestResult({ testId: "T-3", status: "failure", duration: 3000 }),
        makeTestResult({ testId: "T-4", status: "error", duration: 500 }),
        makeTestResult({ testId: "T-5", status: "skipped", duration: 0 }),
      ]);

      const suite = server.getSuiteResult()!;
      expect(suite.summary.total).toBe(5);
      expect(suite.summary.passed).toBe(2);
      expect(suite.summary.failed).toBe(1);
      expect(suite.summary.errors).toBe(1);
      expect(suite.summary.skipped).toBe(1);
      expect(suite.summary.passRate).toBe(40);
      expect(suite.status).toBe("failure");
      expect(suite.duration).toBe(6500);
      expect(suite.suiteId).toBe("runtime");
      expect(suite.suiteName).toBe("Runtime Results");
    });

    it("should report success status when all tests pass", () => {
      const server = new GatewayServer(minConfig);
      server.addResults([
        makeTestResult({ testId: "T-1", status: "success" }),
        makeTestResult({ testId: "T-2", status: "success" }),
      ]);

      const suite = server.getSuiteResult()!;
      expect(suite.status).toBe("success");
      expect(suite.summary.passRate).toBe(100);
    });
  });

  describe("getRouter()", () => {
    it("should return the McpRouter instance", () => {
      const server = new GatewayServer(minConfig);
      const router = server.getRouter();
      expect(router).toBeDefined();
      expect(router).toBeInstanceOf(McpRouter);
    });
  });
});
