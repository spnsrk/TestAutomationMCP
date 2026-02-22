import { parse as parseYaml } from "yaml";
import { TestDefinitionSchema, TestSuiteSchema } from "../types/test-definition.js";
import type { TestDefinition, TestSuite } from "../types/test-definition.js";
import { TestDefinitionError } from "../utils/errors.js";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export async function loadTestDefinition(filePath: string): Promise<TestDefinition> {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".yaml" && ext !== ".yml" && ext !== ".json") {
    throw new TestDefinitionError(
      `Unsupported file format: ${ext}. Use .yaml, .yml, or .json`
    );
  }

  const content = await readFile(filePath, "utf-8");

  let raw: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    raw = parseYaml(content);
  } else {
    raw = JSON.parse(content);
  }

  const result = TestDefinitionSchema.safeParse(raw);
  if (!result.success) {
    throw new TestDefinitionError(
      `Invalid test definition in ${filePath}: ${result.error.message}`,
      result.error.issues
    );
  }

  return result.data;
}

export async function loadTestSuite(filePath: string): Promise<TestSuite> {
  const ext = extname(filePath).toLowerCase();
  if (ext !== ".yaml" && ext !== ".yml" && ext !== ".json") {
    throw new TestDefinitionError(
      `Unsupported file format: ${ext}. Use .yaml, .yml, or .json`
    );
  }

  const content = await readFile(filePath, "utf-8");

  let raw: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    raw = parseYaml(content);
  } else {
    raw = JSON.parse(content);
  }

  const result = TestSuiteSchema.safeParse(raw);
  if (!result.success) {
    throw new TestDefinitionError(
      `Invalid test suite in ${filePath}: ${result.error.message}`,
      result.error.issues
    );
  }

  return result.data;
}

export function validateTestDefinition(data: unknown): TestDefinition {
  const result = TestDefinitionSchema.safeParse(data);
  if (!result.success) {
    throw new TestDefinitionError(
      `Invalid test definition: ${result.error.message}`,
      result.error.issues
    );
  }
  return result.data;
}

export function validateTestSuite(data: unknown): TestSuite {
  const result = TestSuiteSchema.safeParse(data);
  if (!result.success) {
    throw new TestDefinitionError(
      `Invalid test suite: ${result.error.message}`,
      result.error.issues
    );
  }
  return result.data;
}
