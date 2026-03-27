import { z } from "zod";
import axios from "axios";
import Ajv from "ajv";
import { readFile } from "node:fs/promises";
import type { ToolResult } from "@test-automation-mcp/core";

const ajv = new ((Ajv as any).default ?? (Ajv as any))({ allErrors: true, strict: false });

interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
  definitions?: Record<string, unknown>;
}

interface OpenAPIOperation {
  responses?: Record<string, {
    description?: string;
    content?: Record<string, { schema?: Record<string, unknown> }>;
    schema?: Record<string, unknown>;
  }>;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
}

async function loadSpec(specUrlOrPath: string): Promise<OpenAPISpec> {
  if (specUrlOrPath.startsWith("http://") || specUrlOrPath.startsWith("https://")) {
    const response = await axios.get(specUrlOrPath);
    return response.data as OpenAPISpec;
  }
  const content = await readFile(specUrlOrPath, "utf-8");
  return JSON.parse(content) as OpenAPISpec;
}

function resolveRef(spec: OpenAPISpec, ref: string): unknown {
  const path = ref.replace("#/", "").split("/");
  let current: unknown = spec;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveSchema(spec: OpenAPISpec, schema: Record<string, unknown>): Record<string, unknown> {
  if (schema["$ref"] && typeof schema["$ref"] === "string") {
    const resolved = resolveRef(spec, schema["$ref"]);
    if (resolved && typeof resolved === "object") {
      return resolveSchema(spec, resolved as Record<string, unknown>);
    }
  }

  const result: Record<string, unknown> = { ...schema };
  if (result.properties && typeof result.properties === "object") {
    const resolvedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        resolvedProps[key] = resolveSchema(spec, value as Record<string, unknown>);
      } else {
        resolvedProps[key] = value;
      }
    }
    result.properties = resolvedProps;
  }
  if (result.items && typeof result.items === "object") {
    result.items = resolveSchema(spec, result.items as Record<string, unknown>);
  }
  return result;
}

function getResponseSchema(
  spec: OpenAPISpec,
  endpoint: string,
  method: string,
  statusCode = "200"
): Record<string, unknown> | undefined {
  const pathDef = spec.paths?.[endpoint];
  if (!pathDef) return undefined;

  const operation = pathDef[method.toLowerCase()];
  if (!operation?.responses) return undefined;

  const responseDef = operation.responses[statusCode] ?? operation.responses["default"];
  if (!responseDef) return undefined;

  // OpenAPI 3.x
  if (responseDef.content) {
    const jsonContent = responseDef.content["application/json"];
    if (jsonContent?.schema) {
      return resolveSchema(spec, jsonContent.schema);
    }
  }

  // Swagger 2.x
  if (responseDef.schema) {
    return resolveSchema(spec, responseDef.schema);
  }

  return undefined;
}

