import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createLogger } from "@test-automation-mcp/core";
import type { ToolResult } from "@test-automation-mcp/core";

const logger = createLogger("gateway-router");

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

interface ManagedServer {
  client: Client;
  transport: StdioClientTransport;
  tools: string[];
}

/**
 * Routes tool calls to the appropriate MCP server based on namespace.
 * Manages lifecycle of child MCP server processes.
 */
export class McpRouter {
  private servers = new Map<string, ManagedServer>();
  private toolToServer = new Map<string, string>();
  private toolSchemas = new Map<string, McpToolSchema>();

  async registerServer(
    name: string,
    config: McpServerConfig
  ): Promise<void> {
    logger.info({ server: name, command: config.command }, "Registering MCP server");

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    const client = new Client({
      name: `gateway->${name}`,
      version: "0.1.0",
    });

    await client.connect(transport);

    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    this.servers.set(name, { client, transport, tools: toolNames });
    for (const tool of tools) {
      this.toolToServer.set(tool.name, name);
      this.toolSchemas.set(tool.name, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as McpToolSchema["inputSchema"],
      });
    }

    logger.info(
      { server: name, toolCount: toolNames.length },
      "MCP server registered"
    );
  }

  async callTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const serverName = this.toolToServer.get(toolName);
    if (!serverName) {
      return {
        status: "error",
        tool: toolName,
        duration: 0,
        error: {
          code: "SERVER_NOT_FOUND",
          message: `No MCP server registered for tool '${toolName}'`,
        },
      };
    }

    const server = this.servers.get(serverName);
    if (!server) {
      return {
        status: "error",
        tool: toolName,
        duration: 0,
        error: {
          code: "SERVER_NOT_AVAILABLE",
          message: `MCP server '${serverName}' is not available`,
        },
      };
    }

    const start = performance.now();
    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: params,
      });

      const duration = Math.round(performance.now() - start);
      const content = result.content as Array<{ type: string; text: string }>;
      const textContent = content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(textContent);
      } catch {
        parsed = { raw: textContent };
      }

      return {
        status: result.isError ? "error" : "success",
        tool: toolName,
        duration,
        data: parsed,
        error: result.isError
          ? {
              code: "TOOL_ERROR",
              message: textContent,
            }
          : undefined,
      };
    } catch (err) {
      return {
        status: "error",
        tool: toolName,
        duration: Math.round(performance.now() - start),
        error: {
          code: "CALL_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  listTools(): Array<{ name: string; server: string }> {
    const result: Array<{ name: string; server: string }> = [];
    for (const [toolName, serverName] of this.toolToServer) {
      result.push({ name: toolName, server: serverName });
    }
    return result;
  }

  listToolSchemas(): McpToolSchema[] {
    return Array.from(this.toolSchemas.values());
  }

  getToolSchema(toolName: string): McpToolSchema | undefined {
    return this.toolSchemas.get(toolName);
  }

  getServerForTool(toolName: string): string | undefined {
    return this.toolToServer.get(toolName);
  }

  async shutdown(): Promise<void> {
    for (const [name, server] of this.servers) {
      logger.info({ server: name }, "Shutting down MCP server");
      try {
        await server.client.close();
      } catch (err) {
        logger.warn({ server: name, error: err }, "Error during shutdown");
      }
    }
    this.servers.clear();
    this.toolToServer.clear();
  }
}
