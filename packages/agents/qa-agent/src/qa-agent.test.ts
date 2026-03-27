import { describe, it, expect, vi, beforeEach } from "vitest";
import { QAAgent } from "./qa-agent.js";
import type { McpRouter } from "@test-automation-mcp/gateway";
import type { ToolResult } from "@test-automation-mcp/core";

// ─── Mock Anthropic SDK ───────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_options: unknown) {}
  }
  return { default: MockAnthropic };
});

// ─── Mock McpRouter ───────────────────────────────────────────────────────────

function makeMockRouter(tools: string[] = ["web.navigate", "web.click"]): McpRouter {
  return {
    listTools: vi.fn(() => tools.map((name) => ({ name, server: "web" }))),
    callTool: vi.fn(async (name: string): Promise<ToolResult> => ({
      status: "success",
      tool: name,
      duration: 10,
      data: { result: "ok" },
    })),
    registerServer: vi.fn(),
    shutdown: vi.fn(),
    getServerForTool: vi.fn(),
  } as unknown as McpRouter;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEndTurnResponse(text: string): Record<string, unknown> {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
  };
}

function makeToolUseResponse(
  toolName: string,
  toolInput: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "I will now navigate to the app." },
      { type: "tool_use", id: "tu_1", name: toolName, input: toolInput },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QAAgent", () => {
  let router: McpRouter;
  let agent: QAAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    router = makeMockRouter();
    agent = new QAAgent({ apiKey: "test-key", router });
  });

  it("runs to completion when Claude returns end_turn immediately", async () => {
    const narrative = `
[PASS] Home page loads
[PASS] Login form renders
Risk Level: LOW
`;
    mockCreate.mockResolvedValueOnce(makeEndTurnResponse(narrative));

    const result = await agent.run({
      input: { type: "text", content: "Test the login page" },
    });

    expect(result.runId).toBeTruthy();
    expect(result.report.summary.passed).toBe(2);
    expect(result.report.summary.failed).toBe(0);
    expect(result.report.summary.riskLevel).toBe("LOW");
  });

  it("executes tool calls before finishing", async () => {
    const narrative = `
[PASS] Navigation works
[FAIL] Login button not found — selector #login-btn did not match
Risk Level: HIGH
`;
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse("web.navigate", { url: "http://localhost:3000" }))
      .mockResolvedValueOnce(makeEndTurnResponse(narrative));

    const result = await agent.run({
      input: { type: "text", content: "Test login" },
    });

    expect(router.callTool).toHaveBeenCalledWith(
      "web.navigate",
      { url: "http://localhost:3000" }
    );
    expect(result.report.summary.passed).toBe(1);
    expect(result.report.summary.failed).toBe(1);
    expect(result.report.summary.riskLevel).toBe("HIGH");
  });

  it("emits events during the run", async () => {
    const narrative = "[PASS] Smoke test\nRisk Level: LOW";
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse("web.navigate", { url: "http://localhost" }))
      .mockResolvedValueOnce(makeEndTurnResponse(narrative));

    const events: string[] = [];
    await agent.run({
      input: { type: "text", content: "Smoke test" },
      onEvent: (e) => events.push(e.type),
    });

    expect(events).toContain("started");
    expect(events).toContain("tool_call");
    expect(events).toContain("tool_result");
    expect(events).toContain("completed");
  });

  it("handles tool call errors gracefully and continues", async () => {
    (router.callTool as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Browser not running")
    );

    const narrative = "[FAIL] Navigation failed\nRisk Level: HIGH";
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse("web.navigate"))
      .mockResolvedValueOnce(makeEndTurnResponse(narrative));

    const result = await agent.run({
      input: { type: "text", content: "Test nav" },
    });

    // Run should still complete despite tool error
    expect(result.report).toBeTruthy();
    expect(result.report.summary.riskLevel).toBe("HIGH");
  });

  it("forces a final report when maxIterations is reached", async () => {
    const loopResponse = makeToolUseResponse("web.click", { selector: "#btn" });
    const forcedReport = "[PASS] Partial test\nRisk Level: MEDIUM";

    // Return tool_use 3 times, then end_turn on the forced report call
    mockCreate
      .mockResolvedValueOnce(loopResponse)
      .mockResolvedValueOnce(loopResponse)
      .mockResolvedValueOnce(loopResponse)
      .mockResolvedValueOnce(makeEndTurnResponse(forcedReport));

    const result = await agent.run({
      input: { type: "text", content: "Loop test" },
      maxIterations: 3,
    });

    expect(result.report).toBeTruthy();
    expect(result.report.summary.riskLevel).toBe("MEDIUM");
  });

  it("uses all available tools from the router", async () => {
    const customRouter = makeMockRouter(["api.request", "data.query", "salesforce.data.soqlQuery"]);
    const customAgent = new QAAgent({ apiKey: "test-key", router: customRouter });

    mockCreate.mockResolvedValueOnce(makeEndTurnResponse("[PASS] API test\nRisk Level: LOW"));

    await customAgent.run({ input: { type: "text", content: "Test API" } });

    // Should have been called with tools mapped from the router
    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    const tools = callArgs.tools as Array<{ name: string }>;
    expect(tools?.map((t) => t.name)).toContain("api.request");
    expect(tools?.map((t) => t.name)).toContain("data.query");
  });

  it("works without any MCP tools (no gateway)", async () => {
    const emptyRouter = makeMockRouter([]);
    const agentNoTools = new QAAgent({ apiKey: "test-key", router: emptyRouter });

    mockCreate.mockResolvedValueOnce(
      makeEndTurnResponse("[PASS] Manual review\nRisk Level: LOW")
    );

    const result = await agentNoTools.run({
      input: { type: "text", content: "Review this spec" },
    });

    expect(result.report.summary.passed).toBe(1);
  });
});
