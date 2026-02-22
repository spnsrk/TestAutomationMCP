import chalk from "chalk";
import { stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { glob } from "glob";
import { loadTestDefinition, loadTestSuite } from "@test-automation-mcp/core";

interface ValidateOptions {
  verbose?: boolean;
  quiet?: boolean;
}

interface ValidationResult {
  file: string;
  valid: boolean;
  kind: "test" | "suite" | "unknown";
  id?: string;
  name?: string;
  error?: string;
}

async function validateFile(filePath: string): Promise<ValidationResult> {
  const relPath = relative(process.cwd(), filePath);

  try {
    const def = await loadTestDefinition(filePath);
    return {
      file: relPath,
      valid: true,
      kind: "test",
      id: def.test.id,
      name: def.test.name,
    };
  } catch {
    // Not a valid test definition — try as suite
  }

  try {
    const suite = await loadTestSuite(filePath);
    return {
      file: relPath,
      valid: true,
      kind: "suite",
      id: suite.suite.id,
      name: suite.suite.name,
    };
  } catch {
    // Not a valid suite either
  }

  try {
    await loadTestDefinition(filePath);
    return { file: relPath, valid: true, kind: "unknown" };
  } catch (err) {
    return {
      file: relPath,
      valid: false,
      kind: "unknown",
      error: (err as Error).message,
    };
  }
}

export async function validateCommand(targetPath: string, options: ValidateOptions): Promise<void> {
  const absPath = resolve(process.cwd(), targetPath);
  let files: string[];

  try {
    const stats = await stat(absPath);
    if (stats.isDirectory()) {
      files = await glob("**/*.{yaml,yml}", { cwd: absPath, absolute: true });
      if (files.length === 0) {
        console.log(chalk.yellow("No YAML files found in directory."));
        return;
      }
    } else {
      files = [absPath];
    }
  } catch {
    console.error(chalk.red(`Path not found: ${targetPath}`));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan(`Validating ${files.length} file(s)...`));
  console.log(chalk.gray("─".repeat(60)));

  const results: ValidationResult[] = [];

  for (const file of files.sort()) {
    const result = await validateFile(file);
    results.push(result);

    if (result.valid) {
      const kindLabel = result.kind === "test" ? chalk.blue("[test]") : chalk.magenta("[suite]");
      console.log(`  ${chalk.green("✓")} ${result.file} ${kindLabel}`);
      if (!options.quiet && result.id) {
        console.log(`    ${chalk.gray(`${result.id}: ${result.name}`)}`);
      }
    } else {
      console.log(`  ${chalk.red("✗")} ${result.file}`);
      if (result.error) {
        const errorLines = result.error.split("\n");
        for (const line of errorLines.slice(0, 5)) {
          console.log(`    ${chalk.red(line)}`);
        }
        if (errorLines.length > 5) {
          console.log(`    ${chalk.gray(`... ${errorLines.length - 5} more lines`)}`);
        }
      }
    }
  }

  const valid = results.filter((r) => r.valid).length;
  const invalid = results.filter((r) => !r.valid).length;

  console.log(chalk.gray("─".repeat(60)));
  console.log();
  console.log(
    `  ${chalk.bold("Summary:")} ${chalk.green(`${valid} valid`)}, ${invalid > 0 ? chalk.red(`${invalid} invalid`) : chalk.green(`${invalid} invalid`)}`
  );
  console.log();

  if (invalid > 0) {
    process.exit(1);
  }
}
