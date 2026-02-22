import type {
  AnalysisResponse,
  TestResult,
} from "@test-automation-mcp/core";

export function generateJsonReport(response: AnalysisResponse): string {
  return JSON.stringify(response, null, 2);
}

export function generateTextReport(response: AnalysisResponse): string {
  const lines: string[] = [];
  const { summary, failures, recommendations, trends } = response;

  lines.push("═".repeat(60));
  lines.push("  TEST ANALYSIS REPORT");
  lines.push("═".repeat(60));
  lines.push("");

  lines.push("SUMMARY");
  lines.push("─".repeat(40));
  lines.push(`  Status:            ${summary.overallStatus.toUpperCase()}`);
  lines.push(`  Pass Rate:         ${summary.passRate.toFixed(1)}%`);
  lines.push(`  Flakiness Score:   ${(summary.flakinessScore * 100).toFixed(0)}%`);
  lines.push(`  Critical Failures: ${summary.criticalFailures}`);
  lines.push(`  New Failures:      ${summary.newFailures}`);
  lines.push(`  Fixed Tests:       ${summary.fixedTests}`);
  lines.push("");

  if (failures.length > 0) {
    lines.push("FAILURES");
    lines.push("─".repeat(40));
    for (const failure of failures) {
      lines.push(`  [${failure.category.toUpperCase()}] ${failure.testName}`);
      lines.push(`    ID:         ${failure.testId}`);
      lines.push(`    Root Cause: ${failure.rootCause}`);
      lines.push(`    Confidence: ${(failure.confidence * 100).toFixed(0)}%`);
      if (failure.suggestedFix) {
        lines.push(`    Fix:        ${failure.suggestedFix}`);
      }
      if (failure.relatedTests?.length) {
        lines.push(`    Related:    ${failure.relatedTests.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (recommendations.length > 0) {
    lines.push("RECOMMENDATIONS");
    lines.push("─".repeat(40));
    for (let i = 0; i < recommendations.length; i++) {
      lines.push(`  ${i + 1}. ${recommendations[i]}`);
    }
    lines.push("");
  }

  if (trends && trends.length > 0) {
    lines.push("TRENDS");
    lines.push("─".repeat(40));
    lines.push(
      "  Date       | Pass Rate | Tests | Avg Duration | Flaky"
    );
    lines.push("  " + "─".repeat(56));
    for (const trend of trends) {
      const date = trend.date.padEnd(10);
      const rate = `${trend.passRate.toFixed(1)}%`.padStart(9);
      const total = String(trend.totalTests).padStart(5);
      const dur = `${trend.avgDuration}ms`.padStart(12);
      const flaky = String(trend.flakyTests).padStart(5);
      lines.push(`  ${date} | ${rate} | ${total} | ${dur} | ${flaky}`);
    }
    lines.push("");
  }

  lines.push("═".repeat(60));

  return lines.join("\n");
}

export function generateJUnitXml(results: TestResult[]): string {
  const totalTests = results.length;
  const failures = results.filter((r) => r.status === "failure").length;
  const errors = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0) / 1000;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites tests="${totalTests}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${totalDuration.toFixed(3)}">`
  );

  lines.push(
    `  <testsuite name="Test Execution" tests="${totalTests}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${totalDuration.toFixed(3)}">`
  );

  for (const result of results) {
    const duration = (result.duration / 1000).toFixed(3);
    const className = result.tags.length > 0 ? result.tags[0] : "default";

    lines.push(
      `    <testcase name="${escapeXml(result.testName)}" classname="${escapeXml(className)}" time="${duration}">`
    );

    if (result.status === "failure") {
      const message = result.error ?? "Test failed";
      const failureDetails = collectStepErrors(result);
      lines.push(
        `      <failure message="${escapeXml(message)}">${escapeXml(failureDetails)}</failure>`
      );
    } else if (result.status === "error") {
      const message = result.error ?? "Test error";
      lines.push(
        `      <error message="${escapeXml(message)}">${escapeXml(message)}</error>`
      );
    } else if (result.status === "skipped") {
      lines.push("      <skipped/>");
    }

    lines.push("    </testcase>");
  }

  lines.push("  </testsuite>");
  lines.push("</testsuites>");

  return lines.join("\n");
}

function collectStepErrors(result: TestResult): string {
  const parts: string[] = [];

  for (const step of [
    ...result.setupResults,
    ...result.stepResults,
    ...result.teardownResults,
  ]) {
    if (step.status === "failure" || step.status === "error") {
      parts.push(`Step "${step.stepName}": ${step.toolResult.error?.message ?? "failed"}`);
      for (const assertion of step.assertions) {
        if (!assertion.passed) {
          parts.push(`  Assertion: ${assertion.message ?? assertion.expression}`);
        }
      }
    }
  }

  return parts.join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
