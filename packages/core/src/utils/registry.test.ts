import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "./registry.js";
import type { ToolDescriptor } from "./registry.js";
import type { ToolResult } from "../types/tool-result.js";

function makeTool(
  namespace: string,
  name: string,
  handler?: () => Promise<ToolResult>
): ToolDescriptor {
  return {
    namespace,
    name,
    description: `Test tool ${namespace}/${name}`,
    inputSchema: {},
    handler:
      handler ??
      (async () => ({
        status: "success" as const,
        tool: `${namespace}/${name}`,
        duration: 0,
        data: { result: "ok" },
      })),
  };
}

describe("ToolRegistry", () => {
  it("should register and retrieve a tool", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("web", "navigate");
    registry.register(tool);

    expect(registry.has("web/navigate")).toBe(true);
    expect(registry.get("web/navigate")).toBe(tool);
  });

  it("should throw on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("web", "navigate"));
    expect(() => registry.register(makeTool("web", "navigate"))).toThrow(
      "Tool 'web/navigate' is already registered"
    );
  });

  it("should return undefined for unregistered tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("unknown/tool")).toBeUndefined();
    expect(registry.has("unknown/tool")).toBe(false);
  });

  it("should list all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("web", "navigate"));
    registry.register(makeTool("web", "click"));
    registry.register(makeTool("sf", "query"));

    const tools = registry.list();
    expect(tools).toHaveLength(3);
  });

  it("should list tools by namespace", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("web", "navigate"));
    registry.register(makeTool("web", "click"));
    registry.register(makeTool("sf", "query"));

    expect(registry.listByNamespace("web")).toHaveLength(2);
    expect(registry.listByNamespace("sf")).toHaveLength(1);
    expect(registry.listByNamespace("sap")).toHaveLength(0);
  });

  it("should get namespaces", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("web", "navigate"));
    registry.register(makeTool("sf", "query"));
    registry.register(makeTool("sap", "rfc"));

    const ns = registry.getNamespaces();
    expect(ns).toContain("web");
    expect(ns).toContain("sf");
    expect(ns).toContain("sap");
    expect(ns).toHaveLength(3);
  });

  it("should execute a tool and return result", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(async () => ({
      status: "success" as const,
      tool: "web/navigate",
      duration: 0,
      data: { url: "https://example.com" },
    }));
    registry.register(makeTool("web", "navigate", handler));

    const result = await registry.execute("web/navigate", {
      url: "https://example.com",
    });

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ url: "https://example.com" });
    expect(handler).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it("should return error for non-existent tool execution", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nonexistent/tool", {});

    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("TOOL_NOT_FOUND");
  });

  it("should catch handler errors and return error result", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn(async () => {
      throw new Error("Something broke");
    });
    registry.register(makeTool("web", "broken", handler));

    const result = await registry.execute("web/broken", {});

    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("TOOL_EXECUTION_ERROR");
    expect(result.error?.message).toBe("Something broke");
    expect(result.error?.stack).toBeDefined();
  });
});
