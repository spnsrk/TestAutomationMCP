import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

export const navigateTools = {
  "web/navigate": {
    description: "Navigate to a URL in the browser",
    inputSchema: z.object({
      url: z.string().describe("The URL to navigate to"),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle", "commit"])
        .default("load")
        .describe("When to consider navigation complete"),
    }),
    handler: async (
      page: Page,
      params: { url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }
    ): Promise<ToolResult> => {
      const response = await page.goto(params.url, {
        waitUntil: params.waitUntil ?? "load",
      });
      return {
        status: "success",
        tool: "web/navigate",
        duration: 0,
        data: {
          url: page.url(),
          title: await page.title(),
          statusCode: response?.status(),
        },
      };
    },
  },

  "web/goBack": {
    description: "Navigate back in browser history",
    inputSchema: z.object({}),
    handler: async (page: Page): Promise<ToolResult> => {
      await page.goBack();
      return {
        status: "success",
        tool: "web/goBack",
        duration: 0,
        data: { url: page.url(), title: await page.title() },
      };
    },
  },

  "web/reload": {
    description: "Reload the current page",
    inputSchema: z.object({
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle", "commit"])
        .default("load"),
    }),
    handler: async (
      page: Page,
      params: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }
    ): Promise<ToolResult> => {
      await page.reload({ waitUntil: params.waitUntil ?? "load" });
      return {
        status: "success",
        tool: "web/reload",
        duration: 0,
        data: { url: page.url(), title: await page.title() },
      };
    },
  },

  "web/waitForURL": {
    description: "Wait for the page URL to match a pattern",
    inputSchema: z.object({
      url: z.string().describe("URL or glob pattern to wait for"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { url: string; timeout?: number }
    ): Promise<ToolResult> => {
      await page.waitForURL(params.url, { timeout: params.timeout ?? 30000 });
      return {
        status: "success",
        tool: "web/waitForURL",
        duration: 0,
        data: { url: page.url() },
      };
    },
  },
};
