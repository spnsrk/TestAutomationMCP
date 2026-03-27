import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import {
  ConnectorRegistry,
  ConnectorConfigSchema,
  SalesforceConnector,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@test-automation-mcp/connectors";
import type { ConnectorQuery, SalesforceCredentials } from "@test-automation-mcp/connectors";
import { getDb } from "../db/connection.js";
import { documents, connectorConfigs } from "../db/schema.js";
import type { RequirementExtractor } from "../services/requirement-extractor.js";
import { eq } from "drizzle-orm";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-connectors");

const CONNECTOR_TYPES = ["salesforce", "jira", "github"] as const;

function now() {
  return new Date().toISOString();
}

function buildSalesforceConnector(): SalesforceConnector | null {
  const db = getDb();
  const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, "salesforce")).get();
  if (!row) return null;
  let creds: SalesforceCredentials;
  try { creds = JSON.parse(row.configJson) as SalesforceCredentials; } catch { return null; }
  if (!creds.clientId) return null;
  return new SalesforceConnector(creds, row.accessToken ? {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken ?? undefined,
    instanceUrl: row.instanceUrl ?? "",
    connectedUser: row.connectedUser ?? undefined,
    connectedAt: row.connectedAt ?? undefined,
  } : undefined);
}

export function registerConnectorRoutes(
  app: FastifyInstance,
  extractor: RequirementExtractor
): void {
  const registry = new ConnectorRegistry();

  // ── GET /api/connections ──────────────────────────────────────────────────
  app.get("/api/connections", async (_request, reply) => {
    const db = getDb();
    const rows = db.select().from(connectorConfigs).all();
    const rowMap = new Map(rows.map((r) => [r.type, r]));

    const result = CONNECTOR_TYPES.map((type) => {
      const row = rowMap.get(type);
      return {
        type,
        status: row?.status ?? "disconnected",
        connectedUser: row?.connectedUser ?? null,
        connectedAt: row?.connectedAt ?? null,
        instanceUrl: row?.instanceUrl ?? null,
      };
    });

    return reply.send({ connections: result });
  });

  // ── GET /api/connections/:type ─────────────────────────────────────────────
  app.get("/api/connections/:type", async (request, reply) => {
    const { type } = request.params as { type: string };
    const db = getDb();
    const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, type)).get();
    if (!row) {
      return reply.send({ type, status: "disconnected", connectedUser: null, instanceUrl: null, config: {} });
    }

    let config: Record<string, unknown> = {};
    try { config = JSON.parse(row.configJson); } catch { /* ok */ }

    // Redact secrets
    const safeConfig = { ...config };
    for (const key of ["clientSecret", "password", "securityToken", "token", "_oauthState"]) {
      if (safeConfig[key]) safeConfig[key] = "••••••••";
    }

    return reply.send({
      type: row.type,
      status: row.status,
      connectedUser: row.connectedUser,
      connectedAt: row.connectedAt,
      instanceUrl: row.instanceUrl,
      config: safeConfig,
    });
  });

  // ── POST /api/connections/:type/config ────────────────────────────────────
  // Save credentials (does not connect yet)
  app.post("/api/connections/:type/config", async (request, reply) => {
    const { type } = request.params as { type: string };
    const body = request.body as Record<string, unknown>;

    if (!CONNECTOR_TYPES.includes(type as typeof CONNECTOR_TYPES[number])) {
      return reply.status(400).send({ error: `Unknown connector type: ${type}` });
    }

    const db = getDb();
    const ts = now();
    const existing = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, type)).get();

    let merged: Record<string, unknown> = {};
    if (existing?.configJson) {
      try { merged = JSON.parse(existing.configJson); } catch { /* ok */ }
    }
    for (const [k, v] of Object.entries(body)) {
      if (v !== "••••••••" && v !== undefined && v !== null && v !== "") {
        merged[k] = v;
      }
    }

    if (existing) {
      db.update(connectorConfigs)
        .set({ configJson: JSON.stringify(merged), updatedAt: ts })
        .where(eq(connectorConfigs.type, type))
        .run();
    } else {
      db.insert(connectorConfigs).values({
        type,
        configJson: JSON.stringify(merged),
        status: "disconnected",
        createdAt: ts,
        updatedAt: ts,
      }).run();
    }

    logger.info({ type }, "Connector config saved");
    return reply.send({ type, saved: true });
  });

  // ── POST /api/connections/:type/test ──────────────────────────────────────
  app.post("/api/connections/:type/test", async (request, reply) => {
    const { type } = request.params as { type: string };

    if (type === "salesforce") {
      const connector = buildSalesforceConnector();
      if (!connector) return reply.status(400).send({ ok: false, error: "Salesforce config not saved yet" });
      const ok = await connector.testConnection();
      const db = getDb();
      db.update(connectorConfigs)
        .set({ status: ok ? "connected" : "error", updatedAt: now() })
        .where(eq(connectorConfigs.type, "salesforce"))
        .run();
      return reply.send({ ok });
    }

    const db = getDb();
    const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, type)).get();
    if (!row) return reply.status(400).send({ ok: false, error: "Config not saved" });

    let config: Record<string, unknown> = {};
    try { config = JSON.parse(row.configJson); } catch { /* ok */ }

    try {
      const parsedConfig = ConnectorConfigSchema.parse({ type, ...config });
      await registry.register(type, parsedConfig);
      const connector = registry.get(type);
      const ok = await connector!.testConnection();
      db.update(connectorConfigs)
        .set({ status: ok ? "connected" : "error", updatedAt: now() })
        .where(eq(connectorConfigs.type, type))
        .run();
      return reply.send({ ok });
    } catch (err) {
      return reply.status(400).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── DELETE /api/connections/:type ─────────────────────────────────────────
  app.delete("/api/connections/:type", async (request, reply) => {
    const { type } = request.params as { type: string };
    const db = getDb();
    db.update(connectorConfigs)
      .set({
        status: "disconnected",
        accessToken: null,
        refreshToken: null,
        connectedUser: null,
        connectedAt: null,
        updatedAt: now(),
      })
      .where(eq(connectorConfigs.type, type))
      .run();
    logger.info({ type }, "Connector disconnected");
    return reply.send({ disconnected: true });
  });

  // ── Salesforce OAuth ──────────────────────────────────────────────────────

  // GET /api/connections/salesforce/oauth-url
  app.get("/api/connections/salesforce/oauth-url", async (_request, reply) => {
    const db = getDb();
    const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, "salesforce")).get();
    if (!row) return reply.status(400).send({ error: "Save Salesforce config first" });

    let creds: SalesforceCredentials & { _oauthState?: string };
    try { creds = JSON.parse(row.configJson) as SalesforceCredentials; } catch {
      return reply.status(400).send({ error: "Invalid Salesforce config" });
    }

    if (!creds.clientId || !creds.redirectUri) {
      return reply.status(400).send({ error: "clientId and redirectUri are required in the Salesforce config" });
    }

    const state = `tamcp:${uuid()}`;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    creds._oauthState = state;
    (creds as unknown as Record<string, unknown>)["_pkceVerifier"] = codeVerifier;
    db.update(connectorConfigs)
      .set({ configJson: JSON.stringify(creds), updatedAt: now() })
      .where(eq(connectorConfigs.type, "salesforce"))
      .run();

    const connector = new SalesforceConnector(creds);
    const authUrl = connector.buildAuthUrl(state, codeChallenge);
    return reply.send({ authUrl });
  });

  // GET /api/connections/salesforce/callback
  // Salesforce redirects here after user authorizes in their browser
  app.get("/api/connections/salesforce/callback", async (request, reply) => {
    const { code, state, error: sfError } = request.query as Record<string, string>;
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3001";

    if (sfError) {
      return reply.redirect(`${frontendUrl}/connections?sf=error&reason=${encodeURIComponent(sfError)}`);
    }
    if (!code || !state) {
      return reply.status(400).send({ error: "Missing code or state" });
    }

    const db = getDb();
    const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, "salesforce")).get();
    if (!row) return reply.status(400).send({ error: "Salesforce not configured" });

    let creds: SalesforceCredentials & { _oauthState?: string; _pkceVerifier?: string };
    try { creds = JSON.parse(row.configJson); } catch {
      return reply.status(400).send({ error: "Invalid config" });
    }

    if (creds._oauthState !== state) {
      return reply.status(400).send({ error: "Invalid or expired state token" });
    }

    try {
      const connector = new SalesforceConnector(creds);
      const tokens = await connector.exchangeCode(code, creds._pkceVerifier);

      const { _oauthState: _state, _pkceVerifier: _verifier, ...cleanCreds } = creds;
      void _state; void _verifier;

      db.update(connectorConfigs)
        .set({
          configJson: JSON.stringify(cleanCreds),
          status: "connected",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          instanceUrl: tokens.instanceUrl,
          connectedUser: tokens.connectedUser ?? null,
          connectedAt: tokens.connectedAt ?? now(),
          updatedAt: now(),
        })
        .where(eq(connectorConfigs.type, "salesforce"))
        .run();

      logger.info({ user: tokens.connectedUser, instance: tokens.instanceUrl }, "Salesforce OAuth connected");
      return reply.redirect(`${frontendUrl}/connections?sf=connected`);
    } catch (err) {
      logger.error({ error: err }, "Salesforce OAuth callback failed");
      const msg = err instanceof Error ? err.message : "Unknown error";
      return reply.redirect(`${frontendUrl}/connections?sf=error&reason=${encodeURIComponent(msg)}`);
    }
  });

  // ── Legacy connector routes (backward compat) ─────────────────────────────

  app.get("/api/connectors", async (_request, reply) => {
    return reply.send({ registered: registry.list(), available: Array.from(CONNECTOR_TYPES) });
  });

  app.post("/api/connectors/register", async (request, reply) => {
    const body = request.body as { name: string; config: unknown };
    try {
      const config = ConnectorConfigSchema.parse(body.config);
      await registry.register(body.name, config);
      return reply.status(201).send({ name: body.name, status: "registered" });
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "Registration failed" });
    }
  });

  app.post("/api/connectors/:name/import", async (request, reply) => {
    const { name } = request.params as { name: string };
    const query = request.body as ConnectorQuery;

    // Auto-load from DB if not in registry
    if (!registry.get(name)) {
      const db = getDb();
      const row = db.select().from(connectorConfigs).where(eq(connectorConfigs.type, name)).get();
      if (row && row.status === "connected") {
        if (name === "salesforce") {
          const creds = JSON.parse(row.configJson) as SalesforceCredentials;
          registry.registerSalesforce(creds, row.accessToken ? {
            accessToken: row.accessToken,
            refreshToken: row.refreshToken ?? undefined,
            instanceUrl: row.instanceUrl ?? "",
          } : undefined);
        } else {
          const config = ConnectorConfigSchema.parse(JSON.parse(row.configJson));
          await registry.register(name, config);
        }
      }
    }

    const connector = registry.get(name);
    if (!connector) {
      return reply.status(404).send({ error: `Connector '${name}' not connected. Configure it in Connections first.` });
    }

    try {
      const requirements = await connector.fetchRequirements(query);
      const combinedText = requirements
        .map((r) => `## ${r.externalId}: ${r.title}\n\n${r.description}\n\nAcceptance Criteria:\n${(r.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n")}`)
        .join("\n\n---\n\n");

      const id = uuid();
      const ts = now();
      const db = getDb();

      db.insert(documents).values({
        id,
        name: `${name} import (${requirements.length} items)`,
        type: name,
        status: "parsing",
        rawContent: combinedText,
        createdAt: ts,
        updatedAt: ts,
      }).run();

      const extraction = await extractor.extract(combinedText);
      db.update(documents)
        .set({ status: "parsed", parsedRequirements: JSON.stringify(extraction), updatedAt: now() })
        .where(eq(documents.id, id))
        .run();

      logger.info({ connector: name, imported: requirements.length }, "Import complete");
      return reply.status(201).send({
        documentId: id,
        importedCount: requirements.length,
        extractedRequirements: extraction.requirements.length,
        extraction,
      });
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Import failed" });
    }
  });
}
