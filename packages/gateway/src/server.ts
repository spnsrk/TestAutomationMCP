import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createLogger,
  type GatewayConfig,
  type TestResult,
  type SuiteResult,
} from "@test-automation-mcp/core";
import { McpRouter, type McpServerConfig } from "./router.js";

const logger = createLogger("gateway");

export class GatewayServer {
  private server: McpServer;
  private router: McpRouter;
  private config: GatewayConfig;
  private results: TestResult[] = [];

  constructor(config: GatewayConfig) {
    this.config = config;
    this.router = new McpRouter();
    this.server = new McpServer({
      name: "test-automation-gateway",
      version: "0.1.0",
    });

    this.registerGatewayTools();
    this.registerResources();
  }

  async initialize(): Promise<void> {
    const serverConfigs = this.config.mcpServers;

    for (const [name, config] of Object.entries(serverConfigs)) {
      if (config) {
        try {
          await this.router.registerServer(name, config as McpServerConfig);
        } catch (err) {
          logger.warn({ server: name, error: err }, "Failed to register MCP server");
        }
      }
    }
  }

  private registerGatewayTools(): void {
    this.server.tool(
      "gateway/runTest",
      "Execute a single test by ID or inline definition",
      {
        testId: z.string().optional().describe("ID of a stored test to run"),
        test: z.record(z.string(), z.unknown()).optional().describe("Inline test definition"),
        environment: z.string().default("default"),
      },
      async (params) => {
        logger.info({ testId: params.testId }, "Running test");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "success",
                message: `Test ${params.testId ?? "inline"} queued for execution`,
                environment: params.environment,
              }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "gateway/runSuite",
      "Execute a test suite",
      {
        suiteId: z.string().describe("ID of the test suite to run"),
        environment: z.string().default("default"),
        parallel: z.boolean().default(false),
        tags: z.array(z.string()).optional().describe("Filter tests by tags"),
      },
      async (params) => {
        logger.info({ suiteId: params.suiteId }, "Running suite");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "success",
                message: `Suite ${params.suiteId} queued for execution`,
                environment: params.environment,
                parallel: params.parallel,
              }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "gateway/callTool",
      "Call a tool on a specific MCP server",
      {
        tool: z.string().describe("Full tool name (e.g., web/navigate, sf/data.soqlQuery)"),
        params: z.record(z.string(), z.unknown()).default({}),
      },
      async (args) => {
        const result = await this.router.callTool(args.tool, args.params);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          isError: result.status === "error",
        };
      }
    );

    this.server.tool(
      "gateway/listTools",
      "List all available tools across all MCP servers",
      {},
      async () => {
        const tools = this.router.listTools();
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ tools, count: tools.length }) }],
        };
      }
    );

    this.server.tool(
      "gateway/getResults",
      "Get test execution results",
      {
        testId: z.string().optional(),
        status: z.enum(["success", "failure", "error", "skipped"]).optional(),
        limit: z.number().default(50),
      },
      async (params) => {
        let filtered = this.results;
        if (params.testId) {
          filtered = filtered.filter((r) => r.testId === params.testId);
        }
        if (params.status) {
          filtered = filtered.filter((r) => r.status === params.status);
        }
        const limited = filtered.slice(0, params.limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ results: limited, total: filtered.length }),
            },
          ],
        };
      }
    );

    this.server.tool(
      "gateway/getStatus",
      "Get gateway status including connected servers and capabilities",
      {},
      async () => {
        const tools = this.router.listTools();
        const servers = new Set(tools.map((t) => t.server));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "running",
                connectedServers: Array.from(servers),
                totalTools: tools.length,
                environment: this.config.defaultEnvironment,
                storedResults: this.results.length,
              }),
            },
          ],
        };
      }
    );
  }

  private registerResources(): void {
    this.server.resource(
      "config",
      "gateway://config",
      async () => ({
        contents: [
          {
            uri: "gateway://config",
            text: JSON.stringify(
              {
                environments: Object.keys(this.config.environments),
                defaultEnvironment: this.config.defaultEnvironment,
                execution: this.config.execution,
                reporting: this.config.reporting,
              },
              null,
              2
            ),
            mimeType: "application/json",
          },
        ],
      })
    );

    this.server.resource(
      "tools",
      "gateway://tools",
      async () => ({
        contents: [
          {
            uri: "gateway://tools",
            text: JSON.stringify(this.router.listTools(), null, 2),
            mimeType: "application/json",
          },
        ],
      })
    );
  }

  addResults(newResults: TestResult[]): void {
    this.results.push(...newResults);
  }

  getSuiteResult(): SuiteResult | null {
    if (this.results.length === 0) return null;
    const passed = this.results.filter((r) => r.status === "success").length;
    const failed = this.results.filter((r) => r.status === "failure").length;
    const errors = this.results.filter((r) => r.status === "error").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    return {
      suiteId: "runtime",
      suiteName: "Runtime Results",
      status: failed > 0 || errors > 0 ? "failure" : "success",
      startTime: this.results[0]?.startTime ?? new Date().toISOString(),
      endTime: this.results[this.results.length - 1]?.endTime ?? new Date().toISOString(),
      duration: this.results.reduce((sum, r) => sum + r.duration, 0),
      testResults: this.results,
      summary: {
        total: this.results.length,
        passed,
        failed,
        errors,
        skipped,
        passRate: this.results.length > 0 ? (passed / this.results.length) * 100 : 0,
      },
    };
  }

  getServer(): McpServer {
    return this.server;
  }

  getRouter(): McpRouter {
    return this.router;
  }

  async shutdown(): Promise<void> {
    await this.router.shutdown();
  }
}
