import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

export const assertTools = {
  "web/assertVisible": {
    description: "Assert that an element is visible on the page",
    inputSchema: z.object({
      selector: z.string(),
      visible: z.boolean().default(true),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { selector: string; visible?: boolean; timeout?: number }
    ): Promise<ToolResult> => {
      const locator = page.locator(params.selector);
      const shouldBeVisible = params.visible ?? true;
      try {
        if (shouldBeVisible) {
          await locator.waitFor({ state: "visible", timeout: params.timeout ?? 30000 });
        } else {
          await locator.waitFor({ state: "hidden", timeout: params.timeout ?? 30000 });
        }
        return {
          status: "success",
          tool: "web/assertVisible",
          duration: 0,
          data: { selector: params.selector, visible: shouldBeVisible, passed: true },
        };
      } catch {
        return {
          status: "failure",
          tool: "web/assertVisible",
          duration: 0,
          data: { selector: params.selector, visible: shouldBeVisible, passed: false },
          error: {
            code: "ASSERTION_FAILED",
            message: `Element '${params.selector}' is ${shouldBeVisible ? "not visible" : "still visible"}`,
          },
        };
      }
    },
  },

  "web/assertText": {
    description: "Assert that an element contains specific text",
    inputSchema: z.object({
      selector: z.string(),
      text: z.string(),
      exact: z.boolean().default(false),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { selector: string; text: string; exact?: boolean; timeout?: number }
    ): Promise<ToolResult> => {
      const locator = page.locator(params.selector);
      try {
        const actualText = await locator.textContent({ timeout: params.timeout ?? 30000 });
        const matches = params.exact
          ? actualText === params.text
          : (actualText ?? "").includes(params.text);

        if (matches) {
          return {
            status: "success",
            tool: "web/assertText",
            duration: 0,
            data: { selector: params.selector, expected: params.text, actual: actualText, passed: true },
          };
        }
        return {
          status: "failure",
          tool: "web/assertText",
          duration: 0,
          data: { selector: params.selector, expected: params.text, actual: actualText, passed: false },
          error: {
            code: "ASSERTION_FAILED",
            message: `Text mismatch: expected "${params.text}", got "${actualText}"`,
          },
        };
      } catch (err) {
        return {
          status: "error",
          tool: "web/assertText",
          duration: 0,
          error: {
            code: "ASSERTION_ERROR",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  },

  "web/assertURL": {
    description: "Assert the current page URL matches an expected pattern",
    inputSchema: z.object({
      url: z.string().describe("Expected URL or regex pattern"),
      isRegex: z.boolean().default(false),
    }),
    handler: async (
      page: Page,
      params: { url: string; isRegex?: boolean }
    ): Promise<ToolResult> => {
      const currentUrl = page.url();
      const matches = params.isRegex
        ? new RegExp(params.url).test(currentUrl)
        : currentUrl === params.url;

      if (matches) {
        return {
          status: "success",
          tool: "web/assertURL",
          duration: 0,
          data: { expected: params.url, actual: currentUrl, passed: true },
        };
      }
      return {
        status: "failure",
        tool: "web/assertURL",
        duration: 0,
        data: { expected: params.url, actual: currentUrl, passed: false },
        error: {
          code: "ASSERTION_FAILED",
          message: `URL mismatch: expected "${params.url}", got "${currentUrl}"`,
        },
      };
    },
  },

  "web/assertElement": {
    description: "Assert properties of an element (attribute, CSS, count, etc.)",
    inputSchema: z.object({
      selector: z.string(),
      attribute: z.string().optional(),
      value: z.string().optional(),
      cssProperty: z.string().optional(),
      cssValue: z.string().optional(),
      count: z.number().optional(),
    }),
    handler: async (
      page: Page,
      params: {
        selector: string;
        attribute?: string;
        value?: string;
        cssProperty?: string;
        cssValue?: string;
        count?: number;
      }
    ): Promise<ToolResult> => {
      const locator = page.locator(params.selector);

      if (params.count !== undefined) {
        const actualCount = await locator.count();
        const passed = actualCount === params.count;
        return {
          status: passed ? "success" : "failure",
          tool: "web/assertElement",
          duration: 0,
          data: { selector: params.selector, expectedCount: params.count, actualCount, passed },
          error: passed
            ? undefined
            : { code: "ASSERTION_FAILED", message: `Expected ${params.count} elements, found ${actualCount}` },
        };
      }

      if (params.attribute && params.value !== undefined) {
        const actual = await locator.getAttribute(params.attribute);
        const passed = actual === params.value;
        return {
          status: passed ? "success" : "failure",
          tool: "web/assertElement",
          duration: 0,
          data: { selector: params.selector, attribute: params.attribute, expected: params.value, actual, passed },
          error: passed
            ? undefined
            : {
                code: "ASSERTION_FAILED",
                message: `Attribute '${params.attribute}' expected "${params.value}", got "${actual}"`,
              },
        };
      }

      if (params.cssProperty && params.cssValue) {
        const cssProp = params.cssProperty;
        const actual = await locator.evaluate(
          (el, prop) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (el as any).ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(prop as string);
          },
          cssProp
        ) as string;
        const passed = actual === params.cssValue;
        return {
          status: passed ? "success" : "failure",
          tool: "web/assertElement",
          duration: 0,
          data: {
            selector: params.selector,
            cssProperty: params.cssProperty,
            expected: params.cssValue,
            actual,
            passed,
          },
          error: passed
            ? undefined
            : {
                code: "ASSERTION_FAILED",
                message: `CSS '${params.cssProperty}' expected "${params.cssValue}", got "${actual}"`,
              },
        };
      }

      const exists = (await locator.count()) > 0;
      return {
        status: exists ? "success" : "failure",
        tool: "web/assertElement",
        duration: 0,
        data: { selector: params.selector, exists, passed: exists },
        error: exists
          ? undefined
          : { code: "ASSERTION_FAILED", message: `Element '${params.selector}' not found` },
      };
    },
  },
};
