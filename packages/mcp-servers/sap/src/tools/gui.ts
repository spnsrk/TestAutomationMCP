import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

/**
 * SAP GUI Scripting tools operate through a COM automation bridge that requires
 * Windows and SAP GUI for Windows with scripting enabled.
 *
 * Architecture: These tools invoke a local COM helper (e.g. via cscript/VBScript
 * or a .NET bridge) that communicates with the SAP GUI Scripting API.
 * On non-Windows platforms, the tools return a clear error explaining the
 * platform requirement.
 *
 * To enable SAP GUI Scripting:
 * 1. In SAP GUI: Options > Accessibility & Scripting > Scripting > Enable scripting
 * 2. SAP system parameter: sapgui/user_scripting = TRUE (via RZ11)
 */

const PLATFORM_ERROR: ToolResult = {
  status: "error",
  tool: "sap/gui",
  duration: 0,
  error: {
    code: "PLATFORM_NOT_SUPPORTED",
    message:
      "SAP GUI Scripting requires Windows with SAP GUI for Windows installed and scripting enabled. " +
      "This functionality is not available on the current platform. " +
      "Consider using SAP Fiori tools (sap/fiori.*) for web-based SAP testing, " +
      "or RFC tools (sap/rfc.*) for backend operations.",
  },
};

function isWindows(): boolean {
  return process.platform === "win32";
}

async function executeGuiScript(
  script: string,
  _timeout = 30000
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!isWindows()) {
    return { success: false, error: PLATFORM_ERROR.error!.message };
  }

  const { execFile } = await import("node:child_process");
  const { writeFile, unlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const vbsPath = join(tmpdir(), `sap_gui_${Date.now()}.vbs`);

  const wrappedScript = `
On Error Resume Next
Dim SapGuiAuto, application, connection, session
Set SapGuiAuto = GetObject("SAPGUI")
If Err.Number <> 0 Then
  WScript.Echo "ERROR:SAP GUI not running or scripting not enabled"
  WScript.Quit 1
End If
Set application = SapGuiAuto.GetScriptingEngine
Set connection = application.Children(0)
Set session = connection.Children(0)
${script}
If Err.Number <> 0 Then
  WScript.Echo "ERROR:" & Err.Description
  WScript.Quit 1
End If
`;

  await writeFile(vbsPath, wrappedScript, "utf-8");

  return new Promise((resolve) => {
    execFile(
      "cscript",
      ["//Nologo", vbsPath],
      { timeout: _timeout },
      async (error, stdout, stderr) => {
        await unlink(vbsPath).catch(() => {});

        if (error) {
          resolve({
            success: false,
            error: stderr || error.message,
          });
          return;
        }

        const output = stdout.trim();
        if (output.startsWith("ERROR:")) {
          resolve({ success: false, error: output.substring(6) });
        } else {
          resolve({ success: true, result: output || undefined });
        }
      }
    );
  });
}

