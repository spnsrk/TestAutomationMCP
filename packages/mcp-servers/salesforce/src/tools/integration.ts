import { z } from "zod";
import type { Connection } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-integration");

export const integrationTools = {
  "sf/integration.publishEvent": {
    description:
      "Publish a Salesforce Platform Event. The event name should end with __e.",
    inputSchema: z.object({
      eventName: z
        .string()
        .describe("Platform Event API name (e.g., Order_Update__e)"),
      payload: z
        .record(z.unknown())
        .describe("Event field values to publish"),
    }),
    handler: async (
      conn: Connection,
      params: { eventName: string; payload: Record<string, unknown> }
    ): Promise<ToolResult> => {
      const result = await conn.sobject(params.eventName).create(params.payload);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sf/integration.publishEvent",
          duration: 0,
          error: {
            code: "EVENT_PUBLISH_FAILED",
            message: `Failed to publish event: ${JSON.stringify(result.errors)}`,
            details: result.errors,
          },
        };
      }

      logger.info(
        { eventName: params.eventName, id: result.id },
        "Platform event published"
      );

      return {
        status: "success",
        tool: "sf/integration.publishEvent",
        duration: 0,
        data: {
          eventName: params.eventName,
          eventId: result.id,
          success: true,
        },
      };
    },
  },

  "sf/integration.callApi": {
    description:
      "Call an external API from the Salesforce context using Named Credentials or a direct URL via Apex callout proxy",
    inputSchema: z.object({
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .describe("HTTP method"),
      endpoint: z
        .string()
        .describe("Full URL or Named Credential path (callout:MyNC/path)"),
      headers: z
        .record(z.string())
        .optional()
        .describe("Custom HTTP headers"),
      body: z
        .record(z.unknown())
        .optional()
        .describe("Request body for POST/PUT/PATCH"),
      timeout: z.number().default(30000).describe("Request timeout in ms"),
    }),
    handler: async (
      conn: Connection,
      params: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        endpoint: string;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
        timeout?: number;
      }
    ): Promise<ToolResult> => {
      const apexCode = `
        HttpRequest req = new HttpRequest();
        req.setEndpoint('${params.endpoint.replace(/'/g, "\\'")}');
        req.setMethod('${params.method}');
        req.setTimeout(${params.timeout ?? 30000});
        ${
          params.headers
            ? Object.entries(params.headers)
                .map(
                  ([k, v]) =>
                    `req.setHeader('${k.replace(/'/g, "\\'")}', '${v.replace(/'/g, "\\'")}');`
                )
                .join("\n        ")
            : ""
        }
        ${
          params.body
            ? `req.setBody('${JSON.stringify(params.body).replace(/'/g, "\\'")}');
        req.setHeader('Content-Type', 'application/json');`
            : ""
        }
        Http http = new Http();
        HttpResponse res = http.send(req);
        System.debug('STATUS:' + res.getStatusCode());
        System.debug('BODY:' + res.getBody());
      `;

      const encodedBody = encodeURIComponent(apexCode);
      const result = await conn.tooling.request<{
        compiled: boolean;
        compileProblem: string | null;
        success: boolean;
        exceptionMessage: string | null;
        exceptionStackTrace: string | null;
      }>({
        method: "GET",
        url: `/services/data/v59.0/tooling/executeAnonymous/?anonymousBody=${encodedBody}`,
      });

      if (!result.compiled) {
        return {
          status: "error",
          tool: "sf/integration.callApi",
          duration: 0,
          error: {
            code: "COMPILE_ERROR",
            message: result.compileProblem ?? "Apex compilation failed for API callout",
          },
        };
      }

      if (!result.success) {
        return {
          status: "failure",
          tool: "sf/integration.callApi",
          duration: 0,
          error: {
            code: "CALLOUT_FAILED",
            message: result.exceptionMessage ?? "API callout failed",
            details: { stackTrace: result.exceptionStackTrace },
          },
        };
      }

      logger.info(
        { method: params.method, endpoint: params.endpoint },
        "API callout executed"
      );

      return {
        status: "success",
        tool: "sf/integration.callApi",
        duration: 0,
        data: {
          method: params.method,
          endpoint: params.endpoint,
          executed: true,
        },
      };
    },
  },

  "sf/integration.checkFlow": {
    description:
      "Check the execution status and details of a Salesforce Flow (Process Builder or Flow Builder) by name or interview ID",
    inputSchema: z.object({
      flowNameOrId: z
        .string()
        .describe("Flow API name, version ID, or interview ID"),
      lookupBy: z
        .enum(["name", "interviewId"])
        .default("name")
        .describe("How to look up the flow"),
    }),
    handler: async (
      conn: Connection,
      params: { flowNameOrId: string; lookupBy: "name" | "interviewId" }
    ): Promise<ToolResult> => {
      if (params.lookupBy === "interviewId") {
        const interviewResult = await conn.tooling.query<{
          Id: string;
          CurrentElement: string;
          InterviewStatus: string;
          InterviewLabel: string;
          CreatedDate: string;
          CreatedBy: { Name: string };
        }>(
          `SELECT Id, CurrentElement, InterviewStatus, InterviewLabel, CreatedDate, CreatedBy.Name ` +
            `FROM FlowInterview WHERE Id = '${params.flowNameOrId}'`
        );

        if (interviewResult.records.length === 0) {
          return {
            status: "failure",
            tool: "sf/integration.checkFlow",
            duration: 0,
            error: {
              code: "INTERVIEW_NOT_FOUND",
              message: `Flow interview '${params.flowNameOrId}' not found`,
            },
          };
        }

        const interview = interviewResult.records[0];

        logger.info(
          { interviewId: interview.Id, status: interview.InterviewStatus },
          "Flow interview status retrieved"
        );

        return {
          status: "success",
          tool: "sf/integration.checkFlow",
          duration: 0,
          data: {
            interviewId: interview.Id,
            label: interview.InterviewLabel,
            status: interview.InterviewStatus,
            currentElement: interview.CurrentElement,
            createdDate: interview.CreatedDate,
            createdBy: interview.CreatedBy.Name,
          },
        };
      }

      const flowResult = await conn.tooling.query<{
        Id: string;
        DurableId: string;
        ApiName: string;
        Label: string;
        ProcessType: string;
        Status: string;
        VersionNumber: number;
        IsActive: boolean;
        Description: string | null;
        LastModifiedDate: string;
      }>(
        `SELECT Id, DurableId, ApiName, Label, ProcessType, Status, VersionNumber, ` +
          `IsActive, Description, LastModifiedDate ` +
          `FROM FlowVersionView WHERE ApiName = '${params.flowNameOrId}' ORDER BY VersionNumber DESC LIMIT 5`
      );

      if (flowResult.records.length === 0) {
        return {
          status: "failure",
          tool: "sf/integration.checkFlow",
          duration: 0,
          error: {
            code: "FLOW_NOT_FOUND",
            message: `Flow '${params.flowNameOrId}' not found`,
          },
        };
      }

      const activeVersion = flowResult.records.find((r) => r.IsActive);
      const latestVersion = flowResult.records[0];
      const displayVersion = activeVersion ?? latestVersion;

      logger.info(
        { flowName: params.flowNameOrId, versions: flowResult.records.length },
        "Flow status retrieved"
      );

      return {
        status: "success",
        tool: "sf/integration.checkFlow",
        duration: 0,
        data: {
          apiName: displayVersion.ApiName,
          label: displayVersion.Label,
          processType: displayVersion.ProcessType,
          status: displayVersion.Status,
          isActive: displayVersion.IsActive,
          versionNumber: displayVersion.VersionNumber,
          description: displayVersion.Description,
          lastModifiedDate: displayVersion.LastModifiedDate,
          totalVersions: flowResult.records.length,
          versions: flowResult.records.map((v) => ({
            versionNumber: v.VersionNumber,
            status: v.Status,
            isActive: v.IsActive,
          })),
        },
      };
    },
  },
};
