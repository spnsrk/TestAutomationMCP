import { z } from "zod";
import type { Connection } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-data");

export const dataTools = {
  "salesforce.data.soqlQuery": {
    description:
      "Execute a SOQL query against Salesforce. Supports both standard and Tooling API queries.",
    inputSchema: z.object({
      query: z.string().describe("SOQL query string"),
      tooling: z
        .boolean()
        .default(false)
        .describe("Use Tooling API instead of standard API"),
    }),
    handler: async (
      conn: Connection,
      params: { query: string; tooling: boolean }
    ): Promise<ToolResult> => {
      const api = params.tooling ? conn.tooling : conn;
      const result = await api.query(params.query);

      logger.info(
        { totalSize: result.totalSize, done: result.done },
        "SOQL query executed"
      );

      let allRecords = result.records;

      if (!result.done && result.nextRecordsUrl) {
        let queryResult = result;
        while (!queryResult.done && queryResult.nextRecordsUrl) {
          queryResult = await (params.tooling
            ? conn.tooling.queryMore(queryResult.nextRecordsUrl)
            : conn.queryMore(queryResult.nextRecordsUrl));
          allRecords = allRecords.concat(queryResult.records);
        }
      }

      return {
        status: "success",
        tool: "salesforce.data.soqlQuery",
        duration: 0,
        data: {
          totalSize: result.totalSize,
          done: true,
          records: allRecords,
        },
      };
    },
  },

  "sf/data.soslSearch": {
    description: "Execute a SOSL search across Salesforce objects",
    inputSchema: z.object({
      search: z
        .string()
        .describe("SOSL search string (e.g., FIND {term} IN ALL FIELDS ...)"),
    }),
    handler: async (
      conn: Connection,
      params: { search: string }
    ): Promise<ToolResult> => {
      const result = await conn.search(params.search);

      logger.info("SOSL search executed");

      return {
        status: "success",
        tool: "sf/data.soslSearch",
        duration: 0,
        data: {
          searchRecords: result.searchRecords,
        },
      };
    },
  },

  "salesforce.data.insertRecord": {
    description:
      "Insert a new record into a Salesforce object. Returns the new record ID.",
    inputSchema: z.object({
      object: z.string().describe("SObject API name (e.g., Account, Contact)"),
      data: z
        .record(z.unknown())
        .describe("Field values for the new record"),
    }),
    handler: async (
      conn: Connection,
      params: { object: string; data: Record<string, unknown> }
    ): Promise<ToolResult> => {
      const result = await conn.sobject(params.object).create(params.data);

      if (!result.success) {
        return {
          status: "failure",
          tool: "salesforce.data.insertRecord",
          duration: 0,
          error: {
            code: "INSERT_FAILED",
            message: `Insert failed: ${JSON.stringify(result.errors)}`,
            details: result.errors,
          },
        };
      }

      logger.info(
        { object: params.object, id: result.id },
        "Record inserted"
      );

      return {
        status: "success",
        tool: "salesforce.data.insertRecord",
        duration: 0,
        data: {
          id: result.id,
          success: true,
          object: params.object,
        },
      };
    },
  },

  "sf/data.updateRecord": {
    description: "Update an existing Salesforce record by ID",
    inputSchema: z.object({
      object: z.string().describe("SObject API name"),
      id: z.string().describe("Record ID to update"),
      data: z.record(z.unknown()).describe("Field values to update"),
    }),
    handler: async (
      conn: Connection,
      params: { object: string; id: string; data: Record<string, unknown> }
    ): Promise<ToolResult> => {
      const updatePayload = { Id: params.id, ...params.data };
      const result = await conn.sobject(params.object).update(updatePayload);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sf/data.updateRecord",
          duration: 0,
          error: {
            code: "UPDATE_FAILED",
            message: `Update failed: ${JSON.stringify(result.errors)}`,
            details: result.errors,
          },
        };
      }

      logger.info(
        { object: params.object, id: params.id },
        "Record updated"
      );

      return {
        status: "success",
        tool: "sf/data.updateRecord",
        duration: 0,
        data: {
          id: params.id,
          success: true,
          object: params.object,
        },
      };
    },
  },

  "sf/data.deleteRecord": {
    description: "Delete a Salesforce record by ID",
    inputSchema: z.object({
      object: z.string().describe("SObject API name"),
      id: z.string().describe("Record ID to delete"),
    }),
    handler: async (
      conn: Connection,
      params: { object: string; id: string }
    ): Promise<ToolResult> => {
      const result = await conn.sobject(params.object).destroy(params.id);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sf/data.deleteRecord",
          duration: 0,
          error: {
            code: "DELETE_FAILED",
            message: `Delete failed: ${JSON.stringify(result.errors)}`,
            details: result.errors,
          },
        };
      }

      logger.info(
        { object: params.object, id: params.id },
        "Record deleted"
      );

      return {
        status: "success",
        tool: "sf/data.deleteRecord",
        duration: 0,
        data: {
          id: params.id,
          success: true,
          object: params.object,
        },
      };
    },
  },

  "sf/data.upsertRecord": {
    description:
      "Upsert a record using an external ID field. Inserts if not found, updates if found.",
    inputSchema: z.object({
      object: z.string().describe("SObject API name"),
      externalIdField: z
        .string()
        .describe("API name of the external ID field used for matching"),
      data: z
        .record(z.unknown())
        .describe(
          "Field values including the external ID field value"
        ),
    }),
    handler: async (
      conn: Connection,
      params: {
        object: string;
        externalIdField: string;
        data: Record<string, unknown>;
      }
    ): Promise<ToolResult> => {
      const result = await conn
        .sobject(params.object)
        .upsert(params.data, params.externalIdField);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sf/data.upsertRecord",
          duration: 0,
          error: {
            code: "UPSERT_FAILED",
            message: `Upsert failed: ${JSON.stringify(result.errors)}`,
            details: result.errors,
          },
        };
      }

      logger.info(
        { object: params.object, id: result.id, created: result.created },
        "Record upserted"
      );

      return {
        status: "success",
        tool: "sf/data.upsertRecord",
        duration: 0,
        data: {
          id: result.id,
          success: true,
          created: result.created,
          object: params.object,
        },
      };
    },
  },

  "salesforce.data.bulkOperation": {
    description:
      "Perform a bulk data operation (insert, update, delete, or upsert) on multiple records",
    inputSchema: z.object({
      object: z.string().describe("SObject API name"),
      operation: z
        .enum(["insert", "update", "delete", "upsert"])
        .describe("Bulk operation type"),
      records: z
        .array(z.record(z.unknown()))
        .describe("Array of records to process"),
      externalIdField: z
        .string()
        .optional()
        .describe("External ID field for upsert operations"),
    }),
    handler: async (
      conn: Connection,
      params: {
        object: string;
        operation: "insert" | "update" | "delete" | "upsert";
        records: Record<string, unknown>[];
        externalIdField?: string;
      }
    ): Promise<ToolResult> => {
      const job = conn.bulk.createJob(
        params.object,
        params.operation,
        params.operation === "upsert"
          ? { extIdField: params.externalIdField }
          : undefined
      );

      const batch = job.createBatch();
      batch.execute(params.records);

      const batchResult = await new Promise<unknown[]>((resolve, reject) => {
        batch.on("response", (results: unknown[]) => resolve(results));
        batch.on("error", (err: Error) => reject(err));
      });

      await job.close();

      const results = batchResult as Array<{
        success: boolean;
        id?: string;
        errors?: unknown[];
      }>;

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      logger.info(
        {
          object: params.object,
          operation: params.operation,
          total: results.length,
          successCount,
          failureCount,
        },
        "Bulk operation completed"
      );

      return {
        status: failureCount > 0 ? "failure" : "success",
        tool: "salesforce.data.bulkOperation",
        duration: 0,
        data: {
          operation: params.operation,
          object: params.object,
          totalProcessed: results.length,
          successCount,
          failureCount,
          results,
        },
      };
    },
  },
};
