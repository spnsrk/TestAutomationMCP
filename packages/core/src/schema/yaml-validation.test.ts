import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { TestDefinitionSchema, TestSuiteSchema } from "../types/test-definition.js";

const projectRoot = resolve(import.meta.dirname ?? process.cwd(), "../../../..");

const yamlDirs = [
  join(projectRoot, "tests", "suites"),
  join(projectRoot, "tests", "cross-system"),
];

async function collectYamlFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const dir of yamlDirs) {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
        files.push(join(dir, entry));
      }
    }
  }
  return files.sort();
}

describe("YAML test definition validation", () => {
  let yamlFiles: string[] = [];

  it("should find YAML files in the test directories", async () => {
    yamlFiles = await collectYamlFiles();
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  it("should validate every YAML file as either a TestDefinition or TestSuite", async () => {
    yamlFiles = await collectYamlFiles();

    const results: Array<{
      file: string;
      kind: "test" | "suite" | "unknown";
      valid: boolean;
      errors?: string;
    }> = [];

    for (const filePath of yamlFiles) {
      const content = await readFile(filePath, "utf-8");
      const raw = parseYaml(content) as Record<string, unknown>;
      const fileName = filePath.replace(projectRoot + "/", "");

      if ("suite" in raw) {
        const parsed = TestSuiteSchema.safeParse(raw);
        results.push({
          file: fileName,
          kind: "suite",
          valid: parsed.success,
          errors: parsed.success ? undefined : parsed.error.message,
        });
      } else if ("test" in raw) {
        const parsed = TestDefinitionSchema.safeParse(raw);
        results.push({
          file: fileName,
          kind: "test",
          valid: parsed.success,
          errors: parsed.success ? undefined : parsed.error.message,
        });
      } else {
        results.push({ file: fileName, kind: "unknown", valid: false, errors: "No 'test' or 'suite' top-level key" });
      }
    }

    const suites = results.filter((r) => r.kind === "suite");
    const tests = results.filter((r) => r.kind === "test");

    expect(suites.length).toBeGreaterThan(0);
    expect(tests.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r.valid, `${r.file} (${r.kind}) failed validation: ${r.errors ?? ""}`).toBe(true);
    }
  });
});
