import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";
import type { AxiosInstance } from "axios";

export interface ODataSession {
  axiosInstance: AxiosInstance;
  csrfToken: string | null;
  baseUrl: string;
}

let odataSession: ODataSession | null = null;

export function getODataSession(): ODataSession | null {
  return odataSession;
}

export function setODataSession(session: ODataSession | null): void {
  odataSession = session;
}

async function ensureODataSession(
  serviceUrl: string,
  axiosFactory: () => AxiosInstance
): Promise<ODataSession> {
  if (odataSession && odataSession.baseUrl === serviceUrl && odataSession.csrfToken) {
    return odataSession;
  }

  const instance = odataSession?.axiosInstance ?? axiosFactory();

  let csrfToken: string | null = null;
  try {
    const headResp = await instance.head(serviceUrl, {
      headers: { "x-csrf-token": "Fetch" },
    });
    csrfToken = (headResp.headers["x-csrf-token"] as string) ?? null;
  } catch (err) {
    const axiosErr = err as { response?: { headers?: Record<string, string> } };
    csrfToken = axiosErr.response?.headers?.["x-csrf-token"] ?? null;
  }

  odataSession = {
    axiosInstance: instance,
    csrfToken,
    baseUrl: serviceUrl,
  };
  return odataSession;
}

function buildQueryUrl(
  serviceUrl: string,
  entitySet: string,
  opts: {
    select?: string;
    filter?: string;
    expand?: string;
    top?: number;
    skip?: number;
    orderby?: string;
    count?: boolean;
  }
): string {
  const base = `${serviceUrl.replace(/\/$/, "")}/${entitySet}`;
  const params: string[] = [];

  if (opts.select) params.push(`$select=${opts.select}`);
  if (opts.filter) params.push(`$filter=${encodeURIComponent(opts.filter)}`);
  if (opts.expand) params.push(`$expand=${opts.expand}`);
  if (opts.top !== undefined) params.push(`$top=${opts.top}`);
  if (opts.skip !== undefined) params.push(`$skip=${opts.skip}`);
  if (opts.orderby) params.push(`$orderby=${opts.orderby}`);
  if (opts.count) params.push("$count=true");

  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}

