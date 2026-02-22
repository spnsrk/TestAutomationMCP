import { describe, it, expect } from "vitest";
import { StrategistAgent } from "./strategist.js";
import type {
  TestPlanRequest,
  PlannedTestCase,
} from "@test-automation-mcp/core";

describe("StrategistAgent", () => {
  const agent = new StrategistAgent();

  describe("analyze()", () => {
    it("should return a TestPlanResponse with at least one test case for a simple scope", async () => {
      const request: TestPlanRequest = {
        scope: "test the login page",
        targetSystems: ["web"],
      };

      const response = await agent.analyze(request);

      expect(response).toBeDefined();
      expect(response.plan).toBeDefined();
      expect(response.plan.testCases.length).toBeGreaterThanOrEqual(1);
      expect(response.plan.priority.length).toBe(response.plan.testCases.length);
      expect(response.plan.estimatedDuration).toBeGreaterThan(0);
    });

    it("should only include web-related tests when targetSystems=[\"web\"]", async () => {
      const request: TestPlanRequest = {
        scope: "test the login page",
        targetSystems: ["web"],
      };

      const response = await agent.analyze(request);

      for (const tc of response.plan.testCases) {
        const hasWebTarget = tc.targetSystems.includes("web");
        expect(hasWebTarget).toBe(true);
      }
    });

    it("should include cross-system tests when targetSystems=[\"salesforce\", \"sap\"]", async () => {
      const request: TestPlanRequest = {
        scope: "cross-system integration sync between salesforce and sap",
        targetSystems: ["salesforce", "sap"],
      };

      const response = await agent.analyze(request);

      const crossSystemTests = response.plan.testCases.filter(
        (tc) => tc.targetSystems.length > 1
      );
      expect(crossSystemTests.length).toBeGreaterThanOrEqual(1);

      const hasSfTests = response.plan.testCases.some((tc) =>
        tc.targetSystems.includes("salesforce")
      );
      const hasSapTests = response.plan.testCases.some((tc) =>
        tc.targetSystems.includes("sap")
      );
      expect(hasSfTests).toBe(true);
      expect(hasSapTests).toBe(true);
    });

    it("should detect web tests needed from changedFiles with .tsx extension", async () => {
      const request: TestPlanRequest = {
        scope: "verify login page changes",
        targetSystems: ["web"],
        changedFiles: ["src/pages/Login.tsx"],
      };

      const response = await agent.analyze(request);

      const webTests = response.plan.testCases.filter((tc) =>
        tc.targetSystems.includes("web")
      );
      expect(webTests.length).toBeGreaterThanOrEqual(1);

      const hasRegressionSweep = response.plan.testCases.some(
        (tc) => tc.type === "regression" && tc.name.includes("Regression sweep")
      );
      expect(hasRegressionSweep).toBe(true);
    });

    it("should detect salesforce tests from changedFiles with .trigger extension", async () => {
      const request: TestPlanRequest = {
        scope: "verify account trigger changes",
        targetSystems: ["salesforce"],
        changedFiles: [
          "force-app/main/triggers/AccountTrigger.trigger",
        ],
      };

      const response = await agent.analyze(request);

      const sfTests = response.plan.testCases.filter((tc) =>
        tc.targetSystems.includes("salesforce")
      );
      expect(sfTests.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("prioritize()", () => {
    it("should sort tests by priority: critical before low", () => {
      const tests: PlannedTestCase[] = [
        {
          id: "TC-001",
          name: "Low priority test",
          description: "Low",
          type: "ui",
          priority: "low",
          targetSystems: ["web"],
          estimatedDuration: 60000,
        },
        {
          id: "TC-002",
          name: "Critical priority test",
          description: "Critical",
          type: "smoke",
          priority: "critical",
          targetSystems: ["web"],
          estimatedDuration: 30000,
        },
        {
          id: "TC-003",
          name: "Medium priority test",
          description: "Medium",
          type: "api",
          priority: "medium",
          targetSystems: ["api"],
          estimatedDuration: 30000,
        },
      ];

      const sorted = agent.prioritize(tests);

      expect(sorted[0].priority).toBe("critical");
      const criticalIdx = sorted.findIndex((t) => t.priority === "critical");
      const lowIdx = sorted.findIndex((t) => t.priority === "low");
      expect(criticalIdx).toBeLessThan(lowIdx);
    });
  });

  describe("detectCoverageGaps()", () => {
    it("should find gaps when no tests exist for a target system", () => {
      const tests: PlannedTestCase[] = [];
      const targetSystems = ["web", "salesforce"];

      const gaps = agent.detectCoverageGaps(tests, targetSystems);

      expect(gaps.length).toBeGreaterThan(0);

      const webGaps = gaps.filter((g) => g.system === "web");
      const sfGaps = gaps.filter((g) => g.system === "salesforce");
      expect(webGaps.length).toBeGreaterThan(0);
      expect(sfGaps.length).toBeGreaterThan(0);

      for (const gap of gaps) {
        expect(gap.currentCoverage).toBe(0);
        expect(gap.targetCoverage).toBe(80);
      }
    });

    it("should report fewer gaps when some areas are covered", () => {
      const tests: PlannedTestCase[] = [
        {
          id: "TC-001",
          name: "Web E2E",
          description: "e2e test",
          type: "e2e",
          priority: "high",
          targetSystems: ["web"],
          estimatedDuration: 120000,
        },
        {
          id: "TC-002",
          name: "Web UI",
          description: "ui test",
          type: "ui",
          priority: "medium",
          targetSystems: ["web"],
          estimatedDuration: 60000,
        },
        {
          id: "TC-003",
          name: "Web Smoke",
          description: "smoke test",
          type: "smoke",
          priority: "critical",
          targetSystems: ["web"],
          estimatedDuration: 30000,
        },
      ];

      const allGaps = agent.detectCoverageGaps([], ["web"]);
      const partialGaps = agent.detectCoverageGaps(tests, ["web"]);
      expect(partialGaps.length).toBeLessThan(allGaps.length);
    });
  });
});
