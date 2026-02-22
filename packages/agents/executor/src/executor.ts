import {
  createLogger,
  VariableResolver,
} from "@test-automation-mcp/core";
import type {
  TestExecutionRequest,
  TestExecutionResponse,
  TestDefinition,
  TestStep,
  TestResult,
  StepResult,
  SuiteResult,
  AssertionResult,
  ToolResult,
} from "@test-automation-mcp/core";

const logger = createLogger("executor-agent");

export interface ToolCaller {
  callTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<ToolResult>;
}

export class ExecutorAgent {
  constructor(private readonly toolCaller: ToolCaller) {}

  async execute(request: TestExecutionRequest): Promise<TestExecutionResponse> {
    const startTime = new Date();
    logger.info(
      { testCount: request.tests.length, parallel: request.parallel },
      "Starting test execution"
    );

    let results: TestResult[];

    if (request.parallel && request.tests.length > 1) {
      const maxWorkers = request.maxWorkers ?? 4;
      results = await this.executeParallel(
        request.tests,
        request.environment,
        request.variables,
        maxWorkers
      );
    } else {
      results = [];
      for (const test of request.tests) {
        const result = await this.executeTest(test, request.variables);
        results.push({ ...result, environment: request.environment });
      }
    }

    const endTime = new Date();
    const passed = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failure").length;
    const errors = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    const suiteResult: SuiteResult | undefined = request.suite
      ? {
          suiteId: request.suite.suite.id,
          suiteName: request.suite.suite.name,
          status: failed > 0 || errors > 0 ? "failure" : "success",
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration: endTime.getTime() - startTime.getTime(),
          testResults: results,
          summary: {
            total: results.length,
            passed,
            failed,
            errors,
            skipped,
            passRate:
              results.length > 0
                ? (passed / results.length) * 100
                : 0,
          },
        }
      : undefined;

    logger.info(
      { passed, failed, errors, skipped, duration: endTime.getTime() - startTime.getTime() },
      "Test execution complete"
    );

    return { results, suiteResult };
  }

  async executeTest(
    test: TestDefinition,
    variables?: Record<string, unknown>
  ): Promise<TestResult> {
    const resolver = new VariableResolver();

    if (test.test.variables) {
      resolver.setAll(test.test.variables);
    }
    if (variables) {
      resolver.setAll(variables);
    }

    const startTime = new Date();
    const setupResults: StepResult[] = [];
    const stepResults: StepResult[] = [];
    const teardownResults: StepResult[] = [];
    let overallStatus: TestResult["status"] = "success";
    let errorMessage: string | undefined;
    let retryCount = 0;

    logger.info({ testId: test.test.id, testName: test.test.name }, "Executing test");

    try {
      if (test.test.setup) {
        for (const step of test.test.setup) {
          const result = await this.executeStepWithRetry(step, resolver);
          setupResults.push(result);
          if (result.status === "failure" || result.status === "error") {
            overallStatus = result.status;
            errorMessage = `Setup step "${step.name}" failed`;
            break;
          }
        }
      }

      if (overallStatus === "success") {
        for (const step of test.test.steps) {
          const result = await this.executeStepWithRetry(step, resolver);
          stepResults.push(result);
          if (result.status === "failure" || result.status === "error") {
            overallStatus = result.status;
            errorMessage = `Step "${step.name}" failed`;
            if (!step.continueOnFailure) {
              break;
            }
          }
        }
      }
    } catch (err) {
      overallStatus = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      if (test.test.teardown) {
        for (const step of test.test.teardown) {
          try {
            const result = await this.executeStep(step, resolver);
            teardownResults.push(result);
          } catch (err) {
            teardownResults.push({
              stepName: step.name,
              action: step.action ?? "assert",
              status: "error",
              duration: 0,
              toolResult: {
                status: "error",
                tool: step.action ?? "assert",
                duration: 0,
                error: {
                  code: "TEARDOWN_ERROR",
                  message: err instanceof Error ? err.message : String(err),
                },
              },
              assertions: [],
            });
          }
        }
      }
    }

    const endTime = new Date();

    return {
      testId: test.test.id,
      testName: test.test.name,
      status: overallStatus,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: endTime.getTime() - startTime.getTime(),
      setupResults,
      stepResults,
      teardownResults,
      environment: "",
      tags: test.test.tags ?? [],
      retryCount,
      error: errorMessage,
    };
  }

