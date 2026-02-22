import { describe, it, expect } from "vitest";
import { AnalyzerAgent } from "./analyzer.js";
import {
  generateJsonReport,
  generateTextReport,
  generateJUnitXml,
} from "./reporter.js";
import type {
  TestResult,
  StepResult,
  ToolResult,
  AnalysisSummary,
  FailureAnalysis,
} from "@test-automation-mcp/core";

function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    stepName: "Step",
    action: "web/click",
    status: "success",
    duration: 100,
    toolResult: {
      status: "success",
      tool: "web/click",
      duration: 100,
    } satisfies ToolResult,
    assertions: [],
    ...overrides,
  };
}

function makeTestResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    testId: "TC-001",
    testName: "Test One",
    status: "success",
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 1000,
    setupResults: [],
    stepResults: [],
    teardownResults: [],
    environment: "test",
    tags: ["unit"],
    retryCount: 0,
    ...overrides,
  };
}

describe("AnalyzerAgent", () => {
  const agent = new AnalyzerAgent();

  describe("computeSummary()", () => {
    it("should have 100% pass rate when all results pass", () => {
      const results: TestResult[] = [
        makeTestResult({ testId: "TC-001" }),
        makeTestResult({ testId: "TC-002" }),
        makeTestResult({ testId: "TC-003" }),
      ];

      const summary = agent.computeSummary(results);

      expect(summary.passRate).toBe(100);
      expect(summary.overallStatus).toBe("passed");
      expect(summary.criticalFailures).toBe(0);
    });

    it("should calculate correct rates with mixed results", () => {
      const results: TestResult[] = [
        makeTestResult({ testId: "TC-001", status: "success" }),
        makeTestResult({ testId: "TC-002", status: "failure", tags: ["critical"] }),
        makeTestResult({ testId: "TC-003", status: "success" }),
        makeTestResult({ testId: "TC-004", status: "error", tags: ["critical"] }),
      ];

      const summary = agent.computeSummary(results);

      expect(summary.passRate).toBe(50);
      expect(summary.overallStatus).toBe("failed");
      expect(summary.criticalFailures).toBe(2);
    });
  });

  describe("analyzeFailure()", () => {
    it("should categorize a connection error as 'environment'", () => {
      const result = makeTestResult({
        status: "error",
        error: "ECONNREFUSED: connection refused to localhost:3000",
        stepResults: [
          makeStepResult({
            status: "error",
            toolResult: {
              status: "error",
              tool: "web/navigate",
              duration: 100,
              error: {
                code: "ECONNREFUSED",
                message: "connection refused to localhost:3000",
              },
            },
            assertions: [],
          }),
        ],
      });

      const analysis = agent.analyzeFailure(result);

      expect(analysis.category).toBe("environment");
      expect(analysis.testId).toBe("TC-001");
      expect(analysis.confidence).toBeGreaterThan(0);
    });

    it("should categorize an assertion error as 'bug'", () => {
      const result = makeTestResult({
        status: "failure",
        stepResults: [
          makeStepResult({
            status: "failure",
            toolResult: {
              status: "success",
              tool: "web/getText",
              duration: 100,
              data: { text: "Wrong Value" },
            },
            assertions: [
              {
                expression: "response.body.name",
                expected: "John",
                actual: "Jane",
                passed: false,
                message: 'Expected "John" but got "Jane"',
              },
            ],
          }),
        ],
      });

      const analysis = agent.analyzeFailure(result);

      expect(analysis.category).toBe("bug");
    });

    it("should categorize a timeout error as 'environment'", () => {
      const result = makeTestResult({
        status: "error",
        error: "Request timeout after 30000ms",
        stepResults: [
          makeStepResult({
            status: "error",
            toolResult: {
              status: "error",
              tool: "web/waitForSelector",
              duration: 30000,
              error: {
                code: "ETIMEDOUT",
                message: "Request timeout after 30000ms",
              },
            },
            assertions: [],
          }),
        ],
      });

      const analysis = agent.analyzeFailure(result);

      expect(analysis.category).toBe("environment");
    });
  });

  describe("generateRecommendations()", () => {
    it("should return actionable strings", () => {
      const summary: AnalysisSummary = {
        overallStatus: "failed",
        passRate: 60,
        flakinessScore: 0,
        criticalFailures: 1,
        newFailures: 0,
        fixedTests: 0,
      };

      const failures: FailureAnalysis[] = [
        {
          testId: "TC-001",
          testName: "Login Test",
          rootCause: "Connection refused",
          category: "environment",
          confidence: 0.8,
          suggestedFix: "Check connectivity",
        },
      ];

      const recs = agent.generateRecommendations(summary, failures);

      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        expect(typeof rec).toBe("string");
        expect(rec.length).toBeGreaterThan(0);
      }
    });

    it("should include 'all tests passing' when pass rate is 100%", () => {
      const summary: AnalysisSummary = {
        overallStatus: "passed",
        passRate: 100,
        flakinessScore: 0,
        criticalFailures: 0,
        newFailures: 0,
        fixedTests: 0,
      };

      const recs = agent.generateRecommendations(summary, []);

      expect(recs.some((r) => r.toLowerCase().includes("all tests passing"))).toBe(true);
    });
  });

  describe("analyze() full pipeline", () => {
    it("should return a complete AnalysisResponse", async () => {
      const results: TestResult[] = [
        makeTestResult({ testId: "TC-001", status: "success" }),
        makeTestResult({
          testId: "TC-002",
          status: "failure",
          error: "assertion failed",
          stepResults: [
            makeStepResult({
              status: "failure",
              assertions: [
                {
                  expression: "status",
                  expected: 200,
                  actual: 500,
                  passed: false,
                  message: "Expected 200 got 500",
                },
              ],
            }),
          ],
        }),
      ];

      const response = await agent.analyze({ results });

      expect(response.summary).toBeDefined();
      expect(response.summary.passRate).toBe(50);
      expect(response.failures).toBeDefined();
      expect(response.failures.length).toBe(1);
      expect(response.recommendations).toBeDefined();
      expect(response.recommendations.length).toBeGreaterThan(0);
    });
  });
});

describe("Reporter", () => {
  const sampleResults: TestResult[] = [
    makeTestResult({ testId: "TC-001", status: "success", testName: "Login Test" }),
    makeTestResult({
      testId: "TC-002",
      status: "failure",
      testName: "Checkout Test",
      error: "Element not found",
    }),
  ];

  const agent = new AnalyzerAgent();

  describe("generateJsonReport()", () => {
    it("should return valid JSON", async () => {
      const response = await agent.analyze({ results: sampleResults });
      const json = generateJsonReport(response);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.summary).toBeDefined();
      expect(parsed.failures).toBeDefined();
    });
  });

  describe("generateTextReport()", () => {
    it("should contain a summary header", async () => {
      const response = await agent.analyze({ results: sampleResults });
      const text = generateTextReport(response);

      expect(text).toContain("SUMMARY");
      expect(text).toContain("TEST ANALYSIS REPORT");
      expect(text).toContain("Pass Rate");
    });
  });

  describe("generateJUnitXml()", () => {
    it("should produce valid XML with testsuites root element", () => {
      const xml = generateJUnitXml(sampleResults);

      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain("<testsuites");
      expect(xml).toContain("</testsuites>");
      expect(xml).toContain("<testsuite");
      expect(xml).toContain("<testcase");
      expect(xml).toContain('tests="2"');
      expect(xml).toContain('failures="1"');
    });
  });
});
