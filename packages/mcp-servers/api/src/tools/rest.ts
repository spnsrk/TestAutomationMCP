import { z } from "zod";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import Ajv from "ajv";
import type { ToolResult } from "@test-automation-mcp/core";

const ajv = new ((Ajv as any).default ?? (Ajv as any))({ allErrors: true, strict: false });

async function makeRequest(params: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  validateStatus?: boolean;
}): Promise<{ response: AxiosResponse; duration: number }> {
  const config: AxiosRequestConfig = {
    method: params.method.toLowerCase() as AxiosRequestConfig["method"],
    url: params.url,
    headers: params.headers,
    data: params.body,
    timeout: params.timeout ?? 30000,
    validateStatus: params.validateStatus === false ? undefined : () => true,
  };

  const start = performance.now();
  const response = await axios(config);
  const duration = Math.round(performance.now() - start);
  return { response, duration };
}

export const restTools = {
  "api/rest.request": {
    description: "Make an HTTP request and return the response",
    inputSchema: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      url: z.string().describe("Request URL"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      body: z.any().optional().describe("Request body (JSON)"),
      timeout: z.number().optional().default(30000).describe("Request timeout in ms"),
      validateStatus: z.boolean().optional().default(true).describe("Accept any HTTP status without throwing"),
    }),
    handler: async (params: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
      timeout?: number;
      validateStatus?: boolean;
    }): Promise<ToolResult> => {
      const { response, duration } = await makeRequest(params);

      return {
        status: "success",
        tool: "api/rest.request",
        duration,
        data: {
          statusCode: response.status,
          statusText: response.statusText,
          headers: response.headers as Record<string, string>,
          body: response.data,
          duration,
        },
      };
    },
  },

  "api/rest.assertStatus": {
    description: "Assert that an HTTP request returns the expected status code",
    inputSchema: z.object({
      url: z.string().describe("Request URL"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      expectedStatus: z.number().describe("Expected HTTP status code"),
    }),
    handler: async (params: {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers?: Record<string, string>;
      body?: unknown;
      expectedStatus: number;
    }): Promise<ToolResult> => {
      const { response, duration } = await makeRequest(params);
      const passed = response.status === params.expectedStatus;

      return {
        status: passed ? "success" : "failure",
        tool: "api/rest.assertStatus",
        duration,
        data: {
          passed,
          expected: params.expectedStatus,
          actual: response.status,
          url: params.url,
          method: params.method,
        },
      };
    },
  },

  "api.rest.assertSchema": {
    description: "Validate an HTTP response body against a JSON Schema",
    inputSchema: z.object({
      url: z.string().describe("Request URL"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      schema: z.record(z.any()).describe("JSON Schema to validate against"),
    }),
    handler: async (params: {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers?: Record<string, string>;
      body?: unknown;
      schema: Record<string, unknown>;
    }): Promise<ToolResult> => {
      const { response, duration } = await makeRequest(params);

      const validate = ajv.compile(params.schema);
      const valid = validate(response.data);

      return {
        status: valid ? "success" : "failure",
        tool: "api.rest.assertSchema",
        duration,
        data: {
          passed: valid,
          url: params.url,
          method: params.method,
          statusCode: response.status,
          errors: valid ? undefined : validate.errors,
          body: response.data,
        },
      };
    },
  },

  "api/rest.assertHeaders": {
    description: "Assert that an HTTP response contains the expected headers",
    inputSchema: z.object({
      url: z.string().describe("Request URL"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      expectedHeaders: z.record(z.string()).describe("Expected response headers (case-insensitive keys)"),
    }),
    handler: async (params: {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers?: Record<string, string>;
      body?: unknown;
      expectedHeaders: Record<string, string>;
    }): Promise<ToolResult> => {
      const { response, duration } = await makeRequest(params);

      const mismatches: Array<{ header: string; expected: string; actual: string | undefined }> = [];
      for (const [key, expectedValue] of Object.entries(params.expectedHeaders)) {
        const actualValue = response.headers[key.toLowerCase()] as string | undefined;
        if (actualValue !== expectedValue) {
          mismatches.push({ header: key, expected: expectedValue, actual: actualValue });
        }
      }

      const passed = mismatches.length === 0;
      return {
        status: passed ? "success" : "failure",
        tool: "api/rest.assertHeaders",
        duration,
        data: {
          passed,
          url: params.url,
          method: params.method,
          mismatches: passed ? undefined : mismatches,
          responseHeaders: response.headers as Record<string, string>,
        },
      };
    },
  },

  "api.rest.assertResponseTime": {
    description: "Assert that an HTTP request completes within the specified time",
    inputSchema: z.object({
      url: z.string().describe("Request URL"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      maxMs: z.number().describe("Maximum allowed response time in milliseconds"),
    }),
    handler: async (params: {
      url: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      headers?: Record<string, string>;
      body?: unknown;
      maxMs: number;
    }): Promise<ToolResult> => {
      const { response, duration } = await makeRequest(params);
      const passed = duration <= params.maxMs;

      return {
        status: passed ? "success" : "failure",
        tool: "api.rest.assertResponseTime",
        duration,
        data: {
          passed,
          maxMs: params.maxMs,
          actualMs: duration,
          url: params.url,
          method: params.method,
          statusCode: response.status,
        },
      };
    },
  },
};
