import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import axios, { type AxiosInstance } from "axios";
import { createLogger } from "@test-automation-mcp/core";
import { z } from "zod";

import { authTools, resetConnectionState, getRfcClient } from "./tools/auth.js";
import { fioriTools } from "./tools/fiori.js";
import { rfcTools } from "./tools/rfc.js";
import { odataTools, setODataSession } from "./tools/odata.js";
import { guiTools } from "./tools/gui.js";
import { idocTools } from "./tools/idoc.js";

const logger = createLogger("mcp-server-sap");

export class SapMcpServer {
  private server: McpServer;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.server = new McpServer({
      name: "test-automation-sap",
      version: "0.1.0",
    });

    this.axiosInstance = axios.create({
      timeout: 60000,
      headers: {
        Accept: "application/json",
      },
      withCredentials: true,
    });

    this.registerTools();
  }

  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      logger.info("Launching browser for SAP Fiori testing");
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
    }
    if (!this.page) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  private createAxiosFactory(): () => AxiosInstance {
    return () => this.axiosInstance;
  }

  private registerTools(): void {
    const pageTools = {
      ...authTools,
      ...fioriTools,
      ...guiTools,
    };

    for (const [name, tool] of Object.entries(pageTools)) {
      const toolDef = tool as {
        description: string;
        inputSchema: z.ZodType;
        handler: (page: Page, params: Record<string, unknown>) => Promise<unknown>;
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
            const page = await this.ensureBrowser();
            const result = await toolDef.handler(page, params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "Tool executed");
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

    const rfcPageTools = {
      ...rfcTools,
      ...idocTools,
    };

    for (const [name, tool] of Object.entries(rfcPageTools)) {
      const toolDef = tool as {
        description: string;
        inputSchema: z.ZodType;
        handler: (page: Page, params: Record<string, unknown>) => Promise<unknown>;
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
            const page = await this.ensureBrowser();
            const result = await toolDef.handler(page, params);
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "Tool executed");
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

    for (const [name, tool] of Object.entries(odataTools)) {
      const toolDef = tool as unknown as {
        description: string;
        inputSchema: z.ZodType;
        handler: (
          page: Page,
          params: Record<string, unknown>,
          context?: { axiosFactory: () => AxiosInstance }
        ) => Promise<unknown>;
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
            const page = await this.ensureBrowser();
            const result = await toolDef.handler(page, params, {
              axiosFactory: this.createAxiosFactory(),
            });
            const duration = Math.round(performance.now() - start);
            logger.info({ tool: name, duration }, "Tool executed");
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

  getServer(): McpServer {
    return this.server;
  }

  async cleanup(): Promise<void> {
    const rfcClient = getRfcClient();
    if (rfcClient) {
      try {
        await rfcClient.close();
      } catch (err) {
        logger.warn({ error: err }, "Error closing RFC client");
      }
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    setODataSession(null);
    resetConnectionState();

    logger.info("SAP MCP Server resources cleaned up");
  }
}