export const contractTools = {
  "api.contract.validateOpenAPI": {
    description: "Validate an API response against an OpenAPI specification",
    inputSchema: z.object({
      specUrl: z.string().optional().describe("URL to fetch the OpenAPI spec"),
      specPath: z.string().optional().describe("Local file path to the OpenAPI spec"),
      endpoint: z.string().describe("API endpoint path (e.g. /users/{id})"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      baseUrl: z.string().optional().describe("Base URL for making the actual API call"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      statusCode: z.string().optional().default("200").describe("Expected status code to validate schema against"),
    }),
    handler: async (params: {
      specUrl?: string;
      specPath?: string;
      endpoint: string;
      method: string;
      baseUrl?: string;
      headers?: Record<string, string>;
      body?: unknown;
      statusCode?: string;
    }): Promise<ToolResult> => {
      const start = performance.now();

      const specSource = params.specUrl ?? params.specPath;
      if (!specSource) {
        return {
          status: "error",
          tool: "api.contract.validateOpenAPI",
          duration: Math.round(performance.now() - start),
          error: {
            code: "MISSING_SPEC",
            message: "Either specUrl or specPath must be provided",
          },
        };
      }

      const spec = await loadSpec(specSource);
      const responseSchema = getResponseSchema(spec, params.endpoint, params.method, params.statusCode ?? "200");

      if (!responseSchema) {
        return {
          status: "error",
          tool: "api.contract.validateOpenAPI",
          duration: Math.round(performance.now() - start),
          error: {
            code: "SCHEMA_NOT_FOUND",
            message: `No response schema found for ${params.method} ${params.endpoint} (status ${params.statusCode ?? "200"})`,
          },
        };
      }

      if (params.baseUrl) {
        const url = `${params.baseUrl}${params.endpoint}`;
        const response = await axios({
          method: params.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete",
          url,
          headers: params.headers,
          data: params.body,
          validateStatus: () => true,
        });

        const validate = ajv.compile(responseSchema);
        const valid = validate(response.data);

        return {
          status: valid ? "success" : "failure",
          tool: "api.contract.validateOpenAPI",
          duration: Math.round(performance.now() - start),
          data: {
            passed: valid,
            endpoint: params.endpoint,
            method: params.method,
            statusCode: response.status,
            schemaErrors: valid ? undefined : validate.errors,
            responseBody: response.data,
          },
        };
      }

      return {
        status: "success",
        tool: "api.contract.validateOpenAPI",
        duration: Math.round(performance.now() - start),
        data: {
          endpoint: params.endpoint,
          method: params.method,
          schema: responseSchema,
          message: "Schema extracted successfully. Provide baseUrl to validate against a live API.",
        },
      };
    },
  },

  "api/contract.compareSpecs": {
    description: "Compare two OpenAPI specifications and detect breaking changes",
    inputSchema: z.object({
      oldSpec: z.string().describe("URL or file path to the old/baseline OpenAPI spec"),
      newSpec: z.string().describe("URL or file path to the new OpenAPI spec"),
    }),
    handler: async (params: {
      oldSpec: string;
      newSpec: string;
    }): Promise<ToolResult> => {
      const start = performance.now();

      const [oldSpecData, newSpecData] = await Promise.all([
        loadSpec(params.oldSpec),
        loadSpec(params.newSpec),
      ]);

      const oldPaths = new Set(Object.keys(oldSpecData.paths ?? {}));
      const newPaths = new Set(Object.keys(newSpecData.paths ?? {}));

      const removedEndpoints: string[] = [];
      const addedEndpoints: string[] = [];
      const changedEndpoints: Array<{
        path: string;
        changes: Array<{ type: string; detail: string }>;
      }> = [];

      for (const path of oldPaths) {
        if (!newPaths.has(path)) {
          removedEndpoints.push(path);
          continue;
        }

        const oldMethods = Object.keys(oldSpecData.paths![path]!);
        const newMethods = Object.keys(newSpecData.paths![path]!);
        const changes: Array<{ type: string; detail: string }> = [];

        for (const method of oldMethods) {
          if (!newMethods.includes(method)) {
            changes.push({ type: "method_removed", detail: `${method.toUpperCase()} removed` });
            continue;
          }

          const oldOp = oldSpecData.paths![path]![method] as OpenAPIOperation;
          const newOp = newSpecData.paths![path]![method] as OpenAPIOperation;

          const oldRequired = (oldOp.parameters ?? []).filter((p) => p.required).map((p) => p.name);
          const newRequired = (newOp.parameters ?? []).filter((p) => p.required).map((p) => p.name);
          for (const param of newRequired) {
            if (!oldRequired.includes(param)) {
              changes.push({
                type: "required_param_added",
                detail: `${method.toUpperCase()}: new required parameter '${param}'`,
              });
            }
          }

          const oldResponses = Object.keys(oldOp.responses ?? {});
          const newResponses = Object.keys(newOp.responses ?? {});
          for (const status of oldResponses) {
            if (!newResponses.includes(status)) {
              changes.push({
                type: "response_removed",
                detail: `${method.toUpperCase()}: response status '${status}' removed`,
              });
            }
          }
        }

        for (const method of newMethods) {
          if (!oldMethods.includes(method)) {
            changes.push({ type: "method_added", detail: `${method.toUpperCase()} added` });
          }
        }

        if (changes.length > 0) {
          changedEndpoints.push({ path, changes });
        }
      }

      for (const path of newPaths) {
        if (!oldPaths.has(path)) {
          addedEndpoints.push(path);
        }
      }

      const breakingChanges = removedEndpoints.length > 0 ||
        changedEndpoints.some((e) =>
          e.changes.some((c) =>
            c.type === "method_removed" || c.type === "required_param_added" || c.type === "response_removed"
          )
        );

      return {
        status: breakingChanges ? "failure" : "success",
        tool: "api/contract.compareSpecs",
        duration: Math.round(performance.now() - start),
        data: {
          hasBreakingChanges: breakingChanges,
          summary: {
            addedEndpoints: addedEndpoints.length,
            removedEndpoints: removedEndpoints.length,
            changedEndpoints: changedEndpoints.length,
          },
          addedEndpoints,
          removedEndpoints,
          changedEndpoints,
        },
      };
    },
  },
};
