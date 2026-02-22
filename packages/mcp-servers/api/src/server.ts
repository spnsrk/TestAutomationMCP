import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLogger } from "@test-automation-mcp/core";
import { restTools } from "./tools/rest.js";
import { graphqlTools } from "./tools/graphql.js";
import { contractTools } from "./tools/contract.js";
import { z } from "zod";

const logger = createLogger("mcp-server-api");

export class ApiMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "test-automation-api",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private registerTools(): void {
    const allTools = {
      ...restTools,
      ...graphqlTools,
      ...contractTools,
    };

    for (const [name, tool] of Object.entries(allTools)) {
      const toolDef = tool as unknown as {
        description: string;
        inputSchema: z.ZodType;
        handler: (params: Record<string, unknown>) => Promise<unknown>;
      };

      const shape =
        toolDef.inputSchema instanceof z.ZodObject
          ? toolDef.inputSchema.shape
          : {};

      this.server.tool(
        name,
        toolDef.description,
        shape,
        async (params: Record<string, unknown>) => {
          const start = performance.now();
          try {
            const result = await toolDef.handler(params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "Tool executed");
            return {
              content: [
                { type: "text" as const, text: JSON.stringify({ ...(result as object), duration }) },
              ],
            };
          } catch (err) {
            const duration = Math.round(performance.now() - start);
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ tool: name, error: message, duration }, "Tool failed");
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    status: "error",
                    tool: name,
                    duration,
                    error: { code: "TOOL_ERROR", message },
                  }),
                },
              ],
              isError: true,
            };
          }
        }
      );
    }

    logger.info(
      { tools: Object.keys(allTools) },
      `Registered ${Object.keys(allTools).length} API tools`
    );
  }

  getServer(): McpServer {
    return this.server;
  }
}
