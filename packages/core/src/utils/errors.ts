export class TestAutomationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "TestAutomationError";
  }
}

export class ConnectionError extends TestAutomationError {
  constructor(system: string, details?: unknown) {
    super(
      `Failed to connect to ${system}`,
      "CONNECTION_ERROR",
      details
    );
    this.name = "ConnectionError";
  }
}

export class AuthenticationError extends TestAutomationError {
  constructor(system: string, details?: unknown) {
    super(
      `Authentication failed for ${system}`,
      "AUTH_ERROR",
      details
    );
    this.name = "AuthenticationError";
  }
}

export class ToolExecutionError extends TestAutomationError {
  constructor(tool: string, message: string, details?: unknown) {
    super(
      `Tool '${tool}' execution failed: ${message}`,
      "TOOL_EXECUTION_ERROR",
      details
    );
    this.name = "ToolExecutionError";
  }
}

export class TestDefinitionError extends TestAutomationError {
  constructor(message: string, details?: unknown) {
    super(message, "TEST_DEFINITION_ERROR", details);
    this.name = "TestDefinitionError";
  }
}

export class TimeoutError extends TestAutomationError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      "TIMEOUT_ERROR",
      { timeoutMs }
    );
    this.name = "TimeoutError";
  }
}

export class AssertionError extends TestAutomationError {
  constructor(
    expression: string,
    expected: unknown,
    actual: unknown
  ) {
    super(
      `Assertion failed: ${expression} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      "ASSERTION_ERROR",
      { expression, expected, actual }
    );
    this.name = "AssertionError";
  }
}
