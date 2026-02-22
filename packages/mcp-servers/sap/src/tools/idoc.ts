import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";
import { getRfcClient } from "./auth.js";

type RfcClient = {
  call(functionModule: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  alive: boolean;
};

function requireRfc(toolName: string): { client: RfcClient } | { error: ToolResult } {
  const client = getRfcClient();
  if (!client) {
    return {
      error: {
        status: "error",
        tool: toolName,
        duration: 0,
        error: {
          code: "RFC_NOT_CONNECTED",
          message:
            "IDoc tools require an active RFC connection. Use sap/auth.loginRfc first.",
        },
      },
    };
  }
  if (!client.alive) {
    return {
      error: {
        status: "error",
        tool: toolName,
        duration: 0,
        error: {
          code: "RFC_CONNECTION_LOST",
          message: "RFC connection lost. Reconnect with sap/auth.loginRfc.",
        },
      },
    };
  }
  return { client: client as RfcClient };
}

const segmentSchema = z.object({
  segmentName: z.string().describe("IDoc segment name (e.g. 'E1EDK01')"),
  data: z.record(z.string()).describe("Segment field values as key-value pairs"),
});

export const idocTools = {
  "sap/idoc.send": {
    description:
      "Send an IDoc to the SAP system via RFC. Builds the IDoc control record and data records, " +
      "then calls IDOC_INBOUND_ASYNCHRONOUS to post it.",
    inputSchema: z.object({
      idocType: z.string().describe("IDoc basic type (e.g. 'ORDERS05', 'MATMAS05')"),
      mesType: z.string().describe("Message type (e.g. 'ORDERS', 'MATMAS')"),
      senderPort: z.string().default("SAPPORT").describe("Sender port"),
      senderPartner: z.string().describe("Sender partner number"),
      senderPartnerType: z.string().default("LS").describe("Sender partner type"),
      receiverPort: z.string().default("SAPPORT").describe("Receiver port"),
      receiverPartner: z.string().describe("Receiver partner number"),
      receiverPartnerType: z.string().default("LS").describe("Receiver partner type"),
      segments: z
        .array(segmentSchema)
        .describe("Array of IDoc segments with their field data"),
    }),
    handler: async (
      _page: Page,
      params: {
        idocType: string;
        mesType: string;
        senderPort?: string;
        senderPartner: string;
        senderPartnerType?: string;
        receiverPort?: string;
        receiverPartner: string;
        receiverPartnerType?: string;
        segments: Array<{ segmentName: string; data: Record<string, string> }>;
      }
    ): Promise<ToolResult> => {
      const check = requireRfc("sap/idoc.send");
      if ("error" in check) return check.error;

      const controlRecord: Record<string, string> = {
        DOCTYP: params.idocType,
        MESTYP: params.mesType,
        SNDPOR: params.senderPort ?? "SAPPORT",
        SNDPRT: params.senderPartnerType ?? "LS",
        SNDPRN: params.senderPartner,
        RCVPOR: params.receiverPort ?? "SAPPORT",
        RCVPRT: params.receiverPartnerType ?? "LS",
        RCVPRN: params.receiverPartner,
      };

      const dataRecords = params.segments.map((seg, idx) => {
        const sdata = Object.entries(seg.data)
          .map(([k, v]) => `${k.padEnd(30)}${v}`)
          .join("");

        return {
          SEGNAM: seg.segmentName,
          SEGNUM: String(idx + 1).padStart(6, "0"),
          PSGNUM: "000000",
          HLEVEL: "01",
          SDATA: sdata,
        };
      });

      try {
        const result = await check.client.call("IDOC_INBOUND_ASYNCHRONOUS", {
          DC_HEADER: controlRecord,
          RT_DATA: dataRecords,
        });

        const idocNumber = (result.PE_IDOC_NUMBER as string) ??
          (result.IDOC_NUMBER as string) ?? "unknown";

        return {
          status: "success",
          tool: "sap/idoc.send",
          duration: 0,
          data: {
            idocNumber,
            idocType: params.idocType,
            mesType: params.mesType,
            segmentCount: params.segments.length,
          },
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/idoc.send",
          duration: 0,
          error: {
            code: "IDOC_SEND_FAILED",
            message: `Failed to send IDoc: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  },

  "sap/idoc.getStatus": {
    description:
      "Get the processing status of an IDoc by its document number. " +
      "Calls IDOC_READ_COMPLETELY to retrieve control and status records.",
    inputSchema: z.object({
      idocNumber: z.string().describe("IDoc document number"),
    }),
    handler: async (
      _page: Page,
      params: { idocNumber: string }
    ): Promise<ToolResult> => {
      const check = requireRfc("sap/idoc.getStatus");
      if ("error" in check) return check.error;

      try {
        const result = await check.client.call("IDOC_READ_COMPLETELY", {
          DOCUMENT_NUMBER: params.idocNumber,
        });

        const controlRecord = result.IDOC_CONTROL as Record<string, unknown> | undefined;
        const statusRecords = (result.IDOC_STATUS ?? []) as Array<Record<string, unknown>>;

        const latestStatus = Array.isArray(statusRecords) && statusRecords.length > 0
          ? statusRecords[statusRecords.length - 1]
          : null;

        const statusCode = (latestStatus?.STATUS as string) ?? "unknown";
        const statusDescriptions: Record<string, string> = {
          "01": "IDoc generated",
          "02": "Error passing data to port",
          "03": "Data passed to port OK",
          "05": "IDoc translated",
          "06": "IDoc translation error",
          "08": "IDoc sent to partner",
          "12": "Dispatch OK",
          "30": "IDoc ready to transfer",
          "41": "Application document created",
          "51": "Application document not posted",
          "53": "Application document posted",
          "56": "IDoc with errors added",
          "64": "IDoc ready to be transferred to application",
          "66": "IDoc is waiting for predecessor IDoc",
          "68": "Error, no further processing",
          "69": "IDoc was edited",
        };

        return {
          status: "success",
          tool: "sap/idoc.getStatus",
          duration: 0,
          data: {
            idocNumber: params.idocNumber,
            statusCode,
            statusDescription:
              statusDescriptions[statusCode] ?? `Status ${statusCode}`,
            direction: controlRecord?.DIRECT === "1" ? "Outbound" : "Inbound",
            mesType: controlRecord?.MESTYP,
            idocType: controlRecord?.IDOCTYP ?? controlRecord?.DOCTYP,
            createdAt: controlRecord?.CREDAT,
            createdTime: controlRecord?.CRETIM,
            allStatuses: statusRecords,
          },
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/idoc.getStatus",
          duration: 0,
          error: {
            code: "IDOC_STATUS_FAILED",
            message: `Failed to get IDoc status: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  },

  "sap/idoc.listRecent": {
    description:
      "List recent IDocs filtered by message type, direction, and/or status. " +
      "Uses IDOC_SELECT to query the IDoc index.",
    inputSchema: z.object({
      mesType: z.string().optional().describe("Filter by message type (e.g. 'ORDERS')"),
      direction: z
        .enum(["inbound", "outbound"])
        .optional()
        .describe("Filter by direction"),
      status: z.string().optional().describe("Filter by status code (e.g. '53' for posted)"),
      limit: z.number().default(50).describe("Maximum number of IDocs to return"),
      fromDate: z
        .string()
        .optional()
        .describe("Start date filter in YYYYMMDD format"),
      toDate: z
        .string()
        .optional()
        .describe("End date filter in YYYYMMDD format"),
    }),
    handler: async (
      _page: Page,
      params: {
        mesType?: string;
        direction?: string;
        status?: string;
        limit?: number;
        fromDate?: string;
        toDate?: string;
      }
    ): Promise<ToolResult> => {
      const check = requireRfc("sap/idoc.listRecent");
      if ("error" in check) return check.error;

      try {
        const selectParams: Record<string, unknown> = {};

        const selectionCriteria: Array<Record<string, string>> = [];

        if (params.mesType) {
          selectionCriteria.push({
            FIELD: "MESTYP",
            SIGN: "I",
            OPTION: "EQ",
            LOW: params.mesType,
            HIGH: "",
          });
        }

        if (params.direction) {
          selectionCriteria.push({
            FIELD: "DIRECT",
            SIGN: "I",
            OPTION: "EQ",
            LOW: params.direction === "inbound" ? "2" : "1",
            HIGH: "",
          });
        }

        if (params.status) {
          selectionCriteria.push({
            FIELD: "STATUS",
            SIGN: "I",
            OPTION: "EQ",
            LOW: params.status,
            HIGH: "",
          });
        }

        if (params.fromDate) {
          selectionCriteria.push({
            FIELD: "CREDAT",
            SIGN: "I",
            OPTION: params.toDate ? "BT" : "GE",
            LOW: params.fromDate,
            HIGH: params.toDate ?? "",
          });
        }

        selectParams.SELECTION = selectionCriteria;
        selectParams.MAXCOUNT = params.limit ?? 50;

        let result: Record<string, unknown>;
        try {
          result = await check.client.call("IDOC_SELECT", selectParams);
        } catch {
          result = await check.client.call("EDI_DOCUMENT_OPEN_FOR_READ", {
            PI_CRITERIA: selectionCriteria,
          });
        }

        const idocList = (result.IDOC_INDEX ?? result.PT_IDOC_INDEX ?? result.IDOC_CONTROL ?? []) as Array<
          Record<string, unknown>
        >;

        const limitedList = Array.isArray(idocList)
          ? idocList.slice(0, params.limit ?? 50)
          : [];

        const idocs = limitedList.map((doc) => ({
          idocNumber: doc.DOCNUM ?? doc.IDOCNO,
          mesType: doc.MESTYP,
          idocType: doc.IDOCTYP ?? doc.DOCTYP,
          direction: doc.DIRECT === "1" ? "Outbound" : "Inbound",
          status: doc.STATUS,
          createdDate: doc.CREDAT,
          createdTime: doc.CRETIM,
          senderPartner: doc.SNDPRN,
          receiverPartner: doc.RCVPRN,
        }));

        return {
          status: "success",
          tool: "sap/idoc.listRecent",
          duration: 0,
          data: {
            idocs,
            count: idocs.length,
            filters: {
              mesType: params.mesType,
              direction: params.direction,
              status: params.status,
            },
          },
        };
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/idoc.listRecent",
          duration: 0,
          error: {
            code: "IDOC_LIST_FAILED",
            message: `Failed to list IDocs: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  },
};
