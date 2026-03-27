import type Anthropic from "@anthropic-ai/sdk";
import type { McpRouter } from "@test-automation-mcp/gateway";
import type { ToolResult } from "@test-automation-mcp/core";

/**
 * Converts the tools registered in the MCP gateway into the format
 * that the Anthropic SDK expects for tool_use.
 *
 * Also provides the execution bridge: when Claude calls a tool,
 * routes it through the gateway's McpRouter to the real MCP server.
 */
export class ToolBridge {
  private router: McpRouter;
  private toolSchemas = new Map<string, Anthropic.Tool>();

  constructor(router: McpRouter) {
    this.router = router;
  }

  /**
   * Queries the gateway for all registered tools and caches their schemas.
   * Returns the list in Anthropic tool format.
   */
  async getAnthropicTools(): Promise<Anthropic.Tool[]> {
    // Prefer real schemas from the router (populated when MCP servers are registered).
    // Fall back to a permissive open schema when the router has no schema metadata
    // (e.g. in tests or when no MCP servers are connected).
    const schemas = this.router.listToolSchemas?.() ?? [];
    const schemaMap = new Map(schemas.map((s) => [s.name, s]));

    const registered = this.router.listTools();
    const tools: Anthropic.Tool[] = registered.map(({ name }) => {
      const mcpSchema = schemaMap.get(name);
      const tool: Anthropic.Tool = {
        name,
        description: mcpSchema?.description ?? this.describeToolName(name),
        input_schema: (mcpSchema?.inputSchema
          ? {
              type: "object",
              properties: mcpSchema.inputSchema.properties ?? {},
              ...(mcpSchema.inputSchema.required ? { required: mcpSchema.inputSchema.required } : {}),
            }
          : {
              type: "object",
              properties: {},
              additionalProperties: true,
            }) as Anthropic.Tool["input_schema"],
      };
      this.toolSchemas.set(name, tool);
      return tool;
    });

    return tools;
  }

  /**
   * Execute a tool call from Claude through the real MCP gateway.
   */
  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<ToolResult> {
    return this.router.callTool(toolName, toolInput);
  }

  /**
   * Returns true if the tool is available in the gateway.
   */
  hasTools(): boolean {
    return this.router.listTools().length > 0;
  }

  /**
   * Produces a human-readable description from a namespaced tool name.
   * e.g. "web/navigate" → "Navigate the browser to a URL"
   *      "api/request"  → "Make an HTTP API request"
   */
  private describeToolName(name: string): string {
    const descriptions: Record<string, string> = {
      // Web browser tools
      "web.navigate": "Navigate the browser to a URL and return the page response",
      "web.click": "Click on a DOM element identified by a CSS selector",
      "web.fill": "Fill an input field with a value",
      "web.type": "Type text into the currently focused element",
      "web.select": "Select an option from a dropdown",
      "web.waitForSelector": "Wait until a DOM element matching the selector is visible",
      "web.getText": "Get the visible text content of a DOM element",
      "web.getAttribute": "Get the value of an attribute on a DOM element",
      "web.screenshot": "Take a screenshot of the current page",
      "web.snapshot": "Get the current page DOM snapshot and metadata",
      "web.evaluate": "Execute JavaScript in the browser context and return the result",
      "web.getConsoleErrors": "Retrieve any JavaScript console errors from the page",
      "web.network": "Inspect network requests made by the page",
      "web.startPerformance": "Start capturing performance metrics",
      "web.getPerformanceMetrics": "Retrieve captured performance metrics (FCP, LCP, etc.)",
      "web.assert": "Assert a condition on the current page state",
      "web.launch": "Launch a new browser instance",
      "web.close": "Close the browser",
      "web.setViewport": "Set the browser viewport size",
      // API tools
      "api.request": "Make an HTTP request (GET, POST, PUT, DELETE, PATCH) to an API endpoint",
      "api.graphql": "Execute a GraphQL query or mutation",
      "api.configure": "Configure the API client with base URL and authentication",
      "api.loadTest": "Run a load test against an endpoint measuring p95 and error rate",
      "api.contract": "Validate an API response against an OpenAPI contract",
      // Salesforce tools
      "salesforce.auth.login": "Authenticate with Salesforce and obtain a session",
      "salesforce.auth.logout": "Log out of the current Salesforce session",
      "salesforce.data.soqlQuery": "Execute a SOQL query against Salesforce",
      "salesforce.data.createRecord": "Create a new Salesforce record",
      "salesforce.data.updateRecord": "Update an existing Salesforce record",
      "salesforce.data.deleteRecord": "Delete a Salesforce record",
      "salesforce.data.getRecord": "Retrieve a Salesforce record by ID",
      "salesforce.apex.execute": "Execute anonymous Apex code",
      "salesforce.metadata.describe": "Describe Salesforce object metadata",
      "salesforce.integration.check": "Verify Salesforce integration points",
      // SAP tools
      "sap.connect": "Connect to an SAP system",
      "sap.disconnect": "Disconnect from the SAP system",
      "sap.rfc.callFunction": "Call an SAP RFC/BAPI function module",
      "sap.odata.request": "Make an OData request to an SAP system",
      "sap.fiori.navigate": "Navigate to a Fiori Launchpad app",
      "sap.idoc.send": "Send an IDoc message to SAP",
      // Data / database tools
      "data.connect": "Connect to a database (PostgreSQL, MySQL, SQLite, etc.)",
      "data.disconnect": "Disconnect from the database",
      "data.query": "Execute a SQL query and return the results",
      "data.validate": "Validate database records against expected values",
      "data.compare": "Compare two datasets for equality or differences",
      "data.generate": "Generate test data matching a schema",
    };

    return descriptions[name] ?? `Execute the ${name} operation`;
  }
}
