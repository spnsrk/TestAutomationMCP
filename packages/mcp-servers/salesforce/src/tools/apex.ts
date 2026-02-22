import { z } from "zod";
import type { Connection, HttpMethods } from "jsforce";
import type { ToolResult } from "@test-automation-mcp/core";
import { createLogger } from "@test-automation-mcp/core";

const logger = createLogger("sf-apex");

export const apexTools = {
  "sf/apex.runTests": {
    description:
      "Run Apex test classes and return results including pass/fail counts, code coverage, and failure details",
    inputSchema: z.object({
      testClassNames: z
        .array(z.string())
        .describe("Array of Apex test class names to run"),
      testLevel: z
        .enum([
          "RunSpecifiedTests",
          "RunLocalTests",
          "RunAllTestsInOrg",
        ])
        .default("RunSpecifiedTests")
        .describe("Test execution level"),
    }),
    handler: async (
      conn: Connection,
      params: {
        testClassNames: string[];
        testLevel: "RunSpecifiedTests" | "RunLocalTests" | "RunAllTestsInOrg";
      }
    ): Promise<ToolResult> => {
      const testRequest: Record<string, unknown> = {
        testLevel: params.testLevel,
      };

      if (params.testLevel === "RunSpecifiedTests") {
        testRequest.tests = params.testClassNames.map((name) => ({
          className: name,
        }));
      }

      const asyncResult = await conn.tooling.request<{ id: string }>({
        method: "POST",
        url: "/services/data/v59.0/tooling/runTestsAsynchronous",
        body: JSON.stringify(testRequest),
        headers: { "Content-Type": "application/json" },
      });

      const testRunId =
        typeof asyncResult === "string" ? asyncResult : asyncResult.id;

      let status = "Queued";
      let attempts = 0;
      const maxAttempts = 120;

      while (status !== "Completed" && status !== "Failed" && status !== "Aborted" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts++;

        const statusResult = await conn.tooling.query<{
          Status: string;
          MethodsCompleted: number;
          MethodsFailed: number;
          MethodsEnqueued: number;
        }>(
          `SELECT Status, MethodsCompleted, MethodsFailed, MethodsEnqueued FROM ApexTestRunResult WHERE AsyncApexJobId = '${testRunId}'`
        );

        if (statusResult.records.length > 0) {
          status = statusResult.records[0].Status;
        }
      }

      if (attempts >= maxAttempts) {
        return {
          status: "error",
          tool: "sf/apex.runTests",
          duration: 0,
          error: {
            code: "TEST_TIMEOUT",
            message: `Test run timed out after ${maxAttempts * 2} seconds`,
          },
        };
      }

      const testResults = await conn.tooling.query<{
        ApexClassId: string;
        MethodName: string;
        Outcome: string;
        Message: string | null;
        StackTrace: string | null;
        RunTime: number;
        ApexClass: { Name: string };
      }>(
        `SELECT ApexClassId, MethodName, Outcome, Message, StackTrace, RunTime, ApexClass.Name ` +
          `FROM ApexTestResult WHERE AsyncApexJobId = '${testRunId}' ORDER BY ApexClass.Name, MethodName`
      );

      const passed = testResults.records.filter((r) => r.Outcome === "Pass");
      const failed = testResults.records.filter((r) => r.Outcome === "Fail");

      const coverageResult = await conn.tooling.query<{
        ApexClassOrTriggerId: string;
        ApexClassOrTrigger: { Name: string };
        NumLinesCovered: number;
        NumLinesUncovered: number;
      }>(
        `SELECT ApexClassOrTriggerId, ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered ` +
          `FROM ApexCodeCoverageAggregate ORDER BY ApexClassOrTrigger.Name`
      );

      const coverageSummary = coverageResult.records.map((c) => ({
        className: c.ApexClassOrTrigger.Name,
        linesCovered: c.NumLinesCovered,
        linesUncovered: c.NumLinesUncovered,
        coveragePercent:
          c.NumLinesCovered + c.NumLinesUncovered > 0
            ? Math.round(
                (c.NumLinesCovered /
                  (c.NumLinesCovered + c.NumLinesUncovered)) *
                  100
              )
            : 100,
      }));

      logger.info(
        { passed: passed.length, failed: failed.length, testRunId },
        "Apex test run completed"
      );

      return {
        status: failed.length > 0 ? "failure" : "success",
        tool: "sf/apex.runTests",
        duration: 0,
        data: {
          testRunId,
          summary: {
            total: testResults.records.length,
            passed: passed.length,
            failed: failed.length,
          },
          testResults: testResults.records.map((r) => ({
            className: r.ApexClass.Name,
            methodName: r.MethodName,
            outcome: r.Outcome,
            runTime: r.RunTime,
            message: r.Message,
            stackTrace: r.StackTrace,
          })),
          codeCoverage: coverageSummary,
        },
      };
    },
  },

  "sf/apex.executeAnonymous": {
    description:
      "Execute anonymous Apex code and return the result including debug logs",
    inputSchema: z.object({
      code: z.string().describe("Apex code to execute anonymously"),
    }),
    handler: async (
      conn: Connection,
      params: { code: string }
    ): Promise<ToolResult> => {
      const encodedBody = encodeURIComponent(params.code);
      const result = await conn.tooling.request<{
        compiled: boolean;
        compileProblem: string | null;
        success: boolean;
        line: number;
        column: number;
        exceptionMessage: string | null;
        exceptionStackTrace: string | null;
      }>({
        method: "GET",
        url: `/services/data/v59.0/tooling/executeAnonymous/?anonymousBody=${encodedBody}`,
      });

      if (!result.compiled) {
        logger.warn(
          { line: result.line, column: result.column },
          "Apex compilation failed"
        );

        return {
          status: "failure",
          tool: "sf/apex.executeAnonymous",
          duration: 0,
          error: {
            code: "COMPILE_ERROR",
            message: result.compileProblem ?? "Compilation failed",
            details: { line: result.line, column: result.column },
          },
        };
      }

      if (!result.success) {
        logger.warn("Apex execution failed with runtime exception");

        return {
          status: "failure",
          tool: "sf/apex.executeAnonymous",
          duration: 0,
          error: {
            code: "RUNTIME_ERROR",
            message: result.exceptionMessage ?? "Runtime exception",
            details: { stackTrace: result.exceptionStackTrace },
          },
        };
      }

      logger.info("Anonymous Apex executed successfully");

      return {
        status: "success",
        tool: "sf/apex.executeAnonymous",
        duration: 0,
        data: {
          compiled: true,
          success: true,
        },
      };
    },
  },

  "sf/apex.callRest": {
    description:
      "Call a custom Apex REST endpoint. The path should start with /services/apexrest/",
    inputSchema: z.object({
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .describe("HTTP method"),
      path: z
        .string()
        .describe("REST endpoint path (e.g., /services/apexrest/MyEndpoint)"),
      body: z
        .record(z.unknown())
        .optional()
        .describe("Request body for POST/PUT/PATCH"),
    }),
    handler: async (
      conn: Connection,
      params: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        path: string;
        body?: Record<string, unknown>;
      }
    ): Promise<ToolResult> => {
      const requestPath = params.path.startsWith("/")
        ? params.path
        : `/${params.path}`;

      const requestOpts: {
        method: HttpMethods;
        url: string;
        body?: string;
        headers?: Record<string, string>;
      } = {
        method: params.method as HttpMethods,
        url: requestPath,
      };

      if (params.body && ["POST", "PUT", "PATCH"].includes(params.method)) {
        requestOpts.body = JSON.stringify(params.body);
        requestOpts.headers = { "Content-Type": "application/json" };
      }

      const response = await conn.request<unknown>(requestOpts);

      logger.info(
        { method: params.method, path: requestPath },
        "Apex REST call completed"
      );

      return {
        status: "success",
        tool: "sf/apex.callRest",
        duration: 0,
        data: {
          method: params.method,
          path: requestPath,
          response,
        },
      };
    },
  },
};
