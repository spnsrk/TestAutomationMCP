import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { ConnectorRegistry, ConnectorConfigSchema } from "@test-automation-mcp/connectors";
import type { ConnectorQuery } from "@test-automation-mcp/connectors";
import { getDb } from "../db/connection.js";
import { documents } from "../db/schema.js";
import type { RequirementExtractor } from "../services/requirement-extractor.js";
import { eq } from "drizzle-orm";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-connectors");

export function registerConnectorRoutes(
  app: FastifyInstance,
  extractor: RequirementExtractor
): void {
  const registry = new ConnectorRegistry();

  app.get("/api/connectors", async (_request, reply) => {
    return reply.send({
      registered: registry.list(),
      available: registry.listAvailable(),
    });
  });

  app.post("/api/connectors/register", async (request, reply) => {
    const body = request.body as { name: string; config: unknown };
    try {
      const config = ConnectorConfigSchema.parse(body.config);
      await registry.register(body.name, config);
      return reply.status(201).send({ name: body.name, status: "registered" });
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Registration failed",
      });
    }
  });

  app.post("/api/connectors/:name/import", async (request, reply) => {
    const { name } = request.params as { name: string };
    const query = request.body as ConnectorQuery;

    const connector = registry.get(name);
    if (!connector) {
      return reply.status(404).send({ error: `Connector '${name}' not registered` });
    }

    try {
      const requirements = await registry.fetchRequirements(name, query);

      const combinedText = requirements
        .map((r) => `## ${r.externalId}: ${r.title}\n\n${r.description}\n\nAcceptance Criteria:\n${(r.acceptanceCriteria ?? []).map((c) => `- ${c}`).join("\n")}`)
        .join("\n\n---\n\n");

      const id = uuid();
      const now = new Date().toISOString();
      const db = getDb();

      db.insert(documents).values({
        id,
        name: `${name} import (${requirements.length} items)`,
        type: name,
        status: "parsing",
        rawContent: combinedText,
        createdAt: now,
        updatedAt: now,
      }).run();

      const extraction = await extractor.extract(combinedText);

      db.update(documents)
        .set({
          status: "parsed",
          parsedRequirements: JSON.stringify(extraction),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documents.id, id))
        .run();

      logger.info({
        connector: name,
        imported: requirements.length,
        extracted: extraction.requirements.length,
      }, "Import complete");

      return reply.status(201).send({
        documentId: id,
        importedCount: requirements.length,
        extractedRequirements: extraction.requirements.length,
        extraction,
      });
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  });
}
