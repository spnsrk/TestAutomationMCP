import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Connection } from "jsforce";
import { z } from "zod";
import { createLogger } from "@test-automation-mcp/core";
import { authTools, createAuthState, type AuthState } from "./tools/auth.js";
import { dataTools } from "./tools/data.js";
import { apexTools } from "./tools/apex.js";
import { uiTools } from "./tools/ui.js";
import { metadataTools } from "./tools/metadata.js";
import { integrationTools } from "./tools/integration.js";

const logger = createLogger("mcp-server-salesforce");

type AuthToolHandler = (authState: AuthState, params: Record<string, unknown>) => Promise<unknown>;
type ConnToolHandler = (conn: Connection, params: Record<string, unknown>) => Promise<unknown>;
type UiToolHandler = (page: Page, conn: Connection, params: Record<string, unknown>) => Promise<unknown>;

interface ToolDefinition {
  description: string;
  inputSchema: z.ZodType;
  handler: AuthToolHandler | ConnToolHandler | UiToolHandler;
}

export class SalesforceMcpServer {
  private server: McpServer;
  private authState: AuthState;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor() {
    this.server = new McpServer({
      name: "test-automation-salesforce",
      version: "0.1.0",
    });

    this.authState = createAuthState();
    this.registerTools();
  }

  private getConnection(): Connection {
    if (!this.authState.connection) {
      throw new Error(
        "No active Salesforce connection. Call sf/auth.login first."
      );
    }
    return this.authState.connection;
  }

  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      logger.info("Launching browser for UI testing");
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });
    }
    if (!this.context) {
      const conn = this.getConnection();
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        baseURL: conn.instanceUrl,
      });

      const sid = conn.accessToken;
      if (sid) {
        const instanceUrl = new URL(conn.instanceUrl);
        await this.context.addCookies([
          {
            name: "sid",
            value: sid,
            domain: instanceUrl.hostname,
            path: "/",
            httpOnly: true,
            secure: true,
          },
        ]);
      }
    }
    if (!this.page) {
      this.page = await this.context.newPage();

      const conn = this.getConnection();
      const frontdoorUrl = `${conn.instanceUrl}/secur/frontdoor.jsp?sid=${conn.accessToken}`;
      await this.page.goto(frontdoorUrl, { waitUntil: "domcontentloaded" });
    }
    return this.page;
  }

  private registerTools(): void {
    this.registerAuthTools();
    this.registerConnectionTools("data", dataTools);
    this.registerConnectionTools("apex", apexTools);
    this.registerConnectionTools("metadata", metadataTools);
    this.registerConnectionTools("integration", integrationTools);
    this.registerUiTools();
  }

  private registerAuthTools(): void {
    for (const [name, tool] of Object.entries(authTools)) {
      const toolDef = tool as unknown as ToolDefinition;
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
            const handler = toolDef.handler as AuthToolHandler;
            const result = await handler(this.authState, params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "Auth tool executed");
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ ...(result as object), duration }),
                },
              ],
            };
          } catch (err) {
            const duration = Math.round(performance.now() - start);
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ tool: name, error: message, duration }, "Auth tool failed");
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    status: "error",
                    tool: name,
                    duration,
                    error: { code: "AUTH_ERROR", message },
                  }),
                },
              ],
              isError: true,
            };
          }
        }
      );
    }
  }

  private registerConnectionTools(
    category: string,
    tools: Record<string, unknown>
  ): void {
    for (const [name, tool] of Object.entries(tools)) {
      const toolDef = tool as unknown as ToolDefinition;
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
            const conn = this.getConnection();
            const handler = toolDef.handler as ConnToolHandler;
            const result = await handler(conn, params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration, category }, "Tool executed");
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ ...(result as object), duration }),
                },
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
  }

  private registerUiTools(): void {
    for (const [name, tool] of Object.entries(uiTools)) {
      const toolDef = tool as unknown as ToolDefinition;
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
            const conn = this.getConnection();
            const page = await this.ensureBrowser();
            const handler = toolDef.handler as UiToolHandler;
            const result = await handler(page, conn, params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "UI tool executed");
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ ...(result as object), duration }),
                },
              ],
            };
          } catch (err) {
            const duration = Math.round(performance.now() - start);
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ tool: name, error: message, duration }, "UI tool failed");

            let screenshot: string | undefined;
            if (this.page) {
              try {
                const buf = await this.page.screenshot({ type: "png" });
                screenshot = buf.toString("base64");
              } catch {
                // screenshot capture failed
              }
            }

            const errorPayload: Record<string, unknown> = {
              status: "error",
              tool: name,
              duration,
              error: { code: "UI_ERROR", message },
            };
            if (screenshot) {
              errorPayload.screenshot = screenshot;
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(errorPayload),
                },
              ],
              isError: true,
            };
          }
        }
      );
    }
  }

  getServer(): McpServer {
    return this.server;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    if (this.authState.connection) {
      try {
        await this.authState.connection.logout();
      } catch {
        // ignore cleanup errors
      }
      this.authState = createAuthState();
    }
  }
}
