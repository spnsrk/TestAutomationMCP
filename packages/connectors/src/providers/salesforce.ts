import { createHash, randomBytes } from "crypto";
import { createLogger } from "@test-automation-mcp/core";
import type { Connector, ConnectorConfig, ConnectorQuery, RequirementDocument } from "../connector.js";

/** Generate a PKCE code_verifier (43–128 URL-safe chars). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** Derive the code_challenge from a verifier (S256 method). */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const logger = createLogger("connector-salesforce");

export interface SalesforceCredentials {
  /** Connected App consumer key */
  clientId: string;
  /** Connected App consumer secret */
  clientSecret: string;
  /** OAuth redirect URI registered in Connected App */
  redirectUri?: string;
  /** true = test.salesforce.com, false = login.salesforce.com */
  isSandbox?: boolean;
  /** Auth flow: oauth (recommended) | password | client_credentials */
  authType?: "oauth" | "password" | "client_credentials";
  /** For password flow */
  username?: string;
  password?: string;
  securityToken?: string;
  /** Salesforce API version */
  apiVersion?: string;
}

export interface SalesforceTokens {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  connectedUser?: string;
  connectedAt?: string;
}

interface SFQueryResult {
  records: Record<string, unknown>[];
  totalSize: number;
  done: boolean;
}

export class SalesforceConnector implements Connector {
  name = "salesforce";
  private creds: SalesforceCredentials;
  private accessToken = "";
  private refreshTokenValue = "";
  private instanceUrl = "";

  constructor(creds: SalesforceCredentials, tokens?: SalesforceTokens) {
    this.creds = creds;
    if (tokens) {
      this.accessToken = tokens.accessToken;
      this.refreshTokenValue = tokens.refreshToken ?? "";
      this.instanceUrl = tokens.instanceUrl;
    }
  }

  get loginUrl(): string {
    return this.creds.isSandbox
      ? "https://test.salesforce.com"
      : "https://login.salesforce.com";
  }

  get apiVersion(): string {
    return this.creds.apiVersion ?? "v59.0";
  }

