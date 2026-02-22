import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService, type NotificationConfig } from "./notifications.js";
import type { SuiteResult } from "@test-automation-mcp/core";

vi.mock("axios", () => ({
  default: { post: vi.fn().mockResolvedValue({ status: 200 }) },
}));

vi.mock("@test-automation-mcp/core", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockSuiteResult: SuiteResult = {
  suiteId: "S-001",
  suiteName: "Test Suite",
  status: "failure",
  startTime: "2026-01-01T00:00:00Z",
  endTime: "2026-01-01T00:01:00Z",
  duration: 60000,
  testResults: [
    {
      testId: "T1",
      testName: "Test 1",
      status: "success",
      startTime: "2026-01-01T00:00:00Z",
      endTime: "2026-01-01T00:00:01Z",
      duration: 1000,
      setupResults: [],
      stepResults: [],
      teardownResults: [],
      environment: "test",
      tags: [],
      retryCount: 0,
    },
    {
      testId: "T2",
      testName: "Test 2",
      status: "failure",
      startTime: "2026-01-01T00:00:01Z",
      endTime: "2026-01-01T00:00:03Z",
      duration: 2000,
      setupResults: [],
      stepResults: [],
      teardownResults: [],
      environment: "test",
      tags: [],
      retryCount: 0,
      error: "Expected 200 got 500",
    },
  ],
  summary: { total: 2, passed: 1, failed: 1, errors: 0, skipped: 0, passRate: 50 },
};

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService({});
  });

  describe("formatResultsForSlack()", () => {
    it("should produce a valid Slack message with blocks", () => {
      const msg = service.formatResultsForSlack(mockSuiteResult);

      expect(msg.text).toContain("Test Suite");
      expect(msg.text).toContain("1/2 passed");
      expect(msg.blocks).toBeDefined();
      expect(msg.blocks!.length).toBeGreaterThanOrEqual(3);

      const header = msg.blocks![0];
      expect(header.type).toBe("header");
      expect(header.text?.text).toContain("Test Suite");

      const statsSection = msg.blocks![1];
      expect(statsSection.type).toBe("section");
      expect(statsSection.fields).toBeDefined();
      expect(statsSection.fields!.length).toBe(6);
    });

    it("should show failures when present", () => {
      const msg = service.formatResultsForSlack(mockSuiteResult);

      const failedHeader = msg.blocks!.find(
        (b) => b.type === "header" && b.text?.text === "Failed Tests",
      );
      expect(failedHeader).toBeDefined();

      const failureBlock = msg.blocks!.find(
        (b) => b.type === "section" && b.text?.text?.includes("Test 2"),
      );
      expect(failureBlock).toBeDefined();
      expect(failureBlock!.text!.text).toContain("Expected 200 got 500");
    });

    it("should not include failed tests section when all pass", () => {
      const allPassResult: SuiteResult = {
        ...mockSuiteResult,
        status: "success",
        testResults: [mockSuiteResult.testResults[0]],
        summary: { total: 1, passed: 1, failed: 0, errors: 0, skipped: 0, passRate: 100 },
      };
      const msg = service.formatResultsForSlack(allPassResult);

      const failedHeader = msg.blocks!.find(
        (b) => b.type === "header" && b.text?.text === "Failed Tests",
      );
      expect(failedHeader).toBeUndefined();
    });
  });

  describe("formatResultsForTeams()", () => {
    it("should produce an Adaptive Card message", () => {
      const msg = service.formatResultsForTeams(mockSuiteResult);

      expect(msg.type).toBe("message");
      expect(msg.attachments).toHaveLength(1);

      const card = msg.attachments[0];
      expect(card.contentType).toBe("application/vnd.microsoft.card.adaptive");
      expect(card.content.type).toBe("AdaptiveCard");
      expect(card.content.version).toBe("1.0");
      expect(card.content.$schema).toContain("adaptivecards.io");
      expect(card.content.body.length).toBeGreaterThanOrEqual(3);
    });

    it("should include failed tests in the body when failures exist", () => {
      const msg = service.formatResultsForTeams(mockSuiteResult);
      const body = msg.attachments[0].content.body as Array<{ type: string; text?: string }>;

      const failedHeading = body.find(
        (b) => b.type === "TextBlock" && b.text === "Failed Tests",
      );
      expect(failedHeading).toBeDefined();

      const failEntry = body.find(
        (b) => b.type === "TextBlock" && b.text?.includes("Test 2"),
      );
      expect(failEntry).toBeDefined();
    });

    it("should show status as 'Failed' for failure suite", () => {
      const msg = service.formatResultsForTeams(mockSuiteResult);
      const body = msg.attachments[0].content.body as Array<{ type: string; text?: string }>;
      const statusBlock = body.find((b) => b.text?.includes("Status:"));
      expect(statusBlock?.text).toContain("Failed");
    });
  });

  describe("notifyTestResults()", () => {
    it("should call sendSlack when channels includes 'slack'", async () => {
      const config: NotificationConfig = {
        slack: { webhookUrl: "https://hooks.slack.example.com/test" },
      };
      const svc = new NotificationService(config);
      const sendSlackSpy = vi.spyOn(svc, "sendSlack").mockResolvedValue(undefined);

      await svc.notifyTestResults(mockSuiteResult, ["slack"]);

      expect(sendSlackSpy).toHaveBeenCalledTimes(1);
      expect(sendSlackSpy).toHaveBeenCalledWith(
        "https://hooks.slack.example.com/test",
        expect.objectContaining({ text: expect.any(String), blocks: expect.any(Array) }),
      );
    });

    it("should call sendTeams when channels includes 'teams'", async () => {
      const config: NotificationConfig = {
        teams: { webhookUrl: "https://teams.example.com/webhook" },
      };
      const svc = new NotificationService(config);
      const sendTeamsSpy = vi.spyOn(svc, "sendTeams").mockResolvedValue(undefined);

      await svc.notifyTestResults(mockSuiteResult, ["teams"]);

      expect(sendTeamsSpy).toHaveBeenCalledTimes(1);
    });

    it("should not throw when a channel send fails", async () => {
      const config: NotificationConfig = {
        slack: { webhookUrl: "https://hooks.slack.example.com/bad" },
      };
      const svc = new NotificationService(config);
      vi.spyOn(svc, "sendSlack").mockRejectedValue(new Error("webhook down"));

      await expect(svc.notifyTestResults(mockSuiteResult, ["slack"])).resolves.toBeUndefined();
    });

    it("should skip slack when no webhook configured", async () => {
      const svc = new NotificationService({});
      const sendSlackSpy = vi.spyOn(svc, "sendSlack");

      await svc.notifyTestResults(mockSuiteResult, ["slack"]);

      expect(sendSlackSpy).not.toHaveBeenCalled();
    });
  });
});
