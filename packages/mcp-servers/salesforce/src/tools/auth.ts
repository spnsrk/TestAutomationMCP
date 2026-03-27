import { z } from "zod";
import jsforce from "jsforce";
import type { Connection, ConnectionConfig } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-auth");

export interface AuthState {
  connection: Connection | null;
  userId: string | null;
  orgId: string | null;
  instanceUrl: string | null;
}

export function createAuthState(): AuthState {
  return {
    connection: null,
    userId: null,
    orgId: null,
    instanceUrl: null,
  };
}

export const authTools = {
  "salesforce.auth.login": {
    description:
      "Login to Salesforce using OAuth, SOAP, or JWT authentication. Returns connection info, userId, and orgId.",
    inputSchema: z.object({
      loginUrl: z
        .string()
        .default("https://login.salesforce.com")
        .describe("Salesforce login URL (use https://test.salesforce.com for sandboxes)"),
      username: z.string().describe("Salesforce username"),
      password: z.string().describe("Salesforce password"),
      securityToken: z
        .string()
        .default("")
        .describe("Security token appended to password for SOAP login"),
      clientId: z
        .string()
        .optional()
        .describe("OAuth connected app client ID"),
      clientSecret: z
        .string()
        .optional()
        .describe("OAuth connected app client secret"),
      authMethod: z
        .enum(["oauth", "soap", "jwt"])
        .default("soap")
        .describe("Authentication method to use"),
    }),
    handler: async (
      authState: AuthState,
      params: {
        loginUrl: string;
        username: string;
        password: string;
        securityToken: string;
        clientId?: string;
        clientSecret?: string;
        authMethod: "oauth" | "soap" | "jwt";
      }
    ): Promise<ToolResult> => {
      if (authState.connection) {
        try {
          await authState.connection.logout();
        } catch {
          // ignore cleanup errors from prior session
        }
      }

      const connOpts: ConnectionConfig = {
        loginUrl: params.loginUrl,
      };

      if (params.clientId) {
        connOpts.oauth2 = {
          clientId: params.clientId,
          clientSecret: params.clientSecret,
          loginUrl: params.loginUrl,
        };
      }

      const conn = new jsforce.Connection(connOpts);

      if (params.authMethod === "oauth" && params.clientId && params.clientSecret) {
        const passwordWithToken = params.password + params.securityToken;
        const tokenResponse = await fetch(`${params.loginUrl}/services/oauth2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: params.clientId,
            client_secret: params.clientSecret,
            username: params.username,
            password: passwordWithToken,
          }),
        });

        if (!tokenResponse.ok) {
          const errBody = await tokenResponse.text();
          return {
            status: "error",
            tool: "salesforce.auth.login",
            duration: 0,
            error: {
              code: "OAUTH_ERROR",
              message: `OAuth token request failed: ${errBody}`,
            },
          };
        }

        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          instance_url: string;
          id: string;
        };

        const authedConn = new jsforce.Connection({
          instanceUrl: tokenData.instance_url,
          accessToken: tokenData.access_token,
        });

        const identity = await authedConn.identity();
        authState.connection = authedConn;
        authState.userId = identity.user_id;
        authState.orgId = identity.organization_id;
        authState.instanceUrl = tokenData.instance_url;

        logger.info({ userId: identity.user_id, orgId: identity.organization_id }, "OAuth login successful");

        return {
          status: "success",
          tool: "salesforce.auth.login",
          duration: 0,
          data: {
            userId: identity.user_id,
            orgId: identity.organization_id,
            instanceUrl: tokenData.instance_url,
            authMethod: "oauth",
          },
        };
      }

      const passwordWithToken = params.password + params.securityToken;
      const userInfo = await conn.login(params.username, passwordWithToken);

      authState.connection = conn;
      authState.userId = userInfo.id;
      authState.orgId = userInfo.organizationId;
      authState.instanceUrl = conn.instanceUrl;

      logger.info(
        { userId: userInfo.id, orgId: userInfo.organizationId },
        "SOAP login successful"
      );

      return {
        status: "success",
        tool: "salesforce.auth.login",
        duration: 0,
        data: {
          userId: userInfo.id,
          orgId: userInfo.organizationId,
          instanceUrl: conn.instanceUrl,
          authMethod: params.authMethod,
        },
      };
    },
  },

  "sf/auth.logout": {
    description: "Logout from Salesforce and clean up the connection",
    inputSchema: z.object({}),
    handler: async (authState: AuthState): Promise<ToolResult> => {
      if (!authState.connection) {
        return {
          status: "success",
          tool: "sf/auth.logout",
          duration: 0,
          data: { message: "No active connection to logout from" },
        };
      }

      try {
        await authState.connection.logout();
      } catch (err) {
        logger.warn({ error: err }, "Logout request failed, cleaning up locally");
      }

      authState.connection = null;
      authState.userId = null;
      authState.orgId = null;
      authState.instanceUrl = null;

      logger.info("Logged out from Salesforce");

      return {
        status: "success",
        tool: "sf/auth.logout",
        duration: 0,
        data: { message: "Successfully logged out" },
      };
    },
  },

  "sf/auth.getConnection": {
    description:
      "Get the current Salesforce connection status including userId, orgId, and instance URL",
    inputSchema: z.object({}),
    handler: async (authState: AuthState): Promise<ToolResult> => {
      if (!authState.connection) {
        return {
          status: "success",
          tool: "sf/auth.getConnection",
          duration: 0,
          data: {
            connected: false,
            message: "No active Salesforce connection",
          },
        };
      }

      let accessTokenValid = true;
      try {
        await authState.connection.identity();
      } catch {
        accessTokenValid = false;
      }

      return {
        status: "success",
        tool: "sf/auth.getConnection",
        duration: 0,
        data: {
          connected: true,
          accessTokenValid,
          userId: authState.userId,
          orgId: authState.orgId,
          instanceUrl: authState.instanceUrl,
        },
      };
    },
  },
};
