import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTestDefinition,
  loadTestSuite,
  validateTestDefinition,
  validateTestSuite,
} from "./test-definition.schema.js";
import { TestDefinitionError } from "../utils/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = resolve(__dirname, "../../../../tests");

describe("loadTestDefinition", () => {
  it("should load a valid YAML test definition", async () => {
    const def = await loadTestDefinition(
      resolve(TESTS_DIR, "suites/tc-web-001-login.yaml")
    );
    expect(def.test.id).toBe("TC-WEB-001");
    expect(def.test.name).toContain("Login");
    expect(def.test.type).toBe("e2e");
    expect(def.test.steps.length).toBeGreaterThan(0);
  });

  it("should throw for unsupported file format", async () => {
    await expect(loadTestDefinition("test.txt")).rejects.toThrow(
      TestDefinitionError
    );
  });

  it("should throw for non-existent file", async () => {
    await expect(
      loadTestDefinition("nonexistent.yaml")
    ).rejects.toThrow();
  });
});

describe("loadTestSuite", () => {
  it("should load a valid YAML test suite", async () => {
    const suite = await loadTestSuite(
      resolve(TESTS_DIR, "suites/smoke-web.yaml")
    );
    expect(suite.suite.id).toBe("SUITE-SMOKE-WEB");
    expect(suite.suite.tests.length).toBeGreaterThan(0);
  });
});

describe("validateTestDefinition", () => {
  it("should validate a correct definition object", () => {
    const result = validateTestDefinition({
      test: {
        id: "TC-VAL-001",
        name: "Validation Test",
        type: "smoke",
        steps: [{ name: "Step", action: "web/navigate" }],
      },
    });
    expect(result.test.id).toBe("TC-VAL-001");
  });

  it("should throw for invalid definition", () => {
    expect(() =>
      validateTestDefinition({ test: { id: "bad" } })
    ).toThrow(TestDefinitionError);
  });
});

describe("validateTestSuite", () => {
  it("should validate a correct suite object", () => {
    const result = validateTestSuite({
      suite: {
        id: "S-001",
        name: "Test Suite",
        tests: ["TC-001"],
      },
    });
    expect(result.suite.id).toBe("S-001");
  });

  it("should throw for invalid suite", () => {
    expect(() => validateTestSuite({ suite: {} })).toThrow(
      TestDefinitionError
    );
  });
});
