import { createLogger } from "@test-automation-mcp/core";
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisSummary,
  FailureAnalysis,
  TrendData,
  TestResult,
  SuiteResult,
} from "@test-automation-mcp/core";

const logger = createLogger("analyzer-agent");

const ENVIRONMENT_PATTERNS = [
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EHOSTUNREACH/i,
  /timeout/i,
  /connection\s+refused/i,
  /network\s+error/i,
  /dns\s+resolution/i,
  /service\s+unavailable/i,
  /503/,
  /502/,
  /504/,
  /gateway\s+timeout/i,
];

const CONFIGURATION_PATTERNS = [
  /missing\s+config/i,
  /credential/i,
  /authentication\s+failed/i,
  /unauthorized/i,
  /401/,
  /403/,
  /forbidden/i,
  /permission\s+denied/i,
  /invalid\s+api\s+key/i,
  /missing\s+env/i,
  /not\s+configured/i,
];

const DATA_PATTERNS = [
  /not\s+found/i,
  /404/,
  /null\s+reference/i,
  /undefined\s+is\s+not/i,
  /cannot\s+read\s+propert/i,
  /invalid\s+data/i,
  /missing\s+field/i,
  /validation\s+error/i,
  /constraint\s+violation/i,
  /duplicate\s+key/i,
];

export class AnalyzerAgent {
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    logger.info(
      { resultCount: request.results.length },
      "Starting analysis"
    );

    const summary = this.computeSummary(request.results);

    const failedResults = request.results.filter(
      (r) => r.status === "failure" || r.status === "error"
    );

    const historicalByTest = this.groupHistoricalByTest(
      request.historicalResults
    );

    const failures: FailureAnalysis[] = failedResults.map((result) =>
      this.analyzeFailure(result, historicalByTest.get(result.testId))
    );

    if (request.historicalResults?.length) {
      summary.flakinessScore = this.computeFlakinessScore(
        request.results,
        request.historicalResults
      );
    }

    const trends = request.historicalResults?.length
      ? this.computeTrends(request.historicalResults)
      : undefined;

    const recommendations = this.generateRecommendations(summary, failures);

    logger.info(
      {
        overallStatus: summary.overallStatus,
        passRate: summary.passRate,
        failureCount: failures.length,
      },
      "Analysis complete"
    );

