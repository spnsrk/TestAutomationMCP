import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { documents } from "../db/schema.js";
import { parseDocument } from "../services/document-parser.js";
import type { RequirementExtractor } from "../services/requirement-extractor.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-documents");

export function registerDocumentRoutes(
  app: FastifyInstance,
  extractor: RequirementExtractor
): void {
  app.post("/api/documents/upload", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file uploaded" });
    }

    const buffer = await data.toBuffer();
    const id = uuid();
    const now = new Date().toISOString();
    const db = getDb();

    db.insert(documents).values({
      id,
      name: data.filename,
      type: data.filename.split(".").pop() ?? "unknown",
      status: "parsing",
      createdAt: now,
      updatedAt: now,
    }).run();

    try {
      const parsed = await parseDocument(buffer, data.filename, data.mimetype);

      db.update(documents)
        .set({ rawContent: parsed.text, updatedAt: new Date().toISOString() })
        .where(eq(documents.id, id))
        .run();

      const extraction = await extractor.extract(parsed.text);

      db.update(documents)
        .set({
          status: "parsed",
          parsedRequirements: JSON.stringify(extraction),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documents.id, id))
        .run();

      logger.info({ id, filename: data.filename, requirements: extraction.requirements.length }, "Document processed");

      return reply.status(201).send({
        id,
        name: data.filename,
        status: "parsed",
        metadata: parsed.metadata,
        extraction,
      });
    } catch (err) {
      db.update(documents)
        .set({
          status: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documents.id, id))
        .run();

      return reply.status(500).send({
        error: "Document processing failed",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/documents/text", async (request, reply) => {
    const body = request.body as { text?: string; title?: string };
    if (!body.text || body.text.trim().length === 0) {
      return reply.status(400).send({ error: "No text provided" });
    }

    const id = uuid();
    const now = new Date().toISOString();
    const db = getDb();
    const title = body.title || "Pasted Requirements";

    db.insert(documents).values({
      id,
      name: title,
      type: "text",
      status: "parsing",
      rawContent: body.text,
      createdAt: now,
      updatedAt: now,
    }).run();

    try {
      const extraction = await extractor.extract(body.text);

      db.update(documents)
        .set({
          status: "parsed",
          parsedRequirements: JSON.stringify(extraction),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documents.id, id))
        .run();

      return reply.status(201).send({
        id,
        name: title,
        status: "parsed",
        extraction,
      });
    } catch (err) {
      db.update(documents)
        .set({
          status: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(documents.id, id))
        .run();

      return reply.status(500).send({ error: "Extraction failed" });
    }
  });

  app.get("/api/documents", async (_request, reply) => {
    const db = getDb();
    const rows = db.select({
      id: documents.id,
      name: documents.name,
      type: documents.type,
      status: documents.status,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    }).from(documents).all();
    return reply.send({ documents: rows });
  });

  app.get("/api/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const row = db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row) {
      return reply.status(404).send({ error: "Document not found" });
    }
    return reply.send({
      ...row,
      parsedRequirements: row.parsedRequirements ? JSON.parse(row.parsedRequirements) : null,
    });
  });
}