export const odataTools = {
  "sap.odata.query": {
    description:
      "Query an OData entity set with optional filtering, selection, expansion, paging, and ordering.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL (e.g. '/sap/opu/odata/sap/API_SALES_ORDER_SRV')"),
      entitySet: z.string().describe("Entity set name (e.g. 'A_SalesOrder')"),
      select: z.string().optional().describe("$select fields, comma-separated"),
      filter: z.string().optional().describe("$filter expression (e.g. \"SalesOrder eq '1000000'\")"),
      expand: z.string().optional().describe("$expand navigation properties"),
      top: z.number().optional().describe("$top - max number of records"),
      skip: z.number().optional().describe("$skip - number of records to skip"),
      orderby: z.string().optional().describe("$orderby expression"),
      count: z.boolean().default(false).describe("Include $count"),
      format: z.enum(["json", "xml"]).default("json"),
    }),
    handler: async (
      _page: Page,
      params: {
        serviceUrl: string;
        entitySet: string;
        select?: string;
        filter?: string;
        expand?: string;
        top?: number;
        skip?: number;
        orderby?: string;
        count?: boolean;
        format?: string;
      },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap.odata.query",
          duration: 0,
          error: {
            code: "NO_AXIOS",
            message: "OData tools require an axios instance. Ensure the server is properly initialized.",
          },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const url = buildQueryUrl(params.serviceUrl, params.entitySet, params);

      try {
        const response = await session.axiosInstance.get(url, {
          headers: {
            Accept: params.format === "xml" ? "application/xml" : "application/json",
          },
        });

        const data = response.data;
        const results = data.d?.results ?? data.value ?? data.d ?? data;
        const count = data["@odata.count"] ?? data.d?.__count;

        return {
          status: "success",
          tool: "sap.odata.query",
          duration: 0,
          data: {
            entitySet: params.entitySet,
            results: Array.isArray(results) ? results : [results],
            count: count !== undefined ? Number(count) : undefined,
            nextLink: data.d?.__next ?? data["@odata.nextLink"],
          },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        return {
          status: "failure",
          tool: "sap.odata.query",
          duration: 0,
          error: {
            code: "ODATA_QUERY_FAILED",
            message: `OData query failed: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status, data: axErr.response.data }
              : undefined,
          },
        };
      }
    },
  },

  "sap/odata.create": {
    description: "Create a new entity via OData POST request.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL"),
      entitySet: z.string().describe("Entity set name"),
      data: z.record(z.unknown()).describe("Entity data as key-value pairs"),
    }),
    handler: async (
      _page: Page,
      params: {
        serviceUrl: string;
        entitySet: string;
        data: Record<string, unknown>;
      },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap/odata.create",
          duration: 0,
          error: { code: "NO_AXIOS", message: "OData tools require an axios instance." },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const url = `${params.serviceUrl.replace(/\/$/, "")}/${params.entitySet}`;

      try {
        const response = await session.axiosInstance.post(url, params.data, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(session.csrfToken ? { "x-csrf-token": session.csrfToken } : {}),
          },
        });

        return {
          status: "success",
          tool: "sap/odata.create",
          duration: 0,
          data: {
            entitySet: params.entitySet,
            created: response.data.d ?? response.data,
            statusCode: response.status,
          },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };

        if (axErr.response?.status === 403) {
          odataSession!.csrfToken = null;
          const refreshed = await ensureODataSession(params.serviceUrl, context.axiosFactory);
          try {
            const retry = await refreshed.axiosInstance.post(url, params.data, {
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(refreshed.csrfToken ? { "x-csrf-token": refreshed.csrfToken } : {}),
              },
            });
            return {
              status: "success",
              tool: "sap/odata.create",
              duration: 0,
              data: {
                entitySet: params.entitySet,
                created: retry.data.d ?? retry.data,
                statusCode: retry.status,
              },
            };
          } catch {
            // Fall through to the error below
          }
        }

        return {
          status: "failure",
          tool: "sap/odata.create",
          duration: 0,
          error: {
            code: "ODATA_CREATE_FAILED",
            message: `OData create failed: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status, data: axErr.response.data }
              : undefined,
          },
        };
      }
    },
  },

  "sap/odata.update": {
    description: "Update an entity via OData PATCH (merge) or PUT (replace) request.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL"),
      entityPath: z
        .string()
        .describe("Entity path with key (e.g. \"A_SalesOrder('1000000')\")"),
      data: z.record(z.unknown()).describe("Fields to update"),
      method: z.enum(["PATCH", "PUT"]).default("PATCH").describe("HTTP method: PATCH for merge, PUT for replace"),
    }),
    handler: async (
      _page: Page,
      params: {
        serviceUrl: string;
        entityPath: string;
        data: Record<string, unknown>;
        method?: string;
      },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap/odata.update",
          duration: 0,
          error: { code: "NO_AXIOS", message: "OData tools require an axios instance." },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const url = `${params.serviceUrl.replace(/\/$/, "")}/${params.entityPath}`;
      const method = params.method ?? "PATCH";

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (session.csrfToken) headers["x-csrf-token"] = session.csrfToken;

        const response = method === "PUT"
          ? await session.axiosInstance.put(url, params.data, { headers })
          : await session.axiosInstance.patch(url, params.data, { headers });

        return {
          status: "success",
          tool: "sap/odata.update",
          duration: 0,
          data: {
            entityPath: params.entityPath,
            method,
            statusCode: response.status,
          },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        return {
          status: "failure",
          tool: "sap/odata.update",
          duration: 0,
          error: {
            code: "ODATA_UPDATE_FAILED",
            message: `OData update failed: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status, data: axErr.response.data }
              : undefined,
          },
        };
      }
    },
  },

  "sap.odata.delete": {
    description: "Delete an entity via OData DELETE request.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL"),
      entityPath: z
        .string()
        .describe("Entity path with key (e.g. \"A_SalesOrder('1000000')\")"),
    }),
    handler: async (
      _page: Page,
      params: { serviceUrl: string; entityPath: string },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap.odata.delete",
          duration: 0,
          error: { code: "NO_AXIOS", message: "OData tools require an axios instance." },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const url = `${params.serviceUrl.replace(/\/$/, "")}/${params.entityPath}`;

      try {
        const headers: Record<string, string> = {};
        if (session.csrfToken) headers["x-csrf-token"] = session.csrfToken;

        await session.axiosInstance.delete(url, { headers });

        return {
          status: "success",
          tool: "sap.odata.delete",
          duration: 0,
          data: { entityPath: params.entityPath, deleted: true },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        return {
          status: "failure",
          tool: "sap.odata.delete",
          duration: 0,
          error: {
            code: "ODATA_DELETE_FAILED",
            message: `OData delete failed: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status, data: axErr.response.data }
              : undefined,
          },
        };
      }
    },
  },

  "sap/odata.batch": {
    description:
      "Execute multiple OData operations in a single $batch request. " +
      "Each operation specifies a method, entity path, and optional data.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL"),
      operations: z.array(
        z.object({
          method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
          path: z.string().describe("Relative entity path"),
          data: z.record(z.unknown()).optional().describe("Request body for POST/PATCH/PUT"),
        })
      ).describe("Array of operations to execute in the batch"),
      atomicChangeset: z
        .boolean()
        .default(true)
        .describe("Wrap modification operations in a changeset for atomicity"),
    }),
    handler: async (
      _page: Page,
      params: {
        serviceUrl: string;
        operations: Array<{
          method: string;
          path: string;
          data?: Record<string, unknown>;
        }>;
        atomicChangeset?: boolean;
      },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap/odata.batch",
          duration: 0,
          error: { code: "NO_AXIOS", message: "OData tools require an axios instance." },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const batchUrl = `${params.serviceUrl.replace(/\/$/, "")}/$batch`;

      const batchBoundary = `batch_${Date.now()}`;
      const changesetBoundary = `changeset_${Date.now()}`;

      const reads = params.operations.filter((op) => op.method === "GET");
      const writes = params.operations.filter((op) => op.method !== "GET");

      let batchBody = "";

      for (const read of reads) {
        batchBody += `--${batchBoundary}\r\n`;
        batchBody += "Content-Type: application/http\r\n";
        batchBody += "Content-Transfer-Encoding: binary\r\n\r\n";
        batchBody += `GET ${read.path} HTTP/1.1\r\n`;
        batchBody += "Accept: application/json\r\n\r\n";
      }

      if (writes.length > 0) {
        batchBody += `--${batchBoundary}\r\n`;
        if (params.atomicChangeset !== false) {
          batchBody += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

          for (const [idx, write] of writes.entries()) {
            batchBody += `--${changesetBoundary}\r\n`;
            batchBody += "Content-Type: application/http\r\n";
            batchBody += "Content-Transfer-Encoding: binary\r\n";
            batchBody += `Content-ID: ${idx + 1}\r\n\r\n`;
            batchBody += `${write.method} ${write.path} HTTP/1.1\r\n`;
            batchBody += "Content-Type: application/json\r\n";
            batchBody += "Accept: application/json\r\n\r\n";
            if (write.data) {
              batchBody += JSON.stringify(write.data) + "\r\n";
            }
          }
          batchBody += `--${changesetBoundary}--\r\n`;
        } else {
          for (const write of writes) {
            batchBody += `--${batchBoundary}\r\n`;
            batchBody += "Content-Type: application/http\r\n";
            batchBody += "Content-Transfer-Encoding: binary\r\n\r\n";
            batchBody += `${write.method} ${write.path} HTTP/1.1\r\n`;
            batchBody += "Content-Type: application/json\r\n";
            batchBody += "Accept: application/json\r\n\r\n";
            if (write.data) {
              batchBody += JSON.stringify(write.data) + "\r\n";
            }
          }
        }
      }

      batchBody += `--${batchBoundary}--\r\n`;

      try {
        const headers: Record<string, string> = {
          "Content-Type": `multipart/mixed; boundary=${batchBoundary}`,
          Accept: "multipart/mixed",
        };
        if (session.csrfToken) headers["x-csrf-token"] = session.csrfToken;

        const response = await session.axiosInstance.post(batchUrl, batchBody, { headers });

        return {
          status: "success",
          tool: "sap/odata.batch",
          duration: 0,
          data: {
            statusCode: response.status,
            operationCount: params.operations.length,
            response: typeof response.data === "string"
              ? response.data.substring(0, 5000)
              : response.data,
          },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        return {
          status: "failure",
          tool: "sap/odata.batch",
          duration: 0,
          error: {
            code: "ODATA_BATCH_FAILED",
            message: `OData batch failed: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status, data: axErr.response.data }
              : undefined,
          },
        };
      }
    },
  },

  "sap/odata.getMetadata": {
    description:
      "Fetch the OData service metadata ($metadata) document for schema inspection.",
    inputSchema: z.object({
      serviceUrl: z.string().describe("Base OData service URL"),
    }),
    handler: async (
      _page: Page,
      params: { serviceUrl: string },
      context?: { axiosFactory: () => AxiosInstance }
    ): Promise<ToolResult> => {
      if (!context?.axiosFactory) {
        return {
          status: "error",
          tool: "sap/odata.getMetadata",
          duration: 0,
          error: { code: "NO_AXIOS", message: "OData tools require an axios instance." },
        };
      }

      const session = await ensureODataSession(params.serviceUrl, context.axiosFactory);
      const url = `${params.serviceUrl.replace(/\/$/, "")}/$metadata`;

      try {
        const response = await session.axiosInstance.get(url, {
          headers: { Accept: "application/xml" },
        });

        const metadataXml = typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);

        return {
          status: "success",
          tool: "sap/odata.getMetadata",
          duration: 0,
          data: {
            serviceUrl: params.serviceUrl,
            metadata: metadataXml,
          },
        };
      } catch (err) {
        const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
        return {
          status: "failure",
          tool: "sap/odata.getMetadata",
          duration: 0,
          error: {
            code: "ODATA_METADATA_FAILED",
            message: `Failed to fetch metadata: ${axErr.message ?? String(err)}`,
            details: axErr.response
              ? { status: axErr.response.status }
              : undefined,
          },
        };
      }
    },
  },
};
