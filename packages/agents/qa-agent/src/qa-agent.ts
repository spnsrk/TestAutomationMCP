import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuid } from "uuid";
import { createLogger } from "@test-automation-mcp/core";
import type { McpRouter } from "@test-automation-mcp/gateway";
import { ToolBridge } from "./tool-bridge.js";
import { InputReader } from "./input-reader.js";
import { parseReportFromNarrative, formatReport } from "./report.js";
import { QA_SYSTEM_PROMPT, QA_CONTEXT_TEMPLATE } from "./prompts.js";
import type { QAInput, ResolvedContext } from "./input-reader.js";
import type { QAReport, StepRecord } from "./report.js";

const logger = createLogger("qa-agent");

// ─── Public types ─────────────────────────────────────────────────────────────

export interface QARunRequest {
  input: QAInput;
  environment?: string;
  /** Max number of agentic loop iterations before forcing a report */
  maxIterations?: number;
  /** Called on every agent event for live streaming */
  onEvent?: (event: QAEvent) => void;
}

export interface QARunResult {
  runId: string;
  report: QAReport;
  reportMarkdown: string;
}

export type QAEvent =
  | { type: "started"; runId: string; title: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool: string; status: "success" | "error"; durationMs: number }
  | { type: "completed"; runId: string; report: QAReport }
  | { type: "error"; runId: string; message: string };

// ─── QAAgent ──────────────────────────────────────────────────────────────────

export class QAAgent {
  private client: Anthropic;
  private toolBridge: ToolBridge;
  private inputReader: InputReader;
  private model: string;

  constructor(options: {
    apiKey: string;
    router: McpRouter;
    model?: string;
  }) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.toolBridge = new ToolBridge(options.router);
    this.inputReader = new InputReader();
    this.model = options.model ?? "claude-opus-4-6";
  }

  /**
   * Run a full QA session:
   * 1. Read the input (doc/Jira/GitHub/text)
   * 2. Build context for Claude
   * 3. Run the agentic loop until Claude says QA COMPLETE
   * 4. Parse and return the structured report
   */
  async run(request: QARunRequest): Promise<QARunResult> {
    const runId = uuid();
    const environment = request.environment ?? "default";
    const maxIterations = request.maxIterations ?? 30;
    const emit = request.onEvent ?? (() => {});

    logger.info({ runId, inputType: request.input.type }, "QA run started");

    // ── 1. Resolve input ────────────────────────────────────────────────────
    let context: ResolvedContext;
    try {
      context = await this.inputReader.read(request.input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "error", runId, message: `Failed to read input: ${message}` });
      throw err;
    }

    emit({ type: "started", runId, title: context.title });
    logger.info({ runId, title: context.title, source: context.source }, "Context resolved");

    // ── 2. Get available tools ───────────────────────────────────────────────
    const tools = await this.toolBridge.getAnthropicTools();
    logger.info({ runId, toolCount: tools.length }, "Tools loaded");

    if (tools.length === 0) {
      logger.warn({ runId }, "No MCP tools available — agent will reason without execution");
    }

    // ── 3. Build initial messages ────────────────────────────────────────────
    const userMessage = QA_CONTEXT_TEMPLATE(context.content, environment);
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    // ── 4. Agentic loop ──────────────────────────────────────────────────────
    const startedAt = new Date();
    const toolCallLog: StepRecord[] = [];
    let iterations = 0;
    let finalNarrative = "";

    while (iterations < maxIterations) {
      iterations++;
      logger.debug({ runId, iteration: iterations }, "Agent iteration");

      const response = await this.client.messages.create({
        model: this.model,
        system: QA_SYSTEM_PROMPT,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: 4096,
      });

      // Collect any text blocks for streaming
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      for (const block of textBlocks) {
        if (block.text.trim()) {
          emit({ type: "thinking", text: block.text });
          finalNarrative = block.text; // keep the last substantial text as the report
        }
      }

      // Check if done
      if (
        response.stop_reason === "end_turn" ||
        textBlocks.some((b) => b.text.includes("QA COMPLETE"))
      ) {
        logger.info({ runId, iterations }, "QA complete");
        break;
      }

      // Process tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length === 0) {
        // Claude stopped without tool calls and without "QA COMPLETE" — treat as done
        break;
      }

      // Add Claude's response to history
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;
        emit({ type: "tool_call", tool: toolUse.name, input: toolInput });

        const callStart = Date.now();
        let resultContent: string;
        let stepStatus: "success" | "error" = "success";

        try {
          const result = await this.toolBridge.executeTool(toolUse.name, toolInput);
          const durationMs = Date.now() - callStart;

          stepStatus = result.status === "error" ? "error" : "success";
          resultContent = JSON.stringify(result.data ?? result.error ?? { status: result.status });

          toolCallLog.push({
            tool: toolUse.name,
            input: toolInput,
            output: result,
            status: stepStatus,
            durationMs,
          });

          emit({ type: "tool_result", tool: toolUse.name, status: stepStatus, durationMs });
          logger.debug({ runId, tool: toolUse.name, status: stepStatus, durationMs }, "Tool executed");
        } catch (err) {
          const durationMs = Date.now() - callStart;
          const message = err instanceof Error ? err.message : String(err);
          resultContent = JSON.stringify({ error: message });
          stepStatus = "error";

          toolCallLog.push({
            tool: toolUse.name,
            input: toolInput,
            output: { error: message },
            status: "error",
            durationMs,
          });

          emit({ type: "tool_result", tool: toolUse.name, status: "error", durationMs });
          logger.warn({ runId, tool: toolUse.name, error: message }, "Tool call failed");
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultContent,
          is_error: stepStatus === "error",
        });
      }

      // Add tool results back to conversation
      messages.push({ role: "user", content: toolResults });
    }

    if (iterations >= maxIterations) {
      logger.warn({ runId, maxIterations }, "Max iterations reached — forcing report");
      // Ask Claude to produce its final report with what it has
      messages.push({
        role: "user",
        content:
          "You have reached the maximum number of iterations. Please produce your final QA report now based on the tests you have run so far.",
      });
      const finalResponse = await this.client.messages.create({
        model: this.model,
        system: QA_SYSTEM_PROMPT,
        messages,
        max_tokens: 4096,
      });
      const finalText = finalResponse.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (finalText.trim()) finalNarrative = finalText;
    }

    // ── 5. Parse and structure the report ───────────────────────────────────
    const completedAt = new Date();
    const report = parseReportFromNarrative(finalNarrative, {
      id: runId,
      title: context.title,
      source: context.source,
      environment,
      startedAt,
      completedAt,
      toolCallLog,
    });

    const reportMarkdown = formatReport(report);
    emit({ type: "completed", runId, report });

    logger.info(
      {
        runId,
        passed: report.summary.passed,
        failed: report.summary.failed,
        riskLevel: report.summary.riskLevel,
        durationMs: report.durationMs,
      },
      "QA run finished"
    );

    return { runId, report, reportMarkdown };
  }
}