  async executeStep(
    step: TestStep,
    resolver: VariableResolver
  ): Promise<StepResult> {
    const startTime = performance.now();

    const actionName = step.action ?? "assert";
    const resolvedParams = this.resolveStepParams(step, resolver);

    logger.debug({ step: step.name, action: actionName }, "Executing step");

    let toolResult: ToolResult;
    if (step.action) {
      toolResult = await this.toolCaller.callTool(step.action, resolvedParams);
    } else {
      toolResult = {
        status: "success",
        tool: "assert",
        duration: 0,
        data: resolver.toJSON(),
      };
    }

    const duration = Math.round(performance.now() - startTime);

    if (step.save_as && toolResult.data != null) {
      resolver.set(step.save_as, toolResult.data);
    }

    let assertions: AssertionResult[] = [];
    if (step.assert) {
      const assertionContext = toolResult.data ?? resolver.toJSON();
      assertions = this.evaluateAssertions(step.assert, assertionContext);
    }

    const assertionsFailed = assertions.some((a) => !a.passed);
    let stepStatus = toolResult.status;
    if (stepStatus === "success" && assertionsFailed) {
      stepStatus = "failure";
    }

    return {
      stepName: step.name,
      action: actionName,
      status: stepStatus,
      duration,
      toolResult,
      assertions,
      savedVariables: step.save_as ? { [step.save_as]: toolResult.data } : undefined,
    };
  }

  evaluateAssertions(
    assertions: Record<string, unknown>[],
    data: unknown
  ): AssertionResult[] {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      for (const [expression, expected] of Object.entries(assertion)) {
        const actual = this.extractValue(data, expression);
        const result = this.evaluateSingleAssertion(expression, expected, actual);
        results.push(result);
      }
    }

