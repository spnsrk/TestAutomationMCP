import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

async function waitForUI5Ready(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      // @ts-expect-error browser context - runs in page
      const sap = (window as unknown as Record<string, unknown>).sap as
        | { ui?: { getCore?: () => { isReady?: () => boolean } } }
        | undefined;
      if (!sap?.ui?.getCore) return false;
      const core = sap.ui.getCore();
      return core?.isReady?.() === true;
    },
    { timeout }
  );

  await page.waitForFunction(
    () => {
      // @ts-expect-error browser context - runs in page
      const jQuery = (window as unknown as Record<string, unknown>).jQuery as
        | { active?: number }
        | undefined;
      return !jQuery || jQuery.active === 0;
    },
    { timeout }
  );
}

async function findUI5Control(
  page: Page,
  opts: { id?: string; label?: string; controlType?: string }
): Promise<string> {
  if (opts.id) {
    const byExactId = page.locator(`[id="${opts.id}"]`);
    if ((await byExactId.count()) > 0) return `[id="${opts.id}"]`;

    const byContainsId = page.locator(`[id$="${opts.id}"]`);
    if ((await byContainsId.count()) > 0) return `[id$="${opts.id}"]`;

    const byDataId = page.locator(`[data-sap-ui="${opts.id}"]`);
    if ((await byDataId.count()) > 0) return `[data-sap-ui="${opts.id}"]`;
  }

  if (opts.label) {
    const labelEl = page.locator(`label:has-text("${opts.label}")`);
    if ((await labelEl.count()) > 0) {
      const forAttr = await labelEl.first().getAttribute("for");
      if (forAttr) return `#${forAttr}`;
      const ariaLabel = `[aria-label="${opts.label}"]`;
      if ((await page.locator(ariaLabel).count()) > 0) return ariaLabel;
    }
    const placeholder = `[placeholder="${opts.label}"]`;
    if ((await page.locator(placeholder).count()) > 0) return placeholder;
  }

  throw new Error(
    `UI5 control not found with id=${opts.id ?? "N/A"}, label=${opts.label ?? "N/A"}`
  );
}

