import { describe, it, expect, vi } from "vitest";
import { ExecutorAgent } from "./executor.js";
import type { ToolCaller } from "./executor.js";
import { VariableResolver } from "@test-automation-mcp/core";
import type {
  TestDefinition,
  TestStep,
  ToolResult,
  TestExecutionRequest,
} from "@test-automation-mcp/core";

function makeToolCaller(
  resultOverrides: Partial<ToolResult> = {}
): ToolCaller {
  return {
    callTool: vi.fn().mockResolvedValue({
      status: "success",
      tool: "mock-tool",
      duration: 10,
      data: { value: "mock-result" },
      ...resultOverrides,
    } satisfies ToolResult),
  };
}

function makeTestDefinition(
  overrides: Partial<TestDefinition["test"]> = {}
): TestDefinition {
  return {
    test: {
      id: "TC-001",
      name: "Mock Test",
      type: "e2e",
      priority: "high",
      tags: ["web"],
      timeout: 60000,
      retries: 0,
      steps: [
        {
          name: "Step 1",
          action: "web/navigate",
          params: { url: "https://example.com" },
        },
      ],
      ...overrides,
    },
  };
}

describe("ExecutorAgent", () => {
  describe("executeTest()", () => {
    it("should execute all steps and return a TestResult", async () => {
      const toolCaller = makeToolCaller();
      const agent = new ExecutorAgent(toolCaller);
      const testDef = makeTestDefinition();

      const result = await agent.executeTest(testDef);

      expect(result.testId).toBe("TC-001");
      expect(result.testName).toBe("Mock Test");
      expect(result.status).toBe("success");
      expect(result.stepResults.length).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.startTime).toBeDefined();
      expect(result.endTime).toBeDefined();
    });

    it("should run setup -> steps -> teardown in order", async () => {
      const callOrder: string[] = [];
      const toolCaller: ToolCaller = {
        callTool: vi.fn().mockImplementation((toolName: string) => {
          callOrder.push(toolName);
          return Promise.resolve({
            status: "success",
            tool: toolName,
            duration: 5,
            data: { ok: true },
          } satisfies ToolResult);
        }),
      };

      const agent = new ExecutorAgent(toolCaller);
      const testDef = makeTestDefinition({
        setup: [{ name: "Setup", action: "setup/init" }],
        steps: [{ name: "Main Step", action: "web/click" }],
        teardown: [{ name: "Teardown", action: "teardown/cleanup" }],
      });

      await agent.executeTest(testDef);

      expect(callOrder).toEqual(["setup/init", "web/click", "teardown/cleanup"]);
    });

    it("should always run teardown even if steps fail", async () => {
      let teardownCalled = false;
      const toolCaller: ToolCaller = {
        callTool: vi.fn().mockImplementation((toolName: string) => {
          if (toolName === "web/click") {
            return Promise.resolve({
              status: "failure",
              tool: toolName,
              duration: 5,
              error: { code: "CLICK_FAILED", message: "Element not found" },
            } satisfies ToolResult);
          }
          if (toolName === "teardown/cleanup") {
            teardownCalled = true;
          }
          return Promise.resolve({
            status: "success",
            tool: toolName,
            duration: 5,
            data: {},
          } satisfies ToolResult);
        }),
      };

      const agent = new ExecutorAgent(toolCaller);
      const testDef = makeTestDefinition({
        steps: [{ name: "Click", action: "web/click" }],
        teardown: [{ name: "Cleanup", action: "teardown/cleanup" }],
      });

      const result = await agent.executeTest(testDef);

      expect(result.status).toBe("failure");
      expect(teardownCalled).toBe(true);
      expect(result.teardownResults.length).toBe(1);
    });
  });

  describe("executeStep()", () => {
    it("should store result in variables when save_as is specified", async () => {
      const toolCaller = makeToolCaller({ data: { token: "abc123" } });
      const agent = new ExecutorAgent(toolCaller);
      const resolver = new VariableResolver();

      const step: TestStep = {
        name: "Login",
        action: "auth/login",
        save_as: "auth_result",
      };

      await agent.executeStep(step, resolver);

      expect(resolver.get("auth_result")).toEqual({ token: "abc123" });
    });
  });

  describe("evaluateAssertions()", () => {
    const toolCaller = makeToolCaller();
    const agent = new ExecutorAgent(toolCaller);

    it("should correctly evaluate 'not null' assertions", () => {
      const assertions = [{ "result.value": "not null" }];
      const data = { result: { value: "something" } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results.length).toBe(1);
      expect(results[0].passed).toBe(true);
    });

    it("should fail 'not null' for null values", () => {
      const assertions = [{ "result.value": "not null" }];
      const data = { result: { value: null } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results[0].passed).toBe(false);
    });

    it("should correctly evaluate numeric comparison >= 5", () => {
      const assertions = [{ "result.count": ">= 5" }];
      const data = { result: { count: 10 } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results[0].passed).toBe(true);
    });

    it("should fail >= 5 when value is 3", () => {
      const assertions = [{ "result.count": ">= 5" }];
      const data = { result: { count: 3 } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results[0].passed).toBe(false);
    });

    it("should correctly evaluate <= operator", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "<= 10" }],
        { result: { value: 7 } }
      );
      expect(results[0].passed).toBe(true);
    });

    it("should fail <= when value exceeds threshold", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "<= 10" }],
        { result: { value: 15 } }
      );
      expect(results[0].passed).toBe(false);
    });

    it("should pass <= at the boundary", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "<= 10" }],
        { result: { value: 10 } }
      );
      expect(results[0].passed).toBe(true);
    });

    it("should correctly evaluate < operator", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "< 10" }],
        { result: { value: 7 } }
      );
      expect(results[0].passed).toBe(true);
    });

    it("should fail < at the boundary (not strictly less)", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "< 10" }],
        { result: { value: 10 } }
      );
      expect(results[0].passed).toBe(false);
    });

    it("should correctly evaluate > operator", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "> 5" }],
        { result: { value: 10 } }
      );
      expect(results[0].passed).toBe(true);
    });

    it("should fail > at the boundary (not strictly greater)", () => {
      const results = agent.evaluateAssertions(
        [{ "result.value": "> 5" }],
        { result: { value: 5 } }
      );
      expect(results[0].passed).toBe(false);
    });

    it("should correctly evaluate 'contains' assertion", () => {
      const results = agent.evaluateAssertions(
        [{ "result.message": "contains success" }],
        { result: { message: "Operation completed with success" } }
      );
      expect(results[0].passed).toBe(true);
    });

    it("should fail 'contains' when substring is absent", () => {
      const results = agent.evaluateAssertions(
        [{ "result.message": "contains error" }],
        { result: { message: "All good" } }
      );
      expect(results[0].passed).toBe(false);
    });

    it("should correctly evaluate equality assertions", () => {
      const assertions = [{ "response.status": 200 }];
      const data = { response: { status: 200 } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results[0].passed).toBe(true);
    });

    it("should fail equality when values differ", () => {
      const assertions = [{ "response.status": 200 }];
      const data = { response: { status: 404 } };

      const results = agent.evaluateAssertions(assertions, data);

      expect(results[0].passed).toBe(false);
    });
  });

  describe("execute()", () => {
    it("should run tests in parallel when parallel=true", async () => {
      const toolCaller = makeToolCaller();
      const agent = new ExecutorAgent(toolCaller);

      const request: TestExecutionRequest = {
        tests: [
          makeTestDefinition({ id: "TC-001", name: "Test A" }),
          makeTestDefinition({ id: "TC-002", name: "Test B" }),
        ],
        environment: "test",
        parallel: true,
        maxWorkers: 2,
      };

      const response = await agent.execute(request);

      expect(response.results.length).toBe(2);
      expect(response.results.every((r) => r.environment === "test")).toBe(true);
      const ids = response.results.map((r) => r.testId);
      expect(ids).toContain("TC-001");
      expect(ids).toContain("TC-002");
    });
  });

  describe("continueOnFailure", () => {
    it("should not abort the test when a failing step has continueOnFailure=true", async () => {
      const toolCaller: ToolCaller = {
        callTool: vi.fn().mockImplementation((toolName: string) => {
          if (toolName === "web/click") {
            return Promise.resolve({
              status: "failure",
              tool: toolName,
              duration: 5,
              error: { code: "CLICK_FAILED", message: "Element not found" },
            } satisfies ToolResult);
          }
          return Promise.resolve({
            status: "success",
            tool: toolName,
            duration: 5,
            data: { ok: true },
          } satisfies ToolResult);
        }),
      };

      const agent = new ExecutorAgent(toolCaller);
      const testDef = makeTestDefinition({
        steps: [
          { name: "Click", action: "web/click", continueOnFailure: true },
          { name: "Navigate", action: "web/navigate" },
        ],
      });

      const result = await agent.executeTest(testDef);

      expect(result.stepResults.length).toBe(2);
      expect(result.stepResults[0].status).toBe("failure");
      expect(result.stepResults[1].status).toBe("success");
    });
  });
});
