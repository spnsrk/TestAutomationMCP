import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

export const snapshotTools = {
  "web/snapshot": {
    description:
      "Get a structured accessibility snapshot of the current page (LLM-friendly representation)",
    inputSchema: z.object({
      interestingOnly: z.boolean().default(true).describe("Only include interactive/meaningful elements"),
    }),
    handler: async (
      page: Page,
      params: { interestingOnly?: boolean }
    ): Promise<ToolResult> => {
      const snapshot = await page.locator(":root").ariaSnapshot();
      return {
        status: "success",
        tool: "web/snapshot",
        duration: 0,
        data: {
          snapshot,
          url: page.url(),
          title: await page.title(),
        },
      };
    },
  },

  "web/screenshot": {
    description: "Take a screenshot of the current page or a specific element",
    inputSchema: z.object({
      path: z.string().optional().describe("File path to save the screenshot"),
      selector: z.string().optional().describe("Selector for element screenshot"),
      fullPage: z.boolean().default(false),
      type: z.enum(["png", "jpeg"]).default("png"),
    }),
    handler: async (
      page: Page,
      params: { path?: string; selector?: string; fullPage?: boolean; type?: "png" | "jpeg" }
    ): Promise<ToolResult> => {
      let buffer: Buffer;
      if (params.selector) {
        buffer = await page.locator(params.selector).screenshot({
          path: params.path,
          type: params.type ?? "png",
        });
      } else {
        buffer = await page.screenshot({
          path: params.path,
          fullPage: params.fullPage ?? false,
          type: params.type ?? "png",
        });
      }
      return {
        status: "success",
        tool: "web/screenshot",
        duration: 0,
        data: {
          path: params.path,
          size: buffer.length,
          base64: params.path ? undefined : buffer.toString("base64").slice(0, 100) + "...",
        },
        metadata: { screenshot: params.path },
      };
    },
  },

  "web/getDOM": {
    description: "Get the HTML content of the page or a specific element",
    inputSchema: z.object({
      selector: z.string().optional().describe("Selector to get HTML of a specific element"),
      outer: z.boolean().default(true).describe("Include the outer element HTML"),
    }),
    handler: async (
      page: Page,
      params: { selector?: string; outer?: boolean }
    ): Promise<ToolResult> => {
      let html: string;
      if (params.selector) {
        const prop = params.outer ? "outerHTML" : "innerHTML";
        html = await page.locator(params.selector).evaluate(
          (el, p) => (p === "outerHTML" ? el.outerHTML : el.innerHTML),
          prop
        );
      } else {
        html = await page.content();
      }
      return {
        status: "success",
        tool: "web/getDOM",
        duration: 0,
        data: { html: html.slice(0, 50000) },
      };
    },
  },

  "web/evaluate": {
    description: "Execute JavaScript in the browser context and return the result",
    inputSchema: z.object({
      expression: z.string().describe("JavaScript expression to evaluate"),
    }),
    handler: async (
      page: Page,
      params: { expression: string }
    ): Promise<ToolResult> => {
      const result = await page.evaluate(params.expression);
      return {
        status: "success",
        tool: "web/evaluate",
        duration: 0,
        data: { result },
      };
    },
  },
};
