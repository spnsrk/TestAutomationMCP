import { z } from "zod";
import type { Page, Route } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

const activeRoutes = new Map<string, (route: Route) => void>();

export const networkTools = {
  "web/interceptRequest": {
    description: "Intercept network requests matching a URL pattern and optionally mock the response",
    inputSchema: z.object({
      urlPattern: z.string().describe("URL glob or regex to intercept"),
      mockStatus: z.number().optional(),
      mockBody: z.string().optional(),
      mockHeaders: z.record(z.string(), z.string()).optional(),
      abort: z.boolean().default(false).describe("Abort the request instead of mocking"),
    }),
    handler: async (
      page: Page,
      params: {
        urlPattern: string;
        mockStatus?: number;
        mockBody?: string;
        mockHeaders?: Record<string, string>;
        abort?: boolean;
      }
    ): Promise<ToolResult> => {
      const routeHandler = async (route: Route) => {
        if (params.abort) {
          await route.abort();
        } else if (params.mockStatus || params.mockBody) {
          await route.fulfill({
            status: params.mockStatus ?? 200,
            body: params.mockBody ?? "",
            headers: params.mockHeaders,
          });
        } else {
          await route.continue();
        }
      };

      activeRoutes.set(params.urlPattern, routeHandler);
      await page.route(params.urlPattern, routeHandler);

      return {
        status: "success",
        tool: "web/interceptRequest",
        duration: 0,
        data: { urlPattern: params.urlPattern, abort: params.abort },
      };
    },
  },

  "web/removeIntercept": {
    description: "Remove a previously set request interceptor",
    inputSchema: z.object({
      urlPattern: z.string(),
    }),
    handler: async (
      page: Page,
      params: { urlPattern: string }
    ): Promise<ToolResult> => {
      const handler = activeRoutes.get(params.urlPattern);
      if (handler) {
        await page.unroute(params.urlPattern, handler);
        activeRoutes.delete(params.urlPattern);
      }
      return {
        status: "success",
        tool: "web/removeIntercept",
        duration: 0,
        data: { urlPattern: params.urlPattern },
      };
    },
  },

  "web/waitForResponse": {
    description: "Wait for a network response matching a URL pattern",
    inputSchema: z.object({
      urlPattern: z.string(),
      status: z.number().optional(),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { urlPattern: string; status?: number; timeout?: number }
    ): Promise<ToolResult> => {
      const response = await page.waitForResponse(
        (resp) => {
          const urlMatches = resp.url().includes(params.urlPattern);
          const statusMatches = params.status ? resp.status() === params.status : true;
          return urlMatches && statusMatches;
        },
        { timeout: params.timeout ?? 30000 }
      );

      return {
        status: "success",
        tool: "web/waitForResponse",
        duration: 0,
        data: {
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
        },
      };
    },
  },

  "web.waitForRequest": {
    description: "Wait for a network request matching a URL pattern",
    inputSchema: z.object({
      urlPattern: z.string(),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { urlPattern: string; timeout?: number }
    ): Promise<ToolResult> => {
      const request = await page.waitForRequest(
        (req) => req.url().includes(params.urlPattern),
        { timeout: params.timeout ?? 30000 }
      );

      return {
        status: "success",
        tool: "web.waitForRequest",
        duration: 0,
        data: {
          url: request.url(),
          method: request.method(),
          postData: request.postData(),
        },
      };
    },
  },
};
