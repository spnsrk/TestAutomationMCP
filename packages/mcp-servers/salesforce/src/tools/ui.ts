import { z } from "zod";
import type { Page } from "playwright";
import type { Connection } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-ui");

const LIGHTNING_LOAD_TIMEOUT = 30000;

async function waitForLightningReady(page: Page): Promise<void> {
  await page.waitForFunction(
    `() => {
      const auraReady = typeof window !== 'undefined' && (window as any).$A !== undefined;
      const spinners = document.querySelectorAll(".slds-spinner_container:not(.slds-hide)");
      return auraReady && spinners.length === 0;
    }`,
    { timeout: LIGHTNING_LOAD_TIMEOUT }
  );
}

export const uiTools = {
  "sf/ui.navigateToApp": {
    description:
      "Navigate to a Salesforce Lightning app by name (e.g., Sales, Service Console). Requires an active connection to determine the instance URL.",
    inputSchema: z.object({
      appName: z
        .string()
        .describe("Lightning app name or API name (e.g., 'Sales', 'standard__LightningSales')"),
      timeout: z.number().default(30000).describe("Navigation timeout in ms"),
    }),
    handler: async (
      page: Page,
      conn: Connection,
      params: { appName: string; timeout: number }
    ): Promise<ToolResult> => {
      const instanceUrl = conn.instanceUrl;
      const appPath = params.appName.includes("__")
        ? params.appName
        : `standard__${params.appName}`;

      const url = `${instanceUrl}/lightning/app/${appPath}`;
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: params.timeout,
      });
      await waitForLightningReady(page);

      const title = await page.title();

      logger.info({ appName: params.appName }, "Navigated to Lightning app");

      return {
        status: "success",
        tool: "sf/ui.navigateToApp",
        duration: 0,
        data: {
          url: page.url(),
          title,
          appName: params.appName,
        },
      };
    },
  },

  "salesforce.ui.navigateToRecord": {
    description:
      "Navigate to a specific Salesforce record page by object type and record ID",
    inputSchema: z.object({
      objectType: z
        .string()
        .describe("SObject API name (e.g., Account, Contact)"),
      recordId: z.string().describe("18-character Salesforce record ID"),
      timeout: z.number().default(30000),
    }),
    handler: async (
      page: Page,
      conn: Connection,
      params: { objectType: string; recordId: string; timeout: number }
    ): Promise<ToolResult> => {
      const instanceUrl = conn.instanceUrl;
      const url = `${instanceUrl}/lightning/r/${params.objectType}/${params.recordId}/view`;

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: params.timeout,
      });
      await waitForLightningReady(page);

      const title = await page.title();
      const heading = await page
        .locator("lightning-formatted-name, .slds-page-header__title, records-entity-label")
        .first()
        .textContent()
        .catch(() => null);

      logger.info(
        { objectType: params.objectType, recordId: params.recordId },
        "Navigated to record"
      );

      return {
        status: "success",
        tool: "salesforce.ui.navigateToRecord",
        duration: 0,
        data: {
          url: page.url(),
          title,
          recordName: heading?.trim() ?? null,
          objectType: params.objectType,
          recordId: params.recordId,
        },
      };
    },
  },

  "salesforce.ui.fillForm": {
    description:
      "Fill a Salesforce Lightning form by mapping field labels to values. Handles standard Lightning input components including text, picklist, date, and lookup fields.",
    inputSchema: z.object({
      fields: z
        .record(z.string())
        .describe("Map of field labels to values (e.g., { 'Account Name': 'Acme Corp' })"),
      timeout: z.number().default(10000).describe("Per-field interaction timeout in ms"),
    }),
    handler: async (
      page: Page,
      _conn: Connection,
      params: { fields: Record<string, string>; timeout: number }
    ): Promise<ToolResult> => {
      const filledFields: string[] = [];
      const errors: Array<{ field: string; error: string }> = [];

      for (const [label, value] of Object.entries(params.fields)) {
        try {
          const inputLocator = page.locator(
            `lightning-input[data-field-label="${label}"] input, ` +
            `lightning-input-field[data-field-label="${label}"] input, ` +
            `lightning-textarea[data-field-label="${label}"] textarea`
          );

          if (await inputLocator.count() > 0) {
            await inputLocator.first().fill(value, { timeout: params.timeout });
            filledFields.push(label);
            continue;
          }

          const labelLocator = page.locator(`label:has-text("${label}")`).first();
          if (await labelLocator.count() > 0) {
            const forAttr = await labelLocator.getAttribute("for");
            if (forAttr) {
              const inputById = page.locator(`#${forAttr}`);
              await inputById.fill(value, { timeout: params.timeout });
              filledFields.push(label);
              continue;
            }
          }

          const formField = page.locator(
            `lightning-input-field, lightning-input, lightning-combobox, lightning-textarea`
          ).filter({ has: page.locator(`label:has-text("${label}")`) }).first();

          if (await formField.count() > 0) {
            const combobox = formField.locator("lightning-base-combobox");
            if (await combobox.count() > 0) {
              await combobox.locator("input").first().click({ timeout: params.timeout });
              await page.locator(`lightning-base-combobox-item span.slds-truncate:has-text("${value}")`).first().click({
                timeout: params.timeout,
              });
              filledFields.push(label);
              continue;
            }

            const input = formField.locator("input, textarea").first();
            await input.fill(value, { timeout: params.timeout });
            filledFields.push(label);
            continue;
          }

          errors.push({
            field: label,
            error: `Could not find input for field "${label}"`,
          });
        } catch (err) {
          errors.push({
            field: label,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const allSucceeded = errors.length === 0;

      logger.info(
        { filled: filledFields.length, errors: errors.length },
        "Form fill completed"
      );

      return {
        status: allSucceeded ? "success" : "failure",
        tool: "salesforce.ui.fillForm",
        duration: 0,
        data: {
          filledFields,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    },
  },

  "sf/ui.clickButton": {
    description:
      "Click a button in the Lightning UI by its label text",
    inputSchema: z.object({
      label: z.string().describe("Button label text"),
      timeout: z.number().default(10000),
    }),
    handler: async (
      page: Page,
      _conn: Connection,
      params: { label: string; timeout: number }
    ): Promise<ToolResult> => {
      const button = page.locator(
        `button:has-text("${params.label}"), ` +
        `lightning-button:has-text("${params.label}"), ` +
        `lightning-button-menu:has-text("${params.label}"), ` +
        `a.slds-button:has-text("${params.label}")`
      ).first();

      await button.scrollIntoViewIfNeeded({ timeout: params.timeout });
      await button.click({ timeout: params.timeout });

      logger.info({ label: params.label }, "Button clicked");

      return {
        status: "success",
        tool: "sf/ui.clickButton",
        duration: 0,
        data: {
          label: params.label,
          clicked: true,
        },
      };
    },
  },

  "sf/ui.waitForToast": {
    description:
      "Wait for a Salesforce Lightning toast notification and return its message and variant",
    inputSchema: z.object({
      timeout: z.number().default(15000).describe("Timeout in ms"),
      expectedMessage: z
        .string()
        .optional()
        .describe("Optional expected message text to validate"),
    }),
    handler: async (
      page: Page,
      _conn: Connection,
      params: { timeout: number; expectedMessage?: string }
    ): Promise<ToolResult> => {
      const toastContainer = page.locator("div.toastContainer, lightning-notif");
      await toastContainer.waitFor({ state: "visible", timeout: params.timeout });

      const toastMessage = await page
        .locator(
          "div.toastContainer .toastMessage, " +
          "div.toastContainer .slds-notify__content, " +
          "lightning-notif .slds-notify__content"
        )
        .first()
        .textContent({ timeout: 5000 });

      const message = toastMessage?.trim() ?? "";

      const variantEl = page.locator(
        "div.forceToastMessage, div.slds-notify"
      ).first();
      const classAttr = await variantEl.getAttribute("class").catch(() => "");
      let variant = "info";
      if (classAttr?.includes("error")) variant = "error";
      else if (classAttr?.includes("success")) variant = "success";
      else if (classAttr?.includes("warning")) variant = "warning";

      const matched =
        !params.expectedMessage || message.includes(params.expectedMessage);

      logger.info({ message, variant, matched }, "Toast detected");

      return {
        status: matched ? "success" : "failure",
        tool: "sf/ui.waitForToast",
        duration: 0,
        data: {
          message,
          variant,
          matched,
          expectedMessage: params.expectedMessage,
        },
      };
    },
  },

  "sf/ui.getRecordDetail": {
    description:
      "Extract field label-value pairs from the current Lightning record detail page",
    inputSchema: z.object({
      fieldLabels: z
        .array(z.string())
        .optional()
        .describe("Specific field labels to extract. If omitted, extracts all visible fields."),
      timeout: z.number().default(10000),
    }),
    handler: async (
      page: Page,
      _conn: Connection,
      params: { fieldLabels?: string[]; timeout: number }
    ): Promise<ToolResult> => {
      await page
        .locator("records-record-layout-section, force-record-layout-section")
        .first()
        .waitFor({ state: "visible", timeout: params.timeout });

      const fieldData: Record<string, string | null> = {};

      const fieldItems = page.locator(
        "records-record-layout-item, force-record-layout-item"
      );
      const count = await fieldItems.count();

      for (let i = 0; i < count; i++) {
        const item = fieldItems.nth(i);
        const labelEl = item.locator(
          "span.test-id__field-label, .slds-form-element__label"
        ).first();
        const label = (await labelEl.textContent().catch(() => null))?.trim();

        if (!label) continue;

        if (params.fieldLabels && !params.fieldLabels.includes(label)) {
          continue;
        }

        const valueEl = item.locator(
          "span.test-id__field-value, .slds-form-element__static, lightning-formatted-text, " +
          "lightning-formatted-name, lightning-formatted-number, lightning-formatted-phone, " +
          "lightning-formatted-email, lightning-formatted-url, lightning-formatted-date-time"
        ).first();

        const value = (await valueEl.textContent().catch(() => null))?.trim() ?? null;
        fieldData[label] = value;
      }

      logger.info(
        { fieldsExtracted: Object.keys(fieldData).length },
        "Record detail extracted"
      );

      return {
        status: "success",
        tool: "sf/ui.getRecordDetail",
        duration: 0,
        data: {
          fields: fieldData,
          fieldCount: Object.keys(fieldData).length,
        },
      };
    },
  },
};
