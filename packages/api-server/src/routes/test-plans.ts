import type { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { getDb } from "../db/connection.js";
import { documents, testPlans, testDefinitions } from "../db/schema.js";
import { StrategistAgent } from "@test-automation-mcp/agent-strategist";
import { GeneratorAgent } from "@test-automation-mcp/agent-generator";
import type { StructuredRequirement } from "../services/requirement-extractor.js";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("api-test-plans");

export function registerTestPlanRoutes(app: FastifyInstance): void {
  app.post("/api/test-plans", async (request, reply) => {
    const body = request.body as { documentId?: string; requirements?: StructuredRequirement[] };

    let requirements: StructuredRequirement[] | undefined = body.requirements;
    let documentId: string | undefined = body.documentId;

    if (documentId && !requirements) {
      const db = getDb();
      const doc = db.select().from(documents).where(eq(documents.id, documentId)).get();
      if (!doc) {
        return reply.status(404).send({ error: "Document not found" });
      }
      if (!doc.parsedRequirements) {
        return reply.status(400).send({ error: "Document has not been parsed yet" });
      }
      const parsed = JSON.parse(doc.parsedRequirements);
      requirements = parsed.requirements;
    }

    if (!requirements || requirements.length === 0) {
      return reply.status(400).send({ error: "No requirements provided" });
    }

    const scope = requirements.map((r) => r.title).join(", ");
    const targetSystems = [...new Set(requirements.map((r) => r.targetSystem))];
    const reqDescriptions = requirements.map((r) => r.description);

    const strategist = new StrategistAgent();
    const planResponse = await strategist.analyze({
      scope,
      requirements: reqDescriptions,
      targetSystems: targetSystems as ("web" | "salesforce" | "sap" | "api" | "data")[],
    });

    const id = uuid();
    const now = new Date().toISOString();
    const db = getDb();

    db.insert(testPlans).values({
      id,
      documentId: documentId ?? null,
      status: "draft",
      planJson: JSON.stringify(planResponse),
      requirementsJson: JSON.stringify(requirements),
      createdAt: now,
      updatedAt: now,
    }).run();

    logger.info({ id, testCases: planResponse.plan.testCases.length }, "Test plan created");

    return reply.status(201).send({
      id,
      status: "draft",
      plan: planResponse.plan,
      requirementCount: requirements.length,
    });
  });

  app.get("/api/test-plans", async (_request, reply) => {
    const db = getDb();
    const rows = db.select({
      id: testPlans.id,
      documentId: testPlans.documentId,
      status: testPlans.status,
      createdAt: testPlans.createdAt,
      updatedAt: testPlans.updatedAt,
    }).from(testPlans).all();
    return reply.send({ testPlans: rows });
  });

  app.get("/api/test-plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const row = db.select().from(testPlans).where(eq(testPlans.id, id)).get();
    if (!row) {
      return reply.status(404).send({ error: "Test plan not found" });
    }
    return reply.send({
      ...row,
      planJson: JSON.parse(row.planJson),
      requirementsJson: row.requirementsJson ? JSON.parse(row.requirementsJson) : null,
    });
  });

  app.post("/api/test-plans/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const row = db.select().from(testPlans).where(eq(testPlans.id, id)).get();
    if (!row) {
      return reply.status(404).send({ error: "Test plan not found" });
    }
    db.update(testPlans)
      .set({ status: "approved", updatedAt: new Date().toISOString() })
      .where(eq(testPlans.id, id))
      .run();
    return reply.send({ id, status: "approved" });
  });

  app.post("/api/test-plans/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    db.update(testPlans)
      .set({ status: "rejected", updatedAt: new Date().toISOString() })
      .where(eq(testPlans.id, id))
      .run();
    return reply.send({ id, status: "rejected" });
  });

  app.post("/api/test-plans/:id/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const row = db.select().from(testPlans).where(eq(testPlans.id, id)).get();
    if (!row) {
      return reply.status(404).send({ error: "Test plan not found" });
    }

    const plan = JSON.parse(row.planJson);
    const generator = new GeneratorAgent();

    const genResponse = await generator.generate({
      plannedTests: plan.plan.testCases,
    });

    const now = new Date().toISOString();
    const created: Array<{ id: string; name: string }> = [];

    for (const testDef of genResponse.tests) {
      const defId = uuid();
      db.insert(testDefinitions).values({
        id: defId,
        testPlanId: id,
        name: testDef.test.name,
        definitionYaml: JSON.stringify(testDef, null, 2),
        definitionJson: JSON.stringify(testDef),
        createdAt: now,
      }).run();
      created.push({ id: defId, name: testDef.test.name });
    }

    logger.info({ planId: id, generated: created.length }, "Tests generated");

    return reply.status(201).send({
      testPlanId: id,
      generated: created,
      warnings: genResponse.warnings,
    });
  });
}
