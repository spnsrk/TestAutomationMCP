import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

export const interactTools = {
  "web/click": {
    description: "Click an element on the page",
    inputSchema: z.object({
      selector: z.string().describe("CSS selector, text content, or role-based selector"),
      button: z.enum(["left", "right", "middle"]).default("left"),
      clickCount: z.number().default(1),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { selector: string; button?: "left" | "right" | "middle"; clickCount?: number; timeout?: number }
    ): Promise<ToolResult> => {
      await page.click(params.selector, {
        button: params.button ?? "left",
        clickCount: params.clickCount ?? 1,
        timeout: params.timeout ?? 30000,
      });
      return {
        status: "success",
        tool: "web/click",
        duration: 0,
        data: { selector: params.selector },
      };
    },
  },

  "web/fill": {
    description: "Fill an input field with text (clears existing value first)",
    inputSchema: z.object({
      selector: z.string().describe("Selector for the input element"),
      value: z.string().describe("Text to fill"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { selector: string; value: string; timeout?: number }
    ): Promise<ToolResult> => {
      await page.fill(params.selector, params.value, {
        timeout: params.timeout ?? 30000,
      });
      return {
        status: "success",
        tool: "web/fill",
        duration: 0,
        data: { selector: params.selector, value: params.value },
      };
    },
  },

  "web/type": {
    description: "Type text character by character (appends to existing value)",
    inputSchema: z.object({
      selector: z.string(),
      text: z.string(),
      delay: z.number().default(50).describe("Delay between keystrokes in ms"),
    }),
    handler: async (
      page: Page,
      params: { selector: string; text: string; delay?: number }
    ): Promise<ToolResult> => {
      await page.locator(params.selector).pressSequentially(params.text, {
        delay: params.delay ?? 50,
      });
      return {
        status: "success",
        tool: "web/type",
        duration: 0,
        data: { selector: params.selector, text: params.text },
      };
    },
  },

  "web/select": {
    description: "Select an option from a dropdown",
    inputSchema: z.object({
      selector: z.string(),
      value: z.string().optional(),
      label: z.string().optional(),
      index: z.number().optional(),
    }),
    handler: async (
      page: Page,
      params: { selector: string; value?: string; label?: string; index?: number }
    ): Promise<ToolResult> => {
      let selected: string[];
      if (params.value) {
        selected = await page.selectOption(params.selector, { value: params.value });
      } else if (params.label) {
        selected = await page.selectOption(params.selector, { label: params.label });
      } else if (params.index !== undefined) {
        selected = await page.selectOption(params.selector, { index: params.index });
      } else {
        return {
          status: "error",
          tool: "web/select",
          duration: 0,
          error: { code: "INVALID_PARAMS", message: "Provide value, label, or index" },
        };
      }
      return {
        status: "success",
        tool: "web/select",
        duration: 0,
        data: { selector: params.selector, selected },
      };
    },
  },

  "web/hover": {
    description: "Hover over an element",
    inputSchema: z.object({
      selector: z.string(),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { selector: string; timeout?: number }
    ): Promise<ToolResult> => {
      await page.hover(params.selector, { timeout: params.timeout ?? 30000 });
      return {
        status: "success",
        tool: "web/hover",
        duration: 0,
        data: { selector: params.selector },
      };
    },
  },

  "web/pressKey": {
    description: "Press a keyboard key or key combination",
    inputSchema: z.object({
      key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Control+A')"),
    }),
    handler: async (
      page: Page,
      params: { key: string }
    ): Promise<ToolResult> => {
      await page.keyboard.press(params.key);
      return {
        status: "success",
        tool: "web/pressKey",
        duration: 0,
        data: { key: params.key },
      };
    },
  },

  "web/upload": {
    description: "Upload a file to a file input element",
    inputSchema: z.object({
      selector: z.string(),
      filePath: z.string(),
    }),
    handler: async (
      page: Page,
      params: { selector: string; filePath: string }
    ): Promise<ToolResult> => {
      await page.setInputFiles(params.selector, params.filePath);
      return {
        status: "success",
        tool: "web/upload",
        duration: 0,
        data: { selector: params.selector, filePath: params.filePath },
      };
    },
  },
};
