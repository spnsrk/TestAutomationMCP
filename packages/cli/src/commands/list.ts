import chalk from "chalk";
import { resolve, relative } from "node:path";
import { stat } from "node:fs/promises";
import { glob } from "glob";
import { loadTestDefinition, loadTestSuite } from "@test-automation-mcp/core";

interface ListOptions {
  verbose?: boolean;
  quiet?: boolean;
}

interface TestEntry {
  file: string;
  kind: "test" | "suite";
  id: string;
  name: string;
  type?: string;
  priority?: string;
  tags: string[];
}

export async function listCommand(directory: string, options: ListOptions): Promise<void> {
  const absDir = resolve(process.cwd(), directory);

  try {
    const stats = await stat(absDir);
    if (!stats.isDirectory()) {
      console.error(chalk.red(`Not a directory: ${directory}`));
      process.exit(1);
    }
  } catch {
    console.error(chalk.red(`Directory not found: ${directory}`));
    process.exit(1);
  }

  const files = await glob("**/*.{yaml,yml}", { cwd: absDir, absolute: true });

  if (files.length === 0) {
    console.log(chalk.yellow("No YAML files found."));
    return;
  }

  const entries: TestEntry[] = [];

  for (const file of files.sort()) {
    const relPath = relative(process.cwd(), file);
    try {
      const def = await loadTestDefinition(file);
      entries.push({
        file: relPath,
        kind: "test",
        id: def.test.id,
        name: def.test.name,
        type: def.test.type,
        priority: def.test.priority,
        tags: def.test.tags,
      });
      continue;
    } catch {
      // not a test definition
    }

    try {
      const suite = await loadTestSuite(file);
      entries.push({
        file: relPath,
        kind: "suite",
        id: suite.suite.id,
        name: suite.suite.name,
        tags: suite.suite.tags,
      });
    } catch {
      // skip non-test YAML files
    }
  }

  if (entries.length === 0) {
    console.log(chalk.yellow("No valid test definitions or suites found."));
    return;
  }

  const tests = entries.filter((e) => e.kind === "test");
  const suites = entries.filter((e) => e.kind === "suite");

  console.log();
  console.log(chalk.bold.cyan(`Found ${entries.length} definition(s) in ${directory}`));
  console.log(chalk.gray("─".repeat(70)));

  if (tests.length > 0) {
    console.log();
    console.log(chalk.bold(`  Tests (${tests.length})`));
    console.log();

    const idWidth = Math.max(4, ...tests.map((t) => t.id.length)) + 2;
    const nameWidth = Math.max(4, ...tests.map((t) => t.name.length)) + 2;

    console.log(
      `  ${chalk.gray("ID".padEnd(idWidth))}${chalk.gray("Name".padEnd(nameWidth))}${chalk.gray("Type".padEnd(14))}${chalk.gray("Priority".padEnd(12))}${chalk.gray("Tags")}`
    );
    console.log(`  ${chalk.gray("─".repeat(idWidth + nameWidth + 14 + 12 + 20))}`);

    for (const t of tests) {
      const tags = t.tags.map((tag) => chalk.cyan(`#${tag}`)).join(" ");
      console.log(
        `  ${t.id.padEnd(idWidth)}${t.name.padEnd(nameWidth)}${(t.type ?? "").padEnd(14)}${(t.priority ?? "").padEnd(12)}${tags}`
      );
    }
  }

  if (suites.length > 0) {
    console.log();
    console.log(chalk.bold(`  Suites (${suites.length})`));
    console.log();

    const idWidth = Math.max(4, ...suites.map((s) => s.id.length)) + 2;
    const nameWidth = Math.max(4, ...suites.map((s) => s.name.length)) + 2;

    console.log(
      `  ${chalk.gray("ID".padEnd(idWidth))}${chalk.gray("Name".padEnd(nameWidth))}${chalk.gray("Tags")}`
    );
    console.log(`  ${chalk.gray("─".repeat(idWidth + nameWidth + 20))}`);

    for (const s of suites) {
      const tags = s.tags.map((tag) => chalk.cyan(`#${tag}`)).join(" ");
      console.log(`  ${s.id.padEnd(idWidth)}${s.name.padEnd(nameWidth)}${tags}`);
    }
  }

  console.log();
}