    return { summary, failures, recommendations, trends };
  }

  computeSummary(results: TestResult[]): AnalysisSummary {
    const total = results.length;
    const passed = results.filter((r) => r.status === "success").length;
    const failed = results.filter(
      (r) => r.status === "failure" || r.status === "error"
    ).length;

    const passRate = total > 0 ? (passed / total) * 100 : 0;

    const criticalFailures = results.filter(
      (r) =>
        (r.status === "failure" || r.status === "error") &&
        r.tags.includes("critical")
    ).length;

    let overallStatus: string;
    if (passRate === 100) {
      overallStatus = "passed";
    } else if (passRate >= 80) {
      overallStatus = "unstable";
    } else {
      overallStatus = "failed";
    }

    return {
      overallStatus,
      passRate: Math.round(passRate * 100) / 100,
      flakinessScore: 0,
      criticalFailures,
      newFailures: 0,
      fixedTests: 0,
    };
  }

  analyzeFailure(
    result: TestResult,
    history?: TestResult[]
  ): FailureAnalysis {
    const errorText = this.collectErrorText(result);
    const category = this.categorizeFailure(errorText, result, history);
    const confidence = this.computeConfidence(category, errorText, result);
    const suggestedFix = this.suggestFix(category, errorText);
    const relatedTests = this.findRelatedTests(result);

    return {
      testId: result.testId,
      testName: result.testName,
      rootCause: this.describeRootCause(category, errorText, result),
      category,
      confidence,
      suggestedFix,
      relatedTests: relatedTests.length > 0 ? relatedTests : undefined,
    };
  }

  computeTrends(historical: SuiteResult[]): TrendData[] {
    const sorted = [...historical].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return sorted.map((suite) => {
      const flakyTests = this.countFlakyInSuite(suite);

      return {
        date: suite.startTime.split("T")[0],
        passRate: suite.summary.passRate,
        totalTests: suite.summary.total,
        avgDuration:
          suite.testResults.length > 0
            ? Math.round(
                suite.testResults.reduce((sum, r) => sum + r.duration, 0) /
                  suite.testResults.length
              )
            : 0,
        flakyTests,
      };
    });
  }

  generateRecommendations(
    summary: AnalysisSummary,
    failures: FailureAnalysis[]
  ): string[] {
    const recs: string[] = [];

    if (summary.criticalFailures > 0) {
      recs.push(
        `URGENT: ${summary.criticalFailures} critical test(s) failing - investigate immediately`
      );
    }

    const envFailures = failures.filter((f) => f.category === "environment");
    if (envFailures.length > 0) {
      const names = envFailures.map((f) => f.testName).join(", ");
      recs.push(
        `Investigate environment issues affecting: ${names}. Check service availability and network connectivity.`
      );
    }

    const configFailures = failures.filter(
      (f) => f.category === "configuration"
    );
    if (configFailures.length > 0) {
      recs.push(
        `Fix configuration issues: verify credentials, API keys, and environment variables for ${configFailures.length} failing test(s).`
      );
    }

    const flakyTests = failures.filter((f) => f.category === "flaky");
    if (flakyTests.length > 0) {
      for (const flaky of flakyTests) {
        recs.push(`Stabilize flaky test "${flaky.testName}" - consider adding retries or fixing timing dependencies.`);
      }
    }

    const bugFailures = failures.filter((f) => f.category === "bug");
    if (bugFailures.length > 0) {
      for (const bug of bugFailures) {
        recs.push(
          `Fix assertion failure in "${bug.testName}": ${bug.rootCause}`
        );
      }
    }

    const dataFailures = failures.filter((f) => f.category === "data");
    if (dataFailures.length > 0) {
      recs.push(
        `Review test data for ${dataFailures.length} test(s) with data-related failures. Ensure test data fixtures are up to date.`
      );
    }

    if (summary.flakinessScore > 0.3) {
      recs.push(
        `High flakiness score (${Math.round(summary.flakinessScore * 100)}%). Consider reviewing test isolation and shared state.`
      );
    }

    if (summary.passRate < 50) {
      recs.push(
        "Pass rate below 50% - consider running a subset of stable tests as a smoke suite while investigating failures."
      );
    }

    if (summary.newFailures > 0) {
      recs.push(
        `${summary.newFailures} new failure(s) detected since last run - likely caused by recent changes.`
      );
    }

    if (recs.length === 0 && summary.passRate === 100) {
      recs.push("All tests passing. No action required.");
    }

    return recs;
  }

  private collectErrorText(result: TestResult): string {
    const parts: string[] = [];

    if (result.error) {
      parts.push(result.error);
    }

    for (const step of [...result.setupResults, ...result.stepResults, ...result.teardownResults]) {
      if (step.toolResult.error) {
        parts.push(step.toolResult.error.message);
        if (step.toolResult.error.code) {
          parts.push(step.toolResult.error.code);
        }
      }
      for (const assertion of step.assertions) {
        if (!assertion.passed && assertion.message) {
          parts.push(assertion.message);
        }
      }
    }

    return parts.join(" | ");
  }

  private categorizeFailure(
    errorText: string,
    result: TestResult,
    history?: TestResult[]
  ): FailureAnalysis["category"] {
    if (history && history.length > 0) {
      const recentHistory = history.slice(-10);
      const passedInHistory = recentHistory.some(
        (r) => r.status === "success"
      );
      const failedInHistory = recentHistory.some(
        (r) => r.status === "failure" || r.status === "error"
      );
      if (passedInHistory && failedInHistory) {
        return "flaky";
      }
    }

    if (ENVIRONMENT_PATTERNS.some((p) => p.test(errorText))) {
      return "environment";
    }

    if (CONFIGURATION_PATTERNS.some((p) => p.test(errorText))) {
      return "configuration";
    }

    const hasAssertionFailure = [
      ...result.setupResults,
      ...result.stepResults,
    ].some((step) => step.assertions.some((a) => !a.passed));

    if (hasAssertionFailure) {
      return "bug";
    }

    if (DATA_PATTERNS.some((p) => p.test(errorText))) {
      return "data";
    }

    return "unknown";
  }

  private computeConfidence(
    category: FailureAnalysis["category"],
    errorText: string,
    result: TestResult
  ): number {
    switch (category) {
      case "bug": {
        const failedAssertions = [
          ...result.setupResults,
          ...result.stepResults,
        ].flatMap((s) => s.assertions.filter((a) => !a.passed));
        if (failedAssertions.length > 0 && failedAssertions[0].expected != null) {
          return 0.9;
        }
        return 0.7;
      }
      case "environment": {
        const matchCount = ENVIRONMENT_PATTERNS.filter((p) =>
          p.test(errorText)
        ).length;
        return Math.min(0.6 + matchCount * 0.1, 0.95);
      }
      case "configuration": {
        const matchCount = CONFIGURATION_PATTERNS.filter((p) =>
          p.test(errorText)
        ).length;
        return Math.min(0.65 + matchCount * 0.1, 0.95);
      }
      case "flaky":
        return 0.85;
      case "data": {
        const matchCount = DATA_PATTERNS.filter((p) =>
          p.test(errorText)
        ).length;
        return Math.min(0.5 + matchCount * 0.15, 0.9);
      }
      case "unknown":
      default:
        return 0.3;
    }
  }

  private describeRootCause(
    category: FailureAnalysis["category"],
    errorText: string,
    result: TestResult
  ): string {
    switch (category) {
      case "bug": {
        const failedAssertions = [
          ...result.setupResults,
          ...result.stepResults,
        ].flatMap((s) => s.assertions.filter((a) => !a.passed));
        if (failedAssertions.length > 0) {
          const first = failedAssertions[0];
          return `Assertion failed: expected ${first.expression} to be ${JSON.stringify(first.expected)}, got ${JSON.stringify(first.actual)}`;
        }
        return `Assertion failure detected: ${this.truncate(errorText, 200)}`;
      }
      case "environment":
        return `Environment/connectivity issue: ${this.truncate(errorText, 200)}`;
      case "configuration":
        return `Configuration/authentication error: ${this.truncate(errorText, 200)}`;
      case "flaky":
        return "Test is flaky - intermittent pass/fail pattern detected in historical results";
      case "data":
        return `Data-related error: ${this.truncate(errorText, 200)}`;
      case "unknown":
      default:
        return `Unclassified failure: ${this.truncate(errorText, 200)}`;
    }
  }

  private suggestFix(
    category: FailureAnalysis["category"],
    errorText: string
  ): string {
    switch (category) {
      case "bug":
        return "Review the expected vs actual values. Update the assertion if requirements changed, or fix the underlying code if behavior is incorrect.";
      case "environment":
        if (/timeout/i.test(errorText)) {
          return "Increase timeout thresholds or investigate slow service response times.";
        }
        return "Check service availability, network connectivity, and firewall rules. Consider adding health-check steps before test execution.";
      case "configuration":
        if (/credential|authentication|unauthorized/i.test(errorText)) {
          return "Verify test credentials are valid and not expired. Check if API keys or tokens need rotation.";
        }
        return "Review environment configuration. Ensure all required variables, secrets, and config files are present.";
      case "flaky":
        return "Add retry logic, increase wait times, or replace polling with event-driven waits. Check for shared state between tests.";
      case "data":
        if (/not\s+found|404/i.test(errorText)) {
          return "Verify test data exists. Check if setup steps correctly created required records.";
        }
        return "Review test data fixtures and ensure data preconditions are met before test execution.";
      case "unknown":
      default:
        return "Review the full error details and test logs for additional context.";
    }
  }

  private findRelatedTests(result: TestResult): string[] {
    const relatedIds: string[] = [];
    const parts = result.testId.split(/[-_.]/);
    if (parts.length >= 2) {
      const prefix = parts.slice(0, -1).join("-");
      relatedIds.push(`${prefix}-*`);
    }
    return relatedIds;
  }

  private computeFlakinessScore(
    currentResults: TestResult[],
    historicalSuites: SuiteResult[]
  ): number {
    if (historicalSuites.length === 0) return 0;

    const allHistoricalResults = historicalSuites.flatMap(
      (s) => s.testResults
    );

    let flipCount = 0;
    let testCount = 0;

    for (const current of currentResults) {
      const history = allHistoricalResults.filter(
        (h) => h.testId === current.testId
      );
      if (history.length === 0) continue;

      testCount++;
      const statuses = [...history.map((h) => h.status), current.status];
      for (let i = 1; i < statuses.length; i++) {
        const prev = statuses[i - 1] === "success";
        const curr = statuses[i] === "success";
        if (prev !== curr) flipCount++;
      }
    }

    if (testCount === 0) return 0;

    const maxFlips = testCount * historicalSuites.length;
    return Math.min(Math.round((flipCount / maxFlips) * 100) / 100, 1);
  }

  private countFlakyInSuite(suite: SuiteResult): number {
    return suite.testResults.filter((r) => r.retryCount > 0).length;
  }

  private groupHistoricalByTest(
    historicalSuites?: SuiteResult[]
  ): Map<string, TestResult[]> {
    const map = new Map<string, TestResult[]>();
    if (!historicalSuites) return map;

    for (const suite of historicalSuites) {
      for (const result of suite.testResults) {
        const existing = map.get(result.testId) ?? [];
        existing.push(result);
        map.set(result.testId, existing);
      }
    }

    return map;
  }

  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + "...";
  }
}
