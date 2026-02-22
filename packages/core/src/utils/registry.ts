import type { ToolResult } from "../types/tool-result.js";

export interface ToolDescriptor {
  name: string;
  namespace: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Tool Registry Pattern -- each MCP server registers tools here
 * instead of using a monolithic switch-statement.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();

  register(tool: ToolDescriptor): void {
    const key = `${tool.namespace}/${tool.name}`;
    if (this.tools.has(key)) {
      throw new Error(`Tool '${key}' is already registered`);
    }
    this.tools.set(key, tool);
  }

  get(toolName: string): ToolDescriptor | undefined {
    return this.tools.get(toolName);
  }

  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  list(): ToolDescriptor[] {
    return Array.from(this.tools.values());
  }

  listByNamespace(namespace: string): ToolDescriptor[] {
    return Array.from(this.tools.values()).filter(
      (t) => t.namespace === namespace
    );
  }

  getNamespaces(): string[] {
    const namespaces = new Set<string>();
    for (const tool of this.tools.values()) {
      namespaces.add(tool.namespace);
    }
    return Array.from(namespaces);
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        status: "error",
        tool: toolName,
        duration: 0,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool '${toolName}' is not registered`,
        },
      };
    }

    const start = performance.now();
    try {
      const result = await tool.handler(params);
      result.duration = performance.now() - start;
      return result;
    } catch (err) {
      return {
        status: "error",
        tool: toolName,
        duration: performance.now() - start,
        error: {
          code: "TOOL_EXECUTION_ERROR",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      };
    }
  }
}
