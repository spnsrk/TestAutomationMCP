import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createLogger } from "@test-automation-mcp/core";
import { navigateTools } from "./tools/navigate.js";
import { interactTools } from "./tools/interact.js";
import { snapshotTools } from "./tools/snapshot.js";
import { assertTools } from "./tools/assert.js";
import { networkTools } from "./tools/network.js";
import { visualTools } from "./tools/visual.js";
import { performanceTools } from "./tools/performance.js";
import { z } from "zod";

const logger = createLogger("mcp-server-web");

export class WebMcpServer {
  private server: McpServer;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor() {
    this.server = new McpServer({
      name: "test-automation-web",
      version: "0.1.0",
    });

    this.registerTools();
  }

  private async ensureBrowser(): Promise<Page> {
    if (!this.browser) {
      logger.info("Launching browser");
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
    }
    if (!this.page) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  private registerTools(): void {
    this.server.tool(
      "web.launch",
      "Launch a new browser instance with optional configuration",
      {
        headless: z.boolean().default(true).describe("Run browser in headless mode"),
        browserType: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
        width: z.number().default(1280),
        height: z.number().default(720),
      },
      async (params) => {
        if (this.browser) {
          await this.browser.close();
        }
        const { chromium: cr, firefox, webkit } = await import("playwright");
        const launcher = params.browserType === "firefox" ? firefox
          : params.browserType === "webkit" ? webkit
          : cr;

        this.browser = await launcher.launch({ headless: params.headless });
        this.context = await this.browser.newContext({
          viewport: { width: params.width, height: params.height },
        });
        this.page = await this.context.newPage();
        logger.info({ browser: params.browserType }, "Browser launched");
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "success", browser: params.browserType }) }],
        };
      }
    );

    this.server.tool(
      "web.close",
      "Close the browser instance",
      {},
      async () => {
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
          this.context = null;
          this.page = null;
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ status: "success" }) }],
        };
      }
    );

    const allTools = {
      ...navigateTools,
      ...interactTools,
      ...snapshotTools,
      ...assertTools,
      ...networkTools,
      ...visualTools,
      ...performanceTools,
    };

    for (const [name, tool] of Object.entries(allTools)) {
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
                { type: "text" as const, text: JSON.stringify({ ...result as object, duration }) },
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
