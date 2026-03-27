import { describe, it, expect } from "vitest";
import { GeneratorAgent } from "./generator.js";
import {
  webLoginTemplate,
  sfCrudTemplate,
  sapTransactionTemplate,
  apiCrudTemplate,
  crossSystemTemplate,
  dataValidationTemplate,
} from "./templates.js";
import type {
  PlannedTestCase,
  TestGenerationRequest,
} from "@test-automation-mcp/core";

function makePlannedTest(overrides: Partial<PlannedTestCase> = {}): PlannedTestCase {
  return {
    id: "TC-001",
    name: "Test Login Flow",
    description: "End-to-end login test",
    type: "e2e",
    priority: "high",
    targetSystems: ["web"],
    estimatedDuration: 120000,
    ...overrides,
  };
}

describe("GeneratorAgent", () => {
  const agent = new GeneratorAgent();

  describe("generate()", () => {
    it("should return at least one TestDefinition for a single planned web test", async () => {
      const request: TestGenerationRequest = {
        plannedTests: [makePlannedTest()],
      };

      const response = await agent.generate(request);

      expect(response.tests.length).toBeGreaterThanOrEqual(1);
      expect(response.testData).toBeDefined();
    });

    it("should produce TestDefinitions with valid structure", async () => {
      const request: TestGenerationRequest = {
        plannedTests: [makePlannedTest()],
      };

      const response = await agent.generate(request);

      for (const def of response.tests) {
        expect(def.test.id).toBeDefined();
        expect(typeof def.test.id).toBe("string");
        expect(def.test.name).toBeDefined();
        expect(typeof def.test.name).toBe("string");
        expect(def.test.type).toBeDefined();
        expect(def.test.steps).toBeDefined();
        expect(Array.isArray(def.test.steps)).toBe(true);
        expect(def.test.steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateTestCase()", () => {
    it("should produce web/* actions for a web e2e planned test", () => {
      const planned = makePlannedTest({
        type: "e2e",
        targetSystems: ["web"],
      });

      const definition = agent.generateTestCase(planned);

      const allActions = [
        ...(definition.test.setup ?? []).map((s) => s.action),
        ...definition.test.steps.map((s) => s.action),
        ...(definition.test.teardown ?? []).map((s) => s.action),
      ];

      const hasWebActions = allActions.some((a) => a.startsWith("web.") || a.startsWith("web/"));
      expect(hasWebActions).toBe(true);
    });

    it("should produce sf/* actions for a salesforce planned test", () => {
      const planned = makePlannedTest({
        id: "TC-SF-001",
        name: "Salesforce CRUD",
        type: "integration",
        targetSystems: ["salesforce"],
      });

      const definition = agent.generateTestCase(planned);

      const allActions = [
        ...(definition.test.setup ?? []).map((s) => s.action),
        ...definition.test.steps.map((s) => s.action),
        ...(definition.test.teardown ?? []).map((s) => s.action),
      ];

      const hasSfActions = allActions.some((a) => a.startsWith("sf/"));
      expect(hasSfActions).toBe(true);
    });

    it("should include setup and teardown steps", () => {
      const planned = makePlannedTest({
        type: "e2e",
        targetSystems: ["web"],
      });

      const definition = agent.generateTestCase(planned);

      expect(definition.test.setup).toBeDefined();
      expect(definition.test.setup!.length).toBeGreaterThan(0);
      expect(definition.test.teardown).toBeDefined();
      expect(definition.test.teardown!.length).toBeGreaterThan(0);
    });

    it("should set correct priority and type from planned test", () => {
      const planned = makePlannedTest({
        type: "smoke",
        priority: "critical",
      });

      const definition = agent.generateTestCase(planned);

      expect(definition.test.priority).toBe("critical");
      expect(definition.test.type).toBe("smoke");
    });
  });

  describe("template functions", () => {
    it("webLoginTemplate should return non-empty TestStep array", () => {
      const steps = webLoginTemplate("https://example.com");
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });

    it("sfCrudTemplate should return non-empty TestStep array", () => {
      const steps = sfCrudTemplate("Account", { Name: "Test" });
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });

    it("sapTransactionTemplate should return non-empty TestStep array", () => {
      const steps = sapTransactionTemplate("MM01", { MaterialNumber: "MAT001" });
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });

    it("apiCrudTemplate should return non-empty TestStep array", () => {
      const steps = apiCrudTemplate("/api/users", "PUT");
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });

    it("crossSystemTemplate should return non-empty TestStep array", () => {
      const steps = crossSystemTemplate("salesforce", "sap");
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });

    it("dataValidationTemplate should return non-empty TestStep array", () => {
      const steps = dataValidationTemplate("SELECT * FROM users", {
        "result.rowCount": "greater_than_0",
      });
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.name && s.action)).toBe(true);
    });
  });
});
