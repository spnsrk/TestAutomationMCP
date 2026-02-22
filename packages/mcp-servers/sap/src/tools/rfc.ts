import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";
import { getRfcClient } from "./auth.js";

type RfcClient = {
  call(functionModule: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  alive: boolean;
};

function requireRfcClient(): { client: RfcClient } | { error: ToolResult } {
  const client = getRfcClient();
  if (!client) {
    return {
      error: {
        status: "error",
        tool: "sap/rfc",
        duration: 0,
        error: {
          code: "RFC_NOT_CONNECTED",
          message:
            "No active RFC connection. Use sap/auth.loginRfc first to establish a connection.",
        },
      },
    };
  }
  if (!client.alive) {
    return {
      error: {
        status: "error",
        tool: "sap/rfc",
        duration: 0,
        error: {
          code: "RFC_CONNECTION_LOST",
          message:
            "RFC connection is no longer alive. Use sap/auth.loginRfc to reconnect.",
        },
      },
    };
  }
  return { client: client as RfcClient };
}

export const rfcTools = {
  "sap/rfc.callFunction": {
    description:
      "Call an RFC function module on the connected SAP system. Returns the export parameters and tables from the function module.",
    inputSchema: z.object({
      functionName: z
        .string()
        .describe("The RFC function module name (e.g. 'BAPI_USER_GET_DETAIL')"),
      importParams: z
        .record(z.unknown())
        .default({})
        .describe("Import parameters as key-value pairs"),
      tableParams: z
        .record(z.array(z.record(z.unknown())))
        .default({})
        .describe("Table parameters as key-value pairs of arrays"),
    }),
    handler: async (
      _page: Page,
      params: {
        functionName: string;
        importParams?: Record<string, unknown>;
        tableParams?: Record<string, unknown>;
      }
    ): Promise<ToolResult> => {
      const check = requireRfcClient();
      if ("error" in check) return check.error;

      const callParams: Record<string, unknown> = {
        ...(params.importParams ?? {}),
        ...(params.tableParams ?? {}),
      };

      try {
        const result = await check.client.call(params.functionName, callParams);
        return {
          status: "success",
          tool: "sap/rfc.callFunction",
          duration: 0,
          data: {
            functionName: params.functionName,
            result,
          },
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/rfc.callFunction",
          duration: 0,
          error: {
            code: "RFC_CALL_FAILED",
            message: `RFC call to ${params.functionName} failed: ${err instanceof Error ? err.message : String(err)}`,
            details: err instanceof Error ? { stack: err.stack } : undefined,
          },
        };
      }
    },
  },

  "sap/rfc.callBAPI": {
    description:
      "Call a BAPI function with automatic BAPI_TRANSACTION_COMMIT afterwards. " +
      "Returns BAPI results including RETURN messages for error checking.",
    inputSchema: z.object({
      bapiName: z
        .string()
        .describe("The BAPI function name (e.g. 'BAPI_SALESORDER_CREATEFROMDAT2')"),
      params: z
        .record(z.unknown())
        .describe("All BAPI parameters (import, tables) as key-value pairs"),
      autoCommit: z
        .boolean()
        .default(true)
        .describe("Automatically call BAPI_TRANSACTION_COMMIT on success"),
    }),
    handler: async (
      _page: Page,
      params: {
        bapiName: string;
        params: Record<string, unknown>;
        autoCommit?: boolean;
      }
    ): Promise<ToolResult> => {
      const check = requireRfcClient();
      if ("error" in check) return check.error;

      try {
        const result = await check.client.call(params.bapiName, params.params);

        const returnMessages = (result.RETURN ?? result.return ?? []) as Array<{
          TYPE?: string;
          MESSAGE?: string;
          ID?: string;
          NUMBER?: string;
        }>;

        const hasError = Array.isArray(returnMessages) &&
          returnMessages.some(
            (msg) => msg.TYPE === "E" || msg.TYPE === "A"
          );

        if (hasError) {
          if (params.autoCommit !== false) {
            try {
              await check.client.call("BAPI_TRANSACTION_ROLLBACK", {});
            } catch {
              // Best effort rollback
            }
          }

          return {
            status: "failure",
            tool: "sap/rfc.callBAPI",
            duration: 0,
            data: {
              bapiName: params.bapiName,
              result,
              returnMessages,
              committed: false,
            },
            error: {
              code: "BAPI_ERROR",
              message: returnMessages
                .filter((m) => m.TYPE === "E" || m.TYPE === "A")
                .map((m) => m.MESSAGE)
                .join("; "),
            },
          };
        }

        if (params.autoCommit !== false) {
          await check.client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });
        }

        return {
          status: "success",
          tool: "sap/rfc.callBAPI",
          duration: 0,
          data: {
            bapiName: params.bapiName,
            result,
            returnMessages,
            committed: params.autoCommit !== false,
          },
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/rfc.callBAPI",
          duration: 0,
          error: {
            code: "BAPI_CALL_FAILED",
            message: `BAPI call to ${params.bapiName} failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  },

  "sap/rfc.getStructure": {
    description:
      "Get the structure and metadata of an RFC function module, including import/export/changing/table parameters.",
    inputSchema: z.object({
      functionName: z
        .string()
        .describe("The RFC function module name to introspect"),
    }),
    handler: async (
      _page: Page,
      params: { functionName: string }
    ): Promise<ToolResult> => {
      const check = requireRfcClient();
      if ("error" in check) return check.error;

      try {
        const result = await check.client.call(
          "RFC_GET_FUNCTION_INTERFACE",
          { FUNCNAME: params.functionName }
        );

        const paramTable = (result.PARAMS ?? []) as Array<Record<string, unknown>>;

        const structure = {
          functionName: params.functionName,
          import: paramTable.filter((p) => p.PARAMCLASS === "I"),
          export: paramTable.filter((p) => p.PARAMCLASS === "E"),
          changing: paramTable.filter((p) => p.PARAMCLASS === "C"),
          tables: paramTable.filter((p) => p.PARAMCLASS === "T"),
        };

        return {
          status: "success",
          tool: "sap/rfc.getStructure",
          duration: 0,
          data: structure,
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/rfc.getStructure",
          duration: 0,
          error: {
            code: "RFC_METADATA_FAILED",
            message: `Failed to get metadata for ${params.functionName}: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  },
};
