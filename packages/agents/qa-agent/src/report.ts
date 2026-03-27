/**
 * Structures the final QA report produced by the agent.
 */

export type TestStatus = "PASS" | "FAIL" | "SKIP" | "ERROR";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface TestCaseResult {
  name: string;
  status: TestStatus;
  durationMs?: number;
  steps?: StepRecord[];
  failureReason?: string;
  rootCause?: string;
  recommendation?: string;
  evidence?: string; // screenshot path, raw API response, etc.
}

export interface StepRecord {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  status: "success" | "error";
  durationMs: number;
}

export interface QAReport {
  id: string;
  title: string;
  source: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    passRate: number;
    riskLevel: RiskLevel;
  };
  testCases: TestCaseResult[];
  recommendations: string[];
  /** Raw final message from Claude — the full QA narrative */
  narrative: string;
}

/**
 * Parses Claude's final text response into a structured QAReport.
 * Claude is prompted to output specific markers so we can extract
 * structured data even from a conversational response.
 */
export function parseReportFromNarrative(
  narrative: string,
  meta: {
    id: string;
    title: string;
    source: string;
    environment: string;
    startedAt: Date;
    completedAt: Date;
    toolCallLog: StepRecord[];
  }
): QAReport {
  const durationMs = meta.completedAt.getTime() - meta.startedAt.getTime();

  // Extract test case results from Claude's output.
  // Claude is instructed to use markers like:
  //   [PASS] Test name
  //   [FAIL] Test name — reason
  //   [SKIP] Test name
  const testCases: TestCaseResult[] = [];
  const lines = narrative.split("\n");

  for (const line of lines) {
    const passMatch = line.match(/\[PASS\]\s+(.+)/i);
    const failMatch = line.match(/\[FAIL\]\s+(.+?)(?:\s+[—-]\s+(.+))?$/i);
    const skipMatch = line.match(/\[SKIP\]\s+(.+)/i);
    const errorMatch = line.match(/\[ERROR\]\s+(.+?)(?:\s+[—-]\s+(.+))?$/i);

    if (passMatch) {
      testCases.push({ name: passMatch[1].trim(), status: "PASS" });
    } else if (failMatch) {
      testCases.push({
        name: failMatch[1].trim(),
        status: "FAIL",
        failureReason: failMatch[2]?.trim(),
      });
    } else if (skipMatch) {
      testCases.push({ name: skipMatch[1].trim(), status: "SKIP" });
    } else if (errorMatch) {
      testCases.push({
        name: errorMatch[1].trim(),
        status: "ERROR",
        failureReason: errorMatch[2]?.trim(),
      });
    }
  }

  // Extract recommendations (lines starting with "- " or "* " after "Recommendation")
  const recommendations: string[] = [];
  let inRecommendations = false;
  for (const line of lines) {
    if (/recommendation/i.test(line)) {
      inRecommendations = true;
      continue;
    }
    if (inRecommendations) {
      const match = line.match(/^[-*]\s+(.+)/);
      if (match) {
        recommendations.push(match[1].trim());
      } else if (line.trim() === "" && recommendations.length > 0) {
        inRecommendations = false;
      }
    }
  }

  // Determine risk level from Claude's output
  const riskLevel = extractRiskLevel(narrative);

  const passed = testCases.filter((t) => t.status === "PASS").length;
  const failed = testCases.filter((t) => t.status === "FAIL").length;
  const skipped = testCases.filter((t) => t.status === "SKIP").length;
  const errors = testCases.filter((t) => t.status === "ERROR").length;
  const total = testCases.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  return {
    id: meta.id,
    title: meta.title,
    source: meta.source,
    environment: meta.environment,
    startedAt: meta.startedAt.toISOString(),
    completedAt: meta.completedAt.toISOString(),
    durationMs,
    summary: {
      total,
      passed,
      failed,
      skipped,
      errors,
      passRate,
      riskLevel,
    },
    testCases,
    recommendations,
    narrative,
  };
}

function extractRiskLevel(text: string): RiskLevel {
  const lower = text.toLowerCase();
  if (lower.includes("risk: critical") || lower.includes("risk level: critical")) return "CRITICAL";
  if (lower.includes("risk: high") || lower.includes("risk level: high")) return "HIGH";
  if (lower.includes("risk: medium") || lower.includes("risk level: medium")) return "MEDIUM";
  if (lower.includes("risk: low") || lower.includes("risk level: low")) return "LOW";
  // Infer from failure count
  if (lower.includes("[fail]") || lower.includes("[error]")) return "HIGH";
  return "LOW";
}

/**
 * Formats a QAReport as a readable Markdown string for display or export.
 */
export function formatReport(report: QAReport): string {
  const lines: string[] = [
    `# QA Report: ${report.title}`,
    ``,
    `**Source:** ${report.source}  `,
    `**Environment:** ${report.environment}  `,
    `**Duration:** ${Math.round(report.durationMs / 1000)}s  `,
    `**Risk Level:** ${report.summary.riskLevel}  `,
    ``,
    `## Summary`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tests | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Pass Rate | ${report.summary.passRate}% |`,
    ``,
  ];

  if (report.testCases.length > 0) {
    lines.push(`## Test Cases`);
    for (const tc of report.testCases) {
      const icon =
        tc.status === "PASS" ? "✓" :
        tc.status === "FAIL" ? "✗" :
        tc.status === "ERROR" ? "⚠" : "○";
      lines.push(`- ${icon} **${tc.name}** — ${tc.status}`);
      if (tc.failureReason) lines.push(`  - Failure: ${tc.failureReason}`);
      if (tc.recommendation) lines.push(`  - Fix: ${tc.recommendation}`);
    }
    lines.push(``);
  }

  if (report.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push(``);
  }

  lines.push(`## Full Analysis`);
  lines.push(report.narrative);

  return lines.join("\n");
}
