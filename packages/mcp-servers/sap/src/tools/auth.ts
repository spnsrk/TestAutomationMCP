import { z } from "zod";
import type { Page } from "playwright";
import type { ToolResult } from "@test-automation-mcp/core";

type RfcClient = {
  open(): Promise<void>;
  close(): Promise<void>;
  call(functionModule: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  alive: boolean;
  connectionInfo?: Record<string, unknown>;
};

export interface SapConnectionState {
  fioriLoggedIn: boolean;
  fioriUrl: string | null;
  rfcConnected: boolean;
  rfcClient: RfcClient | null;
  rfcSystemInfo: Record<string, unknown> | null;
}

function createConnectionState(): SapConnectionState {
  return {
    fioriLoggedIn: false,
    fioriUrl: null,
    rfcConnected: false,
    rfcClient: null,
    rfcSystemInfo: null,
  };
}

let connectionState = createConnectionState();

export function getConnectionState(): SapConnectionState {
  return connectionState;
}

export function getRfcClient(): RfcClient | null {
  return connectionState.rfcClient;
}

export function setRfcClient(client: RfcClient | null): void {
  connectionState.rfcClient = client;
  connectionState.rfcConnected = client !== null;
}

export function setFioriLoggedIn(url: string): void {
  connectionState.fioriLoggedIn = true;
  connectionState.fioriUrl = url;
}

export function resetConnectionState(): void {
  connectionState = createConnectionState();
}

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
  await page.waitForLoadState("networkidle");
}

export const authTools = {
  "sap/auth.loginFiori": {
    description:
      "Login to SAP Fiori Launchpad via Playwright. Navigates to the Fiori URL, enters credentials, and waits for the Launchpad to be ready.",
    inputSchema: z.object({
      url: z.string().describe("SAP Fiori Launchpad URL"),
      username: z.string().describe("SAP username"),
      password: z.string().describe("SAP password"),
      timeout: z
        .number()
        .default(60000)
        .describe("Login timeout in milliseconds"),
    }),
    handler: async (
      page: Page,
      params: { url: string; username: string; password: string; timeout?: number }
    ): Promise<ToolResult> => {
      const timeout = params.timeout ?? 60000;

      await page.goto(params.url, { waitUntil: "domcontentloaded", timeout });

      const usernameField = page.locator(
        'input[name="j_username"], input[name="sap-user"], input[id*="USERNAME"], input[id*="username"], input[type="text"][id*="USER"]'
      );
      const passwordField = page.locator(
        'input[name="j_password"], input[name="sap-password"], input[id*="PASSWORD"], input[id*="password"], input[type="password"]'
      );

      await usernameField.first().waitFor({ state: "visible", timeout });
      await usernameField.first().fill(params.username);

      await passwordField.first().waitFor({ state: "visible", timeout });
      await passwordField.first().fill(params.password);

      const loginButton = page.locator(
        'button[type="submit"], button:has-text("Log On"), button:has-text("Login"), button[id*="LOGIN"], button[id*="logon"]'
      );
      await loginButton.first().click();

      try {
        await waitForUI5Ready(page, timeout);
      } catch {
        const errorMsg = await page
          .locator('[class*="error"], [class*="message"], [id*="error"]')
          .first()
          .textContent()
          .catch(() => null);
        if (errorMsg) {
          return {
            status: "failure",
            tool: "sap/auth.loginFiori",
            duration: 0,
            error: {
              code: "FIORI_LOGIN_FAILED",
              message: `Login failed: ${errorMsg.trim()}`,
            },
          };
        }
        await page.waitForLoadState("networkidle", { timeout });
      }

      setFioriLoggedIn(params.url);

      return {
        status: "success",
        tool: "sap/auth.loginFiori",
        duration: 0,
        data: {
          url: page.url(),
          title: await page.title(),
          loggedIn: true,
        },
      };
    },
  },

  "sap/auth.loginRfc": {
    description:
      "Establish an RFC connection to a SAP system using node-rfc. Requires the optional node-rfc package to be installed.",
    inputSchema: z.object({
      ashost: z.string().describe("SAP application server hostname"),
      sysnr: z.string().describe("SAP system number (e.g. '00')"),
      client: z.string().describe("SAP client number (e.g. '100')"),
      user: z.string().describe("SAP username"),
      passwd: z.string().describe("SAP password"),
      lang: z.string().default("EN").describe("Logon language"),
    }),
    handler: async (
      _page: Page,
      params: {
        ashost: string;
        sysnr: string;
        client: string;
        user: string;
        passwd: string;
        lang?: string;
      }
    ): Promise<ToolResult> => {
      let nodeRfc: { Client: new (connParams: Record<string, string>) => RfcClient };
      try {
        nodeRfc = await import("node-rfc") as unknown as typeof nodeRfc;
      } catch {
        return {
          status: "error",
          tool: "sap/auth.loginRfc",
          duration: 0,
          error: {
            code: "NODE_RFC_NOT_INSTALLED",
            message:
              "The 'node-rfc' package is not installed. Install it with: npm install node-rfc. " +
              "Note: node-rfc requires the SAP NW RFC SDK to be installed on the system.",
          },
        };
      }

      const connParams = {
        ashost: params.ashost,
        sysnr: params.sysnr,
        client: params.client,
        user: params.user,
        passwd: params.passwd,
        lang: params.lang ?? "EN",
      };

      const client = new nodeRfc.Client(connParams);
      try {
        await client.open();
      } catch (err) {
        return {
          status: "failure",
          tool: "sap/auth.loginRfc",
          duration: 0,
          error: {
            code: "RFC_CONNECTION_FAILED",
            message: `RFC connection failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }

      setRfcClient(client);

      let systemInfo: Record<string, unknown> = {};
      try {
        const result = await client.call("RFC_SYSTEM_INFO", {});
        const rfcsiExport = result.RFCSI_EXPORT as Record<string, unknown> | undefined;
        systemInfo = {
          systemId: rfcsiExport?.RFCSYSID,
          host: rfcsiExport?.RFCHOST,
          dbSys: rfcsiExport?.RFCDBSYS,
          sapRelease: rfcsiExport?.RFCSAPRL,
          client: params.client,
        };
        connectionState.rfcSystemInfo = systemInfo;
      } catch {
        systemInfo = { note: "Connected but could not retrieve system info" };
      }

      return {
        status: "success",
        tool: "sap/auth.loginRfc",
        duration: 0,
        data: {
          connected: true,
          systemInfo,
        },
      };
    },
  },

  "sap/auth.getStatus": {
    description: "Get the current SAP connection status for Fiori, RFC, and OData sessions.",
    inputSchema: z.object({}),
    handler: async (_page: Page): Promise<ToolResult> => {
      const state = getConnectionState();
      return {
        status: "success",
        tool: "sap/auth.getStatus",
        duration: 0,
        data: {
          fiori: {
            loggedIn: state.fioriLoggedIn,
            url: state.fioriUrl,
          },
          rfc: {
            connected: state.rfcConnected,
            alive: state.rfcClient?.alive ?? false,
            systemInfo: state.rfcSystemInfo,
          },
        },
      };
    },
  },
};
