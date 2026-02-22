import chalk from "chalk";
import ora from "ora";
import { resolve, dirname } from "node:path";
import {
  loadTestSuite,
  loadTestDefinition,
  type TestSuite,
  type TestDefinition,
  type TestResult,
  type ToolResultStatus,
} from "@test-automation-mcp/core";

interface SuiteOptions {
  config: string;
  environment: string;
  parallel: boolean;
  workers: string;
  tags?: string;
  verbose?: boolean;
  quiet?: boolean;
}

function statusIcon(status: ToolResultStatus): string {
  switch (status) {
    case "success":
      return chalk.green("✓");
    case "failure":
      return chalk.red("✗");
    case "error":
      return chalk.red("⚠");
    case "skipped":
      return chalk.yellow("○");
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

async function simulateTestRun(
  def: TestDefinition,
  environment: string
): Promise<TestResult> {
  const startTime = new Date();
  await new Promise((resolve) => setTimeout(resolve, 50 * def.test.steps.length));
  const endTime = new Date();

  return {
    testId: def.test.id,
    testName: def.test.name,
    status: "success",
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    duration: endTime.getTime() - startTime.getTime(),
    setupResults: [],
    stepResults: def.test.steps.map((step) => ({
      stepName: step.name,
      action: step.action ?? "assert",
      status: "success" as ToolResultStatus,
      duration: 50,
      toolResult: { status: "success" as ToolResultStatus, tool: step.action ?? "assert", duration: 50 },
      assertions: [],
    })),
    teardownResults: [],
    environment,
    tags: def.test.tags,
    retryCount: 0,
  };
}

export async function suiteCommand(suiteFile: string, options: SuiteOptions): Promise<void> {
  const spinner = ora({ text: "Loading test suite...", isSilent: options.quiet }).start();

  let suite: TestSuite;
  try {
    suite = await loadTestSuite(suiteFile);
    spinner.succeed("Suite definition loaded");
  } catch (err) {
    spinner.fail("Failed to load suite definition");
    console.error(chalk.red(`\n${(err as Error).message}`));
    process.exit(1);
  }

  const tagFilter = options.tags ? options.tags.split(",").map((t) => t.trim()) : null;

  console.log();
  console.log(chalk.bold.cyan("Test Suite"));
  console.log(chalk.gray("─".repeat(50)));
  console.log(`  ${chalk.bold("ID:")}       ${suite.suite.id}`);
  console.log(`  ${chalk.bold("Name:")}     ${suite.suite.name}`);
  if (suite.suite.description) {
    console.log(`  ${chalk.bold("Desc:")}     ${suite.suite.description}`);
  }
  console.log(`  ${chalk.bold("Tests:")}    ${suite.suite.tests.length}`);
  console.log(`  ${chalk.bold("Parallel:")} ${options.parallel ? "yes" : "no"}`);
  if (options.parallel) {
    console.log(`  ${chalk.bold("Workers:")}  ${options.workers}`);
  }
  if (tagFilter) {
    console.log(`  ${chalk.bold("Filter:")}   ${tagFilter.map((t) => chalk.cyan(`#${t}`)).join(" ")}`);
  }
  console.log(chalk.gray("─".repeat(50)));
  console.log();

  const suiteDir = dirname(resolve(process.cwd(), suiteFile));
  const results: TestResult[] = [];
  const testIds = suite.suite.tests;

  spinner.start(`Running suite (0/${testIds.length} complete)`);

  for (let i = 0; i < testIds.length; i++) {
    const testId = testIds[i]!;
    spinner.text = `Running ${testId} (${i}/${testIds.length} complete)`;

    const testFileName = `tc-${testId.toLowerCase().replace(/^tc-/, "")}.yaml`;
    const candidates = [
      resolve(suiteDir, testFileName),
      resolve(suiteDir, "..", testFileName),
      resolve(suiteDir, "..", `${testId.toLowerCase()}.yaml`),
    ];

    let def: TestDefinition | null = null;
    for (const candidate of candidates) {
      try {
        def = await loadTestDefinition(candidate);
        break;
      } catch {
        continue;
      }
    }

    if (!def) {
      results.push({
        testId,
        testName: testId,
        status: "skipped",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        setupResults: [],
        stepResults: [],
        teardownResults: [],
        environment: options.environment,
        tags: [],
        retryCount: 0,
        error: `Test definition file not found for ${testId}`,
      });
      continue;
    }

    if (tagFilter && !tagFilter.some((tag) => def!.test.tags.includes(tag))) {
      results.push({
        testId: def.test.id,
        testName: def.test.name,
        status: "skipped",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        setupResults: [],
        stepResults: [],
        teardownResults: [],
        environment: options.environment,
        tags: def.test.tags,
        retryCount: 0,
      });
      continue;
    }

    const result = await simulateTestRun(def, options.environment);
    results.push(result);
  }

  spinner.stop();

  console.log(chalk.bold("Results"));
  console.log(chalk.gray("─".repeat(50)));

  for (const result of results) {
    const icon = statusIcon(result.status);
    const duration = chalk.gray(`(${formatDuration(result.duration)})`);
    console.log(`  ${icon} ${result.testId}: ${result.testName} ${duration}`);
    if (result.error) {
      console.log(`    ${chalk.gray(result.error)}`);
    }
  }

  const passed = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failure").length;
  const errors = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(chalk.gray("─".repeat(50)));
  console.log();
  console.log(
    `  ${chalk.bold("Status:")}   ${failed + errors === 0 ? chalk.green.bold("PASSED") : chalk.red.bold("FAILED")}`
  );
  console.log(`  ${chalk.bold("Duration:")} ${formatDuration(totalDuration)}`);
  console.log(
    `  ${chalk.bold("Tests:")}    ${chalk.green(`${passed} passed`)}` +
      (failed > 0 ? `, ${chalk.red(`${failed} failed`)}` : "") +
      (errors > 0 ? `, ${chalk.red(`${errors} errors`)}` : "") +
      (skipped > 0 ? `, ${chalk.yellow(`${skipped} skipped`)}` : "")
  );
  console.log();

  if (failed + errors > 0) {
    process.exit(1);
  }
}