export const guiTools = {
  "sap/gui.openTransaction": {
    description:
      "Open a SAP transaction code in SAP GUI. Requires Windows with SAP GUI Scripting enabled.",
    inputSchema: z.object({
      tcode: z.string().describe("SAP transaction code (e.g. 'VA01', 'SE38', 'MM01')"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      _page: Page,
      params: { tcode: string; timeout?: number }
    ): Promise<ToolResult> => {
      if (!isWindows()) return { ...PLATFORM_ERROR, tool: "sap/gui.openTransaction" };

      const script = `
session.findById("wnd[0]/tbar[0]/okcd").text = "/n${params.tcode}"
session.findById("wnd[0]").sendVKey 0
WScript.Echo session.findById("wnd[0]").text
`;
      const result = await executeGuiScript(script, params.timeout ?? 30000);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sap/gui.openTransaction",
          duration: 0,
          error: {
            code: "GUI_TRANSACTION_FAILED",
            message: `Failed to open transaction ${params.tcode}: ${result.error}`,
          },
        };
      }

      return {
        status: "success",
        tool: "sap/gui.openTransaction",
        duration: 0,
        data: {
          tcode: params.tcode,
          windowTitle: result.result,
        },
      };
    },
  },

  "sap/gui.fillField": {
    description:
      "Fill a SAP GUI field by its technical ID. Requires Windows with SAP GUI Scripting enabled.",
    inputSchema: z.object({
      fieldId: z
        .string()
        .describe(
          "SAP GUI field ID (e.g. 'wnd[0]/usr/ctxtVBAK-VKORG' or 'wnd[0]/usr/txtRMMG1-MATNR')"
        ),
      value: z.string().describe("Value to enter"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      _page: Page,
      params: { fieldId: string; value: string; timeout?: number }
    ): Promise<ToolResult> => {
      if (!isWindows()) return { ...PLATFORM_ERROR, tool: "sap/gui.fillField" };

      const escapedValue = params.value.replace(/"/g, '""');
      const script = `
session.findById("${params.fieldId}").text = "${escapedValue}"
WScript.Echo "OK"
`;
      const result = await executeGuiScript(script, params.timeout ?? 30000);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sap/gui.fillField",
          duration: 0,
          error: {
            code: "GUI_FILL_FAILED",
            message: `Failed to fill field ${params.fieldId}: ${result.error}`,
          },
        };
      }

      return {
        status: "success",
        tool: "sap/gui.fillField",
        duration: 0,
        data: { fieldId: params.fieldId, value: params.value },
      };
    },
  },

  "sap/gui.pressButton": {
    description:
      "Press a SAP GUI button by its technical ID. Requires Windows with SAP GUI Scripting enabled.",
    inputSchema: z.object({
      buttonId: z
        .string()
        .describe("SAP GUI button ID (e.g. 'wnd[0]/tbar[1]/btn[8]' for Execute)"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      _page: Page,
      params: { buttonId: string; timeout?: number }
    ): Promise<ToolResult> => {
      if (!isWindows()) return { ...PLATFORM_ERROR, tool: "sap/gui.pressButton" };

      const script = `
session.findById("${params.buttonId}").press
WScript.Echo "OK"
`;
      const result = await executeGuiScript(script, params.timeout ?? 30000);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sap/gui.pressButton",
          duration: 0,
          error: {
            code: "GUI_BUTTON_FAILED",
            message: `Failed to press button ${params.buttonId}: ${result.error}`,
          },
        };
      }

      return {
        status: "success",
        tool: "sap/gui.pressButton",
        duration: 0,
        data: { buttonId: params.buttonId },
      };
    },
  },

  "sap/gui.readField": {
    description:
      "Read the value of a SAP GUI field. Requires Windows with SAP GUI Scripting enabled.",
    inputSchema: z.object({
      fieldId: z
        .string()
        .describe("SAP GUI field ID to read (e.g. 'wnd[0]/usr/ctxtVBAK-VBELN')"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      _page: Page,
      params: { fieldId: string; timeout?: number }
    ): Promise<ToolResult> => {
      if (!isWindows()) return { ...PLATFORM_ERROR, tool: "sap/gui.readField" };

      const script = `
WScript.Echo session.findById("${params.fieldId}").text
`;
      const result = await executeGuiScript(script, params.timeout ?? 30000);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sap/gui.readField",
          duration: 0,
          error: {
            code: "GUI_READ_FAILED",
            message: `Failed to read field ${params.fieldId}: ${result.error}`,
          },
        };
      }

      return {
        status: "success",
        tool: "sap/gui.readField",
        duration: 0,
        data: {
          fieldId: params.fieldId,
          value: result.result as string,
        },
      };
    },
  },

  "sap/gui.readTable": {
    description:
      "Read data from an ALV grid or table control in SAP GUI. Requires Windows with SAP GUI Scripting enabled. " +
      "Returns an array of row objects.",
    inputSchema: z.object({
      tableId: z
        .string()
        .default("wnd[0]/usr/cntlGRID1/shellcont/shell")
        .describe("SAP GUI table/ALV control ID"),
      maxRows: z.number().default(100).describe("Maximum rows to read"),
      timeout: z.number().default(60000),
    }),
    handler: async (
      _page: Page,
      params: { tableId?: string; maxRows?: number; timeout?: number }
    ): Promise<ToolResult> => {
      if (!isWindows()) return { ...PLATFORM_ERROR, tool: "sap/gui.readTable" };

      const tableId = params.tableId ?? "wnd[0]/usr/cntlGRID1/shellcont/shell";
      const maxRows = params.maxRows ?? 100;

      const script = `
Dim grid, rowCount, colCount, i, j, row, headers, sep
Set grid = session.findById("${tableId}")
rowCount = grid.RowCount
colCount = grid.ColumnCount
If rowCount > ${maxRows} Then rowCount = ${maxRows}

sep = "|"
headers = ""
For j = 0 To colCount - 1
  If j > 0 Then headers = headers & sep
  headers = headers & grid.GetColumnTitles(j)(0)
Next
WScript.Echo "HEADERS:" & headers

For i = 0 To rowCount - 1
  row = ""
  For j = 0 To colCount - 1
    If j > 0 Then row = row & sep
    row = row & grid.GetCellValue(i, grid.ColumnOrder(j))
  Next
  WScript.Echo "ROW:" & row
Next
WScript.Echo "DONE:" & rowCount
`;
      const result = await executeGuiScript(script, params.timeout ?? 60000);

      if (!result.success) {
        return {
          status: "failure",
          tool: "sap/gui.readTable",
          duration: 0,
          error: {
            code: "GUI_TABLE_READ_FAILED",
            message: `Failed to read table: ${result.error}`,
          },
        };
      }

      const output = (result.result as string) ?? "";
      const lines = output.split("\n").map((l) => l.trim());
      const headerLine = lines.find((l) => l.startsWith("HEADERS:"));
      const headers = headerLine
        ? headerLine.substring(8).split("|")
        : [];

      const rows: Array<Record<string, string>> = [];
      for (const line of lines) {
        if (line.startsWith("ROW:")) {
          const values = line.substring(4).split("|");
          const rowObj: Record<string, string> = {};
          values.forEach((val, idx) => {
            rowObj[headers[idx] || `col_${idx}`] = val;
          });
          rows.push(rowObj);
        }
      }

      return {
        status: "success",
        tool: "sap/gui.readTable",
        duration: 0,
        data: { headers, rows, totalRows: rows.length },
      };
    },
  },
};
