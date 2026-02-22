import { describe, it, expect } from "vitest";
import {
  TestAutomationError,
  ConnectionError,
  AuthenticationError,
  ToolExecutionError,
  TestDefinitionError,
  TimeoutError,
  AssertionError,
} from "./errors.js";

describe("Error Classes", () => {
  describe("TestAutomationError", () => {
    it("should create with message and code", () => {
      const err = new TestAutomationError("test error", "TEST_CODE");
      expect(err.message).toBe("test error");
      expect(err.code).toBe("TEST_CODE");
      expect(err.name).toBe("TestAutomationError");
      expect(err).toBeInstanceOf(Error);
    });

    it("should include details when provided", () => {
      const details = { field: "value" };
      const err = new TestAutomationError("test", "CODE", details);
      expect(err.details).toEqual(details);
    });
  });

  describe("ConnectionError", () => {
    it("should format message with system name", () => {
      const err = new ConnectionError("Salesforce");
      expect(err.message).toBe("Failed to connect to Salesforce");
      expect(err.code).toBe("CONNECTION_ERROR");
      expect(err.name).toBe("ConnectionError");
      expect(err).toBeInstanceOf(TestAutomationError);
    });
  });

  describe("AuthenticationError", () => {
    it("should format message with system name", () => {
      const err = new AuthenticationError("SAP");
      expect(err.message).toBe("Authentication failed for SAP");
      expect(err.code).toBe("AUTH_ERROR");
      expect(err.name).toBe("AuthenticationError");
    });
  });

  describe("ToolExecutionError", () => {
    it("should include tool name in message", () => {
      const err = new ToolExecutionError("web/click", "element not found");
      expect(err.message).toBe(
        "Tool 'web/click' execution failed: element not found"
      );
      expect(err.code).toBe("TOOL_EXECUTION_ERROR");
    });
  });

  describe("TestDefinitionError", () => {
    it("should use provided message", () => {
      const err = new TestDefinitionError("Missing required field");
      expect(err.message).toBe("Missing required field");
      expect(err.code).toBe("TEST_DEFINITION_ERROR");
    });
  });

  describe("TimeoutError", () => {
    it("should include operation and duration", () => {
      const err = new TimeoutError("page load", 30000);
      expect(err.message).toBe(
        "Operation 'page load' timed out after 30000ms"
      );
      expect(err.code).toBe("TIMEOUT_ERROR");
      expect(err.details).toEqual({ timeoutMs: 30000 });
    });
  });

  describe("AssertionError", () => {
    it("should show expected vs actual", () => {
      const err = new AssertionError("status", 200, 404);
      expect(err.message).toContain("expected 200");
      expect(err.message).toContain("got 404");
      expect(err.code).toBe("ASSERTION_ERROR");
      expect(err.details).toEqual({
        expression: "status",
        expected: 200,
        actual: 404,
      });
    });
  });
});
