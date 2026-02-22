import chalk from "chalk";
import { readFile } from "node:fs/promises";
import type { TestResult, SuiteResult, ToolResultStatus } from "@test-automation-mcp/core";

interface ReportOptions {
  config: string;
  format: "json" | "text" | "junit";
  verbose?: boolean;
  quiet?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
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

function renderTextReport(data: SuiteResult): void {
  console.log();
  console.log(chalk.bold.cyan("Test Report"));
  console.log(chalk.gray("═".repeat(60)));
  console.log(`  ${chalk.bold("Suite:")}    ${data.suiteName} (${data.suiteId})`);
  console.log(`  ${chalk.bold("Status:")}   ${data.status === "success" ? chalk.green.bold("PASSED") : chalk.red.bold("FAILED")}`);
  console.log(`  ${chalk.bold("Duration:")} ${formatDuration(data.duration)}`);
  console.log(`  ${chalk.bold("Started:")}  ${data.startTime}`);
  console.log(`  ${chalk.bold("Ended:")}    ${data.endTime}`);
  console.log(chalk.gray("─".repeat(60)));
  console.log();

  console.log(chalk.bold("  Test Results"));
  console.log();

  for (const result of data.testResults) {
    const icon = statusIcon(result.status);
    const dur = chalk.gray(`(${formatDuration(result.duration)})`);
    console.log(`  ${icon} ${result.testId}: ${result.testName} ${dur}`);

    if (result.stepResults.length > 0) {
      for (const step of result.stepResults) {
        const stepIcon = statusIcon(step.status);
        console.log(`    ${stepIcon} ${step.stepName}`);
      }
    }

    if (result.error) {
      console.log(`    ${chalk.red(result.error)}`);
    }
  }

  console.log();
  console.log(chalk.gray("─".repeat(60)));
  console.log(chalk.bold("  Summary"));
  console.log(`    Total:   ${data.summary.total}`);
  console.log(`    Passed:  ${chalk.green(String(data.summary.passed))}`);
  console.log(`    Failed:  ${chalk.red(String(data.summary.failed))}`);
  console.log(`    Errors:  ${chalk.red(String(data.summary.errors))}`);
  console.log(`    Skipped: ${chalk.yellow(String(data.summary.skipped))}`);
  console.log(`    Pass Rate: ${data.summary.passRate >= 80 ? chalk.green(`${data.summary.passRate.toFixed(1)}%`) : chalk.red(`${data.summary.passRate.toFixed(1)}%`)}`);
  console.log(chalk.gray("═".repeat(60)));
  console.log();
}

function renderJsonReport(data: SuiteResult): void {
  console.log(JSON.stringify(data, null, 2));
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderJunitReport(data: SuiteResult): void {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="${escapeXml(data.suiteName)}" tests="${data.summary.total}" failures="${data.summary.failed}" errors="${data.summary.errors}" skipped="${data.summary.skipped}" time="${(data.duration / 1000).toFixed(3)}">`
  );

  lines.push(
    `  <testsuite name="${escapeXml(data.suiteName)}" tests="${data.summary.total}" failures="${data.summary.failed}" errors="${data.summary.errors}" skipped="${data.summary.skipped}" time="${(data.duration / 1000).toFixed(3)}">`
  );

  for (const result of data.testResults) {
    const time = (result.duration / 1000).toFixed(3);
    lines.push(
      `    <testcase name="${escapeXml(result.testName)}" classname="${escapeXml(result.testId)}" time="${time}">`
    );

    if (result.status === "failure") {
      const message = result.error ?? "Test failed";
      lines.push(`      <failure message="${escapeXml(message)}">${escapeXml(message)}</failure>`);
    } else if (result.status === "error") {
      const message = result.error ?? "Test error";
      lines.push(`      <error message="${escapeXml(message)}">${escapeXml(message)}</error>`);
    } else if (result.status === "skipped") {
      lines.push("      <skipped/>");
    }

    lines.push("    </testcase>");
  }

  lines.push("  </testsuite>");
  lines.push("</testsuites>");

  console.log(lines.join("\n"));
}

export async function reportCommand(resultsFile: string, options: ReportOptions): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(resultsFile, "utf-8");
  } catch {
    console.error(chalk.red(`Cannot read results file: ${resultsFile}`));
    process.exit(1);
  }

  let data: SuiteResult;
  try {
    data = JSON.parse(raw) as SuiteResult;
  } catch {
    console.error(chalk.red("Invalid JSON in results file."));
    process.exit(1);
  }

  switch (options.format) {
    case "json":
      renderJsonReport(data);
      break;
    case "junit":
      renderJunitReport(data);
      break;
    case "text":
    default:
      renderTextReport(data);
      break;
  }
}