    return results;
  }

  private async executeStepWithRetry(
    step: TestStep,
    resolver: VariableResolver
  ): Promise<StepResult> {
    const maxRetries = step.retries ?? 0;
    let lastResult: StepResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        logger.info(
          { step: step.name, attempt: attempt + 1, backoffMs: backoff },
          "Retrying step"
        );
        await this.sleep(backoff);
      }

      lastResult = await this.executeStep(step, resolver);

      if (lastResult.status === "success") {
        return lastResult;
      }
    }

    return lastResult!;
  }

  private async executeParallel(
    tests: TestDefinition[],
    environment: string,
    variables: Record<string, unknown> | undefined,
    maxWorkers: number
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const chunks = this.chunkArray(tests, maxWorkers);

    for (const chunk of chunks) {
      const settled = await Promise.allSettled(
        chunk.map((test) => this.executeTest(test, variables))
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          results.push({ ...outcome.value, environment });
        } else {
          results.push({
            testId: "unknown",
            testName: "unknown",
            status: "error",
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 0,
            setupResults: [],
            stepResults: [],
            teardownResults: [],
            environment,
            tags: [],
            retryCount: 0,
            error: outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
          });
        }
      }
    }

    return results;
  }

  private resolveStepParams(
    step: TestStep,
    resolver: VariableResolver
  ): Record<string, unknown> {
    const raw: Record<string, unknown> = {};

    if (step.params) {
      Object.assign(raw, step.params);
    }
    if (step.object) raw.object = step.object;
    if (step.data) raw.data = step.data;
    if (step.query) raw.query = step.query;
    if (step.function) raw.function = step.function;
    if (step.url) raw.url = step.url;
    if (step.selector) raw.selector = step.selector;
    if (step.value) raw.value = step.value;
    if (step.timeout !== undefined) raw.timeout = step.timeout;

    return resolver.resolveObject(raw);
  }

  private extractValue(data: unknown, path: string): unknown {
    if (data == null) return undefined;

    const parts = path.split(".");
    let current: unknown = data;

    for (const part of parts) {
      if (current == null) return undefined;

      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, prop, indexStr] = arrayMatch;
        current = (current as Record<string, unknown>)[prop];
        if (Array.isArray(current)) {
          current = current[parseInt(indexStr, 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  private evaluateSingleAssertion(
    expression: string,
    expected: unknown,
    actual: unknown
  ): AssertionResult {
    if (typeof expected === "string") {
      if (expected === "not null") {
        const passed = actual != null;
        return {
          expression,
          expected: "not null",
          actual,
          passed,
          message: passed
            ? `${expression} is not null`
            : `Expected ${expression} to be not null, got ${String(actual)}`,
        };
      }

      const gteMatch = expected.match(/^>=\s*(.+)$/);
      if (gteMatch) {
        const threshold = parseFloat(gteMatch[1]);
        const numActual = typeof actual === "number" ? actual : parseFloat(String(actual));
        const passed = !isNaN(numActual) && numActual >= threshold;
        return {
          expression,
          expected,
          actual,
          passed,
          message: passed
            ? `${expression}: ${numActual} >= ${threshold}`
            : `Expected ${expression} >= ${threshold}, got ${numActual}`,
        };
      }

      const lteMatch = expected.match(/^<=\s*(.+)$/);
      if (lteMatch) {
        const threshold = parseFloat(lteMatch[1]);
        const numActual = typeof actual === "number" ? actual : parseFloat(String(actual));
        const passed = !isNaN(numActual) && numActual <= threshold;
        return {
          expression,
          expected,
          actual,
          passed,
          message: passed
            ? `${expression}: ${numActual} <= ${threshold}`
            : `Expected ${expression} <= ${threshold}, got ${numActual}`,
        };
      }

      const ltMatch = expected.match(/^<\s*(.+)$/);
      if (ltMatch) {
        const threshold = parseFloat(ltMatch[1]);
        const numActual = typeof actual === "number" ? actual : parseFloat(String(actual));
        const passed = !isNaN(numActual) && numActual < threshold;
        return {
          expression,
          expected,
          actual,
          passed,
          message: passed
            ? `${expression}: ${numActual} < ${threshold}`
            : `Expected ${expression} < ${threshold}, got ${numActual}`,
        };
      }

      const gtMatch = expected.match(/^>\s*(.+)$/);
      if (gtMatch) {
        const threshold = parseFloat(gtMatch[1]);
        const numActual = typeof actual === "number" ? actual : parseFloat(String(actual));
        const passed = !isNaN(numActual) && numActual > threshold;
        return {
          expression,
          expected,
          actual,
          passed,
          message: passed
            ? `${expression}: ${numActual} > ${threshold}`
            : `Expected ${expression} > ${threshold}, got ${numActual}`,
        };
      }

      const containsMatch = expected.match(/^contains\s+(.+)$/);
      if (containsMatch) {
        const substring = containsMatch[1];
        const strActual = String(actual ?? "");
        const passed = strActual.includes(substring);
        return {
          expression,
          expected,
          actual,
          passed,
          message: passed
            ? `${expression} contains "${substring}"`
            : `Expected ${expression} to contain "${substring}", got "${strActual}"`,
        };
      }
    }

    const passed = this.deepEqual(actual, expected);
    return {
      expression,
      expected,
      actual,
      passed,
      message: passed
        ? `${expression} equals expected value`
        : `Expected ${expression} to equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    };
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a === "number" && typeof b === "number") {
      return Math.abs(a - b) < Number.EPSILON;
    }
    if (typeof a !== typeof b) {
      if (typeof a === "number" && typeof b === "string") return a === parseFloat(b);
      if (typeof a === "string" && typeof b === "number") return parseFloat(a) === b;
      return String(a) === String(b);
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => this.deepEqual(val, b[i]));
    }
    if (typeof a === "object" && typeof b === "object") {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
      for (const key of keys) {
        if (!this.deepEqual(aObj[key], bObj[key])) return false;
      }
      return true;
    }
    return false;
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
