import { describe, it, expect } from "vitest";
import {
  TestDefinitionSchema,
  TestSuiteSchema,
  TestStepSchema,
  TestPrioritySchema,
  TestTypeSchema,
} from "./test-definition.js";

describe("TestPrioritySchema", () => {
  it("should accept valid priorities", () => {
    expect(TestPrioritySchema.parse("critical")).toBe("critical");
    expect(TestPrioritySchema.parse("high")).toBe("high");
    expect(TestPrioritySchema.parse("medium")).toBe("medium");
    expect(TestPrioritySchema.parse("low")).toBe("low");
  });

  it("should reject invalid priority", () => {
    expect(() => TestPrioritySchema.parse("urgent")).toThrow();
  });
});

describe("TestTypeSchema", () => {
  it("should accept all valid types", () => {
    const types = [
      "e2e",
      "integration",
      "api",
      "ui",
      "data-validation",
      "performance",
      "regression",
      "smoke",
    ];
    for (const t of types) {
      expect(TestTypeSchema.parse(t)).toBe(t);
    }
  });

  it("should reject invalid type", () => {
    expect(() => TestTypeSchema.parse("unit")).toThrow();
  });
});

describe("TestStepSchema", () => {
  it("should parse minimal step", () => {
    const result = TestStepSchema.parse({
      name: "Navigate",
      action: "web/navigate",
    });
    expect(result.name).toBe("Navigate");
    expect(result.action).toBe("web/navigate");
  });

  it("should parse step with all fields", () => {
    const step = {
      name: "Fill form",
      action: "web/fill",
      description: "Fill the login form",
      params: { timeout: 5000 },
      selector: "#email",
      value: "test@example.com",
      save_as: "formResult",
      assert: [{ visible: true }],
      timeout: 10000,
      retries: 2,
      continueOnFailure: true,
    };
    const result = TestStepSchema.parse(step);
    expect(result.selector).toBe("#email");
    expect(result.save_as).toBe("formResult");
    expect(result.retries).toBe(2);
    expect(result.continueOnFailure).toBe(true);
  });

  it("should reject step without name", () => {
    expect(() =>
      TestStepSchema.parse({ action: "web/click" })
    ).toThrow();
  });

  it("should accept step without action (assertion-only step)", () => {
    const step = TestStepSchema.parse({ name: "Click" });
    expect(step.name).toBe("Click");
    expect(step.action).toBeUndefined();
  });
});

describe("TestDefinitionSchema", () => {
  const validTest = {
    test: {
      id: "TC-001",
      name: "Login Test",
      type: "e2e",
      steps: [{ name: "Navigate", action: "web/navigate" }],
    },
  };

  it("should parse valid minimal test definition", () => {
    const result = TestDefinitionSchema.parse(validTest);
    expect(result.test.id).toBe("TC-001");
    expect(result.test.name).toBe("Login Test");
    expect(result.test.type).toBe("e2e");
    expect(result.test.steps).toHaveLength(1);
  });

  it("should apply defaults", () => {
    const result = TestDefinitionSchema.parse(validTest);
    expect(result.test.priority).toBe("medium");
    expect(result.test.tags).toEqual([]);
    expect(result.test.timeout).toBe(300000);
    expect(result.test.retries).toBe(0);
  });

  it("should parse full test with all fields", () => {
    const full = {
      test: {
        id: "TC-002",
        name: "Full Test",
        description: "A comprehensive test",
        type: "integration",
        priority: "critical",
        tags: ["smoke", "regression"],
        timeout: 60000,
        retries: 2,
        variables: { baseUrl: "https://example.com" },
        setup: [{ name: "Setup DB", action: "data/seed" }],
        steps: [
          { name: "Step 1", action: "web/navigate" },
          { name: "Step 2", action: "web/click" },
        ],
        teardown: [{ name: "Cleanup", action: "data/cleanup" }],
      },
    };
    const result = TestDefinitionSchema.parse(full);
    expect(result.test.priority).toBe("critical");
    expect(result.test.tags).toEqual(["smoke", "regression"]);
    expect(result.test.setup).toHaveLength(1);
    expect(result.test.steps).toHaveLength(2);
    expect(result.test.teardown).toHaveLength(1);
    expect(result.test.variables?.baseUrl).toBe("https://example.com");
  });

  it("should reject test without steps", () => {
    expect(() =>
      TestDefinitionSchema.parse({
        test: { id: "TC-X", name: "No Steps", type: "e2e", steps: [] },
      })
    ).toThrow();
  });

  it("should reject test without id", () => {
    expect(() =>
      TestDefinitionSchema.parse({
        test: {
          name: "Missing ID",
          type: "e2e",
          steps: [{ name: "S", action: "a" }],
        },
      })
    ).toThrow();
  });
});

describe("TestSuiteSchema", () => {
  it("should parse valid suite", () => {
    const result = TestSuiteSchema.parse({
      suite: {
        id: "SUITE-001",
        name: "Smoke Tests",
        tests: ["TC-001", "TC-002"],
      },
    });
    expect(result.suite.id).toBe("SUITE-001");
    expect(result.suite.tests).toEqual(["TC-001", "TC-002"]);
    expect(result.suite.parallel).toBe(false);
    expect(result.suite.maxWorkers).toBe(1);
  });

  it("should parse suite with all options", () => {
    const result = TestSuiteSchema.parse({
      suite: {
        id: "SUITE-002",
        name: "Full Regression",
        description: "Complete regression suite",
        tags: ["regression"],
        parallel: true,
        maxWorkers: 4,
        tests: ["TC-001"],
        variables: { env: "staging" },
      },
    });
    expect(result.suite.parallel).toBe(true);
    expect(result.suite.maxWorkers).toBe(4);
    expect(result.suite.tags).toEqual(["regression"]);
  });

  it("should reject suite without tests array", () => {
    expect(() =>
      TestSuiteSchema.parse({
        suite: { id: "S", name: "Bad" },
      })
    ).toThrow();
  });
});