  /** Build the OAuth2 authorization URL for the Connected App flow.
   *  Pass codeChallenge (S256) when the Connected App requires PKCE. */
  buildAuthUrl(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.creds.clientId,
      redirect_uri: this.creds.redirectUri ?? "",
      state,
      scope: "api refresh_token",
    });
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${this.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  /** Exchange an authorization code for tokens (OAuth callback).
   *  Pass codeVerifier when the Connected App required PKCE. */
  async exchangeCode(code: string, codeVerifier?: string): Promise<SalesforceTokens> {
    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      redirect_uri: this.creds.redirectUri ?? "",
    };
    if (codeVerifier) body["code_verifier"] = codeVerifier;

    const resp = await fetch(`${this.loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Salesforce token exchange failed (${resp.status}): ${body.slice(0, 300)}`);
    }

    const data = await resp.json() as { access_token: string; refresh_token?: string; instance_url: string };

    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token ?? "";
    this.instanceUrl = data.instance_url;

    // Fetch the connected user's identity
    let connectedUser = "";
    try {
      const idResp = await fetch(`${this.instanceUrl}/services/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (idResp.ok) {
        const info = await idResp.json() as { preferred_username?: string; email?: string };
        connectedUser = info.preferred_username ?? info.email ?? "";
      }
    } catch { /* non-fatal */ }

    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshTokenValue,
      instanceUrl: this.instanceUrl,
      connectedUser,
      connectedAt: new Date().toISOString(),
    };
  }

  /** Authenticate using stored tokens or credentials. */
  private async _authenticate(): Promise<void> {
    if (this.accessToken) return;

    const authType = this.creds.authType ?? "oauth";

    if (authType === "oauth") {
      if (this.refreshTokenValue) {
        await this._refreshAccessToken();
        return;
      }
      throw new Error("Salesforce not connected. Use the Connections page to authorize via OAuth.");
    }

    const tokenUrl = `${this.loginUrl}/services/oauth2/token`;

    if (authType === "client_credentials") {
      const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
        }),
      });
      if (!resp.ok) throw new Error(`Salesforce auth failed: ${await resp.text()}`);
      const data = await resp.json() as { access_token: string; instance_url: string };
      this.accessToken = data.access_token;
      this.instanceUrl = data.instance_url;
      return;
    }

    // Password flow
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        username: this.creds.username ?? "",
        password: `${this.creds.password ?? ""}${this.creds.securityToken ?? ""}`,
      }),
    });
    if (!resp.ok) throw new Error(`Salesforce auth failed: ${await resp.text()}`);
    const data = await resp.json() as { access_token: string; instance_url: string };
    this.accessToken = data.access_token;
    this.instanceUrl = data.instance_url;
  }

  private async _refreshAccessToken(): Promise<void> {
    const resp = await fetch(`${this.loginUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        refresh_token: this.refreshTokenValue,
      }),
    });
    if (!resp.ok) throw new Error(`Salesforce token refresh failed: ${await resp.text()}`);
    const data = await resp.json() as { access_token: string; instance_url?: string };
    this.accessToken = data.access_token;
    if (data.instance_url) this.instanceUrl = data.instance_url;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  // ── Connector interface ────────────────────────────────────

  async authenticate(_config: ConnectorConfig): Promise<void> {
    await this._authenticate();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this._authenticate();
      const resp = await fetch(`${this.instanceUrl}/services/oauth2/userinfo`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 401) {
        // Try refreshing once
        this.accessToken = "";
        await this._authenticate();
        const retry = await fetch(`${this.instanceUrl}/services/oauth2/userinfo`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        return retry.ok;
      }
      return resp.ok;
    } catch {
      return false;
    }
  }

  async fetchRequirements(query: ConnectorQuery): Promise<RequirementDocument[]> {
    await this._authenticate();

    // Try common user story objects; fall back to Cases if not found
    const objectType = "Case";
    const conditions: string[] = [];
    if (query.status?.length) {
      conditions.push(`Status IN (${query.status.map((s) => `'${s}'`).join(",")})`);
    }
    if (query.query) conditions.push(query.query);

    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const soql = `SELECT Id, CaseNumber, Subject, Description, Priority, Status FROM ${objectType}${where} ORDER BY CreatedDate DESC LIMIT ${query.maxResults ?? 50}`;

    const resp = await fetch(
      `${this.instanceUrl}/services/data/${this.apiVersion}/query?q=${encodeURIComponent(soql)}`,
      { headers: this.headers() }
    );

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Salesforce SOQL query failed (${resp.status}): ${body.slice(0, 300)}`);
    }

    const data = await resp.json() as SFQueryResult;
    logger.info({ total: data.totalSize, fetched: data.records.length }, "Salesforce records fetched");

    return data.records.map((r) => ({
      id: r["Id"] as string,
      externalId: (r["CaseNumber"] ?? r["Id"]) as string,
      title: (r["Subject"] ?? r["Name"] ?? "") as string,
      description: (r["Description"] ?? "") as string,
      source: "salesforce",
      type: "case",
      priority: r["Priority"] as string | undefined,
      labels: [],
      acceptanceCriteria: [],
      rawData: r,
    }));
  }

  async fetchSingle(externalId: string): Promise<RequirementDocument | null> {
    await this._authenticate();
    try {
      const resp = await fetch(
        `${this.instanceUrl}/services/data/${this.apiVersion}/sobjects/Case/${externalId}`,
        { headers: this.headers() }
      );
      if (!resp.ok) return null;
      const r = await resp.json() as Record<string, unknown>;
      return {
        id: r["Id"] as string,
        externalId: (r["CaseNumber"] ?? r["Id"]) as string,
        title: (r["Subject"] ?? "") as string,
        description: (r["Description"] ?? "") as string,
        source: "salesforce",
        type: "case",
        priority: r["Priority"] as string | undefined,
        labels: [],
        acceptanceCriteria: [],
        rawData: r,
      };
    } catch {
      return null;
    }
  }
}
