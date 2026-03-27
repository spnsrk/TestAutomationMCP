import { z } from "zod";
import { GraphQLClient, gql } from "graphql-request";
import type { ToolResult } from "@test-automation-mcp/core";

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function executeGraphQL(params: {
  endpoint: string;
  document: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<{ data: unknown; duration: number }> {
  const client = new GraphQLClient(params.endpoint, {
    headers: params.headers,
  });

  const start = performance.now();
  const data = await client.request(gql`${params.document}`, params.variables);
  const duration = Math.round(performance.now() - start);
  return { data, duration };
}

export const graphqlTools = {
  "api/graphql.query": {
    description: "Execute a GraphQL query and return the response",
    inputSchema: z.object({
      endpoint: z.string().describe("GraphQL endpoint URL"),
      query: z.string().describe("GraphQL query string"),
      variables: z.record(z.any()).optional().describe("Query variables"),
      headers: z.record(z.string()).optional().describe("Request headers"),
    }),
    handler: async (params: {
      endpoint: string;
      query: string;
      variables?: Record<string, unknown>;
      headers?: Record<string, string>;
    }): Promise<ToolResult> => {
      const { data, duration } = await executeGraphQL({
        endpoint: params.endpoint,
        document: params.query,
        variables: params.variables,
        headers: params.headers,
      });

      return {
        status: "success",
        tool: "api/graphql.query",
        duration,
        data: { result: data, duration },
      };
    },
  },

  "api/graphql.mutate": {
    description: "Execute a GraphQL mutation and return the response",
    inputSchema: z.object({
      endpoint: z.string().describe("GraphQL endpoint URL"),
      mutation: z.string().describe("GraphQL mutation string"),
      variables: z.record(z.any()).optional().describe("Mutation variables"),
      headers: z.record(z.string()).optional().describe("Request headers"),
    }),
    handler: async (params: {
      endpoint: string;
      mutation: string;
      variables?: Record<string, unknown>;
      headers?: Record<string, string>;
    }): Promise<ToolResult> => {
      const { data, duration } = await executeGraphQL({
        endpoint: params.endpoint,
        document: params.mutation,
        variables: params.variables,
        headers: params.headers,
      });

      return {
        status: "success",
        tool: "api/graphql.mutate",
        duration,
        data: { result: data, duration },
      };
    },
  },

  "api.graphql.assertField": {
    description: "Assert that a specific field in a GraphQL response matches the expected value",
    inputSchema: z.object({
      endpoint: z.string().describe("GraphQL endpoint URL"),
      query: z.string().describe("GraphQL query string"),
      variables: z.record(z.any()).optional().describe("Query variables"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      fieldPath: z.string().describe("Dot-separated path to the field (e.g. 'user.name')"),
      expectedValue: z.any().describe("Expected value of the field"),
    }),
    handler: async (params: {
      endpoint: string;
      query: string;
      variables?: Record<string, unknown>;
      headers?: Record<string, string>;
      fieldPath: string;
      expectedValue: unknown;
    }): Promise<ToolResult> => {
      const { data, duration } = await executeGraphQL({
        endpoint: params.endpoint,
        document: params.query,
        variables: params.variables,
        headers: params.headers,
      });

      const actualValue = getValueByPath(data, params.fieldPath);
      const passed = JSON.stringify(actualValue) === JSON.stringify(params.expectedValue);

      return {
        status: passed ? "success" : "failure",
        tool: "api.graphql.assertField",
        duration,
        data: {
          passed,
          fieldPath: params.fieldPath,
          expected: params.expectedValue,
          actual: actualValue,
          fullResponse: data,
        },
      };
    },
  },
};