export const fioriTools = {
  "sap/fiori.navigateLaunchpad": {
    description:
      "Navigate to the SAP Fiori Launchpad home page. Assumes the user is already logged in.",
    inputSchema: z.object({
      url: z.string().optional().describe("Fiori Launchpad URL. If omitted, reloads the current Fiori page."),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { url?: string; timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;

      if (params.url) {
        await page.goto(params.url, { waitUntil: "domcontentloaded", timeout });
      } else {
        const currentUrl = page.url();
        const lpUrl = currentUrl.replace(/#.*$/, "#Shell-home");
        await page.goto(lpUrl, { waitUntil: "domcontentloaded", timeout });
      }

      await waitForUI5Ready(page, timeout);

      return {
        status: "success",
        tool: "sap/fiori.navigateLaunchpad",
        duration: 0,
        data: {
          url: page.url(),
          title: await page.title(),
        },
      };
    },
  },

  "sap/fiori.openApp": {
    description:
      "Open a Fiori app by clicking its tile on the Launchpad or by navigating to its semantic object/action hash.",
    inputSchema: z.object({
      tileTitle: z
        .string()
        .optional()
        .describe("Title text of the Fiori tile to click"),
      semanticObject: z
        .string()
        .optional()
        .describe("Semantic object for hash-based navigation (e.g. 'SalesOrder')"),
      action: z
        .string()
        .default("display")
        .describe("Semantic action (e.g. 'display', 'create')"),
      params: z
        .record(z.string())
        .optional()
        .describe("Navigation parameters as key-value pairs"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: {
        tileTitle?: string;
        semanticObject?: string;
        action?: string;
        params?: Record<string, string>;
        timeout?: number;
      }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;

      if (params.tileTitle) {
        const tile = page.locator(
          `.sapUshellTile:has-text("${params.tileTitle}"), ` +
          `[class*="sapUshellTileBase"]:has-text("${params.tileTitle}"), ` +
          `[aria-label*="${params.tileTitle}"]`
        );
        await tile.first().waitFor({ state: "visible", timeout });
        await tile.first().click();
      } else if (params.semanticObject) {
        const action = params.action ?? "display";
        let hash = `#${params.semanticObject}-${action}`;
        if (params.params && Object.keys(params.params).length > 0) {
          const qp = Object.entries(params.params)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join("&");
          hash += `?${qp}`;
        }
        const baseUrl = page.url().replace(/#.*$/, "");
        await page.goto(`${baseUrl}${hash}`, {
          waitUntil: "domcontentloaded",
          timeout,
        });
      } else {
        return {
          status: "error",
          tool: "sap/fiori.openApp",
          duration: 0,
          error: {
            code: "INVALID_PARAMS",
            message: "Provide either tileTitle or semanticObject to open an app",
          },
        };
      }

      await waitForUI5Ready(page, timeout);

      return {
        status: "success",
        tool: "sap/fiori.openApp",
        duration: 0,
        data: {
          url: page.url(),
          title: await page.title(),
        },
      };
    },
  },

  "sap/fiori.fillField": {
    description:
      "Fill a UI5 input field identified by its ID or label. Uses UI5-aware locator strategies.",
    inputSchema: z.object({
      fieldId: z
        .string()
        .optional()
        .describe("The UI5 control ID or DOM element ID"),
      label: z
        .string()
        .optional()
        .describe("The label text associated with the field"),
      value: z.string().describe("The value to enter"),
      clearFirst: z.boolean().default(true).describe("Clear existing value before filling"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: {
        fieldId?: string;
        label?: string;
        value: string;
        clearFirst?: boolean;
        timeout?: number;
      }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      await waitForUI5Ready(page, timeout);

      const selector = await findUI5Control(page, {
        id: params.fieldId,
        label: params.label,
      });

      const input = page.locator(selector).first();
      await input.waitFor({ state: "visible", timeout });

      const innerInput = input.locator("input, textarea");
      const target = (await innerInput.count()) > 0 ? innerInput.first() : input;

      if (params.clearFirst !== false) {
        await target.fill("");
      }
      await target.fill(params.value);

      await target.dispatchEvent("change");
      await waitForUI5Ready(page, 5000).catch(() => {});

      return {
        status: "success",
        tool: "sap/fiori.fillField",
        duration: 0,
        data: {
          selector,
          value: params.value,
        },
      };
    },
  },

  "sap/fiori.clickButton": {
    description:
      "Click a UI5 button identified by its text content or element ID.",
    inputSchema: z.object({
      text: z
        .string()
        .optional()
        .describe("Button text to match"),
      buttonId: z
        .string()
        .optional()
        .describe("The UI5 control ID or DOM element ID of the button"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { text?: string; buttonId?: string; timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      await waitForUI5Ready(page, timeout);

      let button;

      if (params.buttonId) {
        button = page.locator(
          `[id="${params.buttonId}"], [id$="${params.buttonId}"]`
        ).first();
      } else if (params.text) {
        button = page.locator(
          `button:has-text("${params.text}"), ` +
          `[role="button"]:has-text("${params.text}"), ` +
          `.sapMBtn:has-text("${params.text}")`
        ).first();
      } else {
        return {
          status: "error",
          tool: "sap/fiori.clickButton",
          duration: 0,
          error: {
            code: "INVALID_PARAMS",
            message: "Provide either text or buttonId",
          },
        };
      }

      await button.waitFor({ state: "visible", timeout });
      await button.click();
      await waitForUI5Ready(page, 10000).catch(() => {});

      return {
        status: "success",
        tool: "sap/fiori.clickButton",
        duration: 0,
        data: {
          text: params.text ?? params.buttonId,
        },
      };
    },
  },

  "sap.fiori.selectListItem": {
    description:
      "Select an item from a UI5 list (sap.m.List, sap.m.SelectList, sap.m.ComboBox, etc.).",
    inputSchema: z.object({
      listId: z
        .string()
        .optional()
        .describe("ID of the list control"),
      itemText: z
        .string()
        .describe("Text of the item to select"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { listId?: string; itemText: string; timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      await waitForUI5Ready(page, timeout);

      let scope = page as unknown as { locator: typeof page.locator };
      if (params.listId) {
        const listEl = page.locator(
          `[id="${params.listId}"], [id$="${params.listId}"]`
        ).first();
        await listEl.waitFor({ state: "visible", timeout });
        scope = listEl as unknown as typeof scope;
      }

      const item = (scope as unknown as Page).locator(
        `.sapMLIB:has-text("${params.itemText}"), ` +
        `[role="option"]:has-text("${params.itemText}"), ` +
        `[role="listitem"]:has-text("${params.itemText}"), ` +
        `li:has-text("${params.itemText}")`
      ).first();

      await item.waitFor({ state: "visible", timeout });
      await item.click();
      await waitForUI5Ready(page, 5000).catch(() => {});

      return {
        status: "success",
        tool: "sap.fiori.selectListItem",
        duration: 0,
        data: {
          itemText: params.itemText,
          listId: params.listId,
        },
      };
    },
  },

  "sap.fiori.readTable": {
    description:
      "Read data from a UI5 sap.m.Table or sap.ui.table.Table. Returns an array of row objects with column header keys.",
    inputSchema: z.object({
      tableId: z
        .string()
        .optional()
        .describe("ID of the table control. If omitted, reads the first table found."),
      maxRows: z.number().default(100).describe("Maximum number of rows to read"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { tableId?: string; maxRows?: number; timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      const maxRows = params.maxRows ?? 100;
      await waitForUI5Ready(page, timeout);

      const tableData = await page.evaluate(
        ({ tableId, maxRows }) => {
          // @ts-expect-error browser context - runs in page
          const sap = (window as unknown as Record<string, unknown>).sap as {
            ui?: {
              getCore?: () => {
                byId?: (id: string) => unknown;
              };
            };
          } | undefined;

          if (!sap?.ui?.getCore) {
            throw new Error("SAP UI5 not available on page");
          }
          const core = sap.ui.getCore()!;

          type UI5Table = {
            getColumns: () => Array<{
              getHeader: () => { getText: () => string } | null;
              getLabel?: () => { getText: () => string } | null;
            }>;
            getItems?: () => Array<{
              getCells: () => Array<{ getText?: () => string; getValue?: () => string }>;
            }>;
            getRows?: () => Array<{
              getCells: () => Array<{ getText?: () => string; getValue?: () => string }>;
            }>;
          };

          let table: UI5Table | null = null;

          if (tableId && core.byId) {
            table = core.byId(tableId) as UI5Table | null;
            if (!table) {
              // @ts-expect-error browser context - runs in page
              const allElements = document.querySelectorAll(`[id$="${tableId}"]`);
              for (const el of allElements) {
                const ctrl = core.byId!(el.id) as UI5Table | null;
                if (ctrl?.getColumns) {
                  table = ctrl;
                  break;
                }
              }
            }
          }

          if (!table) {
            // @ts-expect-error browser context - runs in page
            const tables = document.querySelectorAll(
              ".sapMTable, .sapUiTable, [class*='sapMList']"
            );
            for (const el of tables) {
              if (el.id && core.byId) {
                const ctrl = core.byId(el.id) as UI5Table | null;
                if (ctrl?.getColumns) {
                  table = ctrl;
                  break;
                }
              }
            }
          }

          if (!table) {
            throw new Error("No UI5 table found on the page");
          }

          const columns = table.getColumns();
          const headers = columns.map((col) => {
            const hdr = col.getHeader?.() ?? col.getLabel?.();
            return hdr?.getText?.() ?? "";
          });

          const rows = table.getItems?.() ?? table.getRows?.() ?? [];
          const data: Array<Record<string, string>> = [];

          for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
            const cells = rows[i].getCells();
            const rowObj: Record<string, string> = {};
            cells.forEach((cell, idx) => {
              const key = headers[idx] || `col_${idx}`;
              rowObj[key] = cell.getText?.() ?? cell.getValue?.() ?? "";
            });
            data.push(rowObj);
          }

          return { headers, data, totalRows: rows.length };
        },
        { tableId: params.tableId, maxRows }
      );

      return {
        status: "success",
        tool: "sap.fiori.readTable",
        duration: 0,
        data: tableData,
      };
    },
  },

  "sap/fiori.assertControl": {
    description:
      "Assert that a UI5 control property has the expected value.",
    inputSchema: z.object({
      controlId: z.string().describe("The UI5 control ID"),
      property: z
        .string()
        .describe("The property name to check (e.g. 'value', 'text', 'visible', 'enabled')"),
      expectedValue: z
        .union([z.string(), z.number(), z.boolean()])
        .describe("The expected property value"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: {
        controlId: string;
        property: string;
        expectedValue: string | number | boolean;
        timeout?: number;
      }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      await waitForUI5Ready(page, timeout);

      const result = await page.evaluate(
        ({ controlId, property }) => {
          // @ts-expect-error browser context - runs in page
          const sap = (window as unknown as Record<string, unknown>).sap as {
            ui?: {
              getCore?: () => {
                byId?: (id: string) => Record<string, unknown> | null;
              };
            };
          } | undefined;

          if (!sap?.ui?.getCore) throw new Error("SAP UI5 not available");
          const core = sap.ui.getCore()!;
          if (!core.byId) throw new Error("core.byId not available");

          let ctrl = core.byId(controlId);
          if (!ctrl) {
            // @ts-expect-error browser context - runs in page
            const el = document.querySelector(`[id$="${controlId}"]`);
            if (el?.id) ctrl = core.byId(el.id);
          }
          if (!ctrl) throw new Error(`Control '${controlId}' not found`);

          const getterName = `get${property.charAt(0).toUpperCase()}${property.slice(1)}`;
          const getter = ctrl[getterName];
          if (typeof getter !== "function") {
            throw new Error(
              `Property '${property}' not found on control '${controlId}'`
            );
          }
          return { actualValue: (getter as () => unknown).call(ctrl) };
        },
        { controlId: params.controlId, property: params.property }
      );

      const passed = result.actualValue === params.expectedValue;

      return {
        status: passed ? "success" : "failure",
        tool: "sap/fiori.assertControl",
        duration: 0,
        data: {
          controlId: params.controlId,
          property: params.property,
          expectedValue: params.expectedValue,
          actualValue: result.actualValue,
          passed,
        },
      };
    },
  },

  "sap/fiori.getSnapshot": {
    description:
      "Get an accessibility snapshot of the current Fiori page, useful for understanding page structure.",
    inputSchema: z.object({
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      params: { timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 30000;
      await waitForUI5Ready(page, timeout).catch(() => {});

      const snapshot = await page.locator(":root").ariaSnapshot();

      const pageInfo = await page.evaluate(() => {
        // @ts-expect-error browser context - runs in page
        const sap = (window as unknown as Record<string, unknown>).sap as {
          ui?: {
            getCore?: () => {
              getConfiguration?: () => { getTheme?: () => string };
            };
          };
          ushell?: {
            Container?: {
              getService?: (name: string) => {
                getCurrentApplication?: () => { componentHandle?: { getInstance?: () => { getMetadata?: () => { getName?: () => string } } } };
              };
            };
          };
        } | undefined;

        const info: Record<string, unknown> = {
          // @ts-expect-error browser context - runs in page
          url: window.location.href,
          // @ts-expect-error browser context - runs in page
          hash: window.location.hash,
          // @ts-expect-error browser context - runs in page
          title: document.title,
        };

        if (sap?.ui?.getCore) {
          const core = sap.ui.getCore();
          const config = core?.getConfiguration?.();
          info.theme = config?.getTheme?.();
        }

        if (sap?.ushell?.Container?.getService) {
          try {
            const appSvc = sap.ushell.Container.getService("AppLifeCycle");
            const currentApp = appSvc?.getCurrentApplication?.();
            info.currentApp =
              currentApp?.componentHandle
                ?.getInstance?.()
                ?.getMetadata?.()
                ?.getName?.() ?? "unknown";
          } catch {
            // Launchpad service not available
          }
        }

        return info;
      });

      return {
        status: "success",
        tool: "sap/fiori.getSnapshot",
        duration: 0,
        data: {
          pageInfo,
          accessibilityTree: snapshot,
        },
        metadata: {
          snapshot: JSON.stringify(snapshot),
        },
      };
    },
  },
};
