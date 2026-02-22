export type ToolResultStatus = "success" | "failure" | "error" | "skipped";

export interface ToolResult<T = unknown> {
  status: ToolResultStatus;
  tool: string;
  duration: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
  metadata?: {
    screenshot?: string;
    snapshot?: string;
    logs?: string[];
    network?: NetworkEntry[];
  };
}

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  duration: number;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface StepResult {
  stepName: string;
  action: string;
  status: ToolResultStatus;
  duration: number;
  toolResult: ToolResult;
  assertions: AssertionResult[];
  savedVariables?: Record<string, unknown>;
}

export interface AssertionResult {
  expression: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  message?: string;
}

export interface TestResult {
  testId: string;
  testName: string;
  status: ToolResultStatus;
  startTime: string;
  endTime: string;
  duration: number;
  setupResults: StepResult[];
  stepResults: StepResult[];
  teardownResults: StepResult[];
  environment: string;
  tags: string[];
  retryCount: number;
  error?: string;
}

export interface SuiteResult {
  suiteId: string;
  suiteName: string;
  status: ToolResultStatus;
  startTime: string;
  endTime: string;
  duration: number;
  testResults: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    passRate: number;
  };
}
