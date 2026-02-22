import axios from "axios";
import { createLogger } from "@test-automation-mcp/core";
import type { SuiteResult } from "@test-automation-mcp/core";

const logger = createLogger("notifications");

export interface SlackChannel {
  webhookUrl: string;
}

export interface TeamsChannel {
  webhookUrl: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface EmailChannel {
  smtpConfig: SmtpConfig;
}

export interface NotificationConfig {
  slack?: SlackChannel;
  teams?: TeamsChannel;
  email?: EmailChannel;
}

export interface SlackMessage {
  text?: string;
  blocks?: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
    [key: string]: unknown;
  }>;
}

export interface TeamsMessage {
  type: "message";
  attachments: Array<{
    contentType: string;
    content: {
      $schema: string;
      type: string;
      version: string;
      body: unknown[];
    };
  }>;
}

export interface EmailConfig {
  from: string;
  to: string[];
  subject: string;
}

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export type NotificationChannel = "slack" | "teams" | "email";

export class NotificationService {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  async sendSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
    try {
      await axios.post(webhookUrl, message, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
      logger.debug({ webhookUrl }, "Slack notification sent");
    } catch (err) {
      logger.error(
        { webhookUrl, error: err instanceof Error ? err.message : String(err) },
        "Failed to send Slack notification"
      );
      throw err;
    }
  }

  async sendTeams(webhookUrl: string, message: TeamsMessage): Promise<void> {
    try {
      await axios.post(webhookUrl, message, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
      logger.debug({ webhookUrl }, "Teams notification sent");
    } catch (err) {
      logger.error(
        { webhookUrl, error: err instanceof Error ? err.message : String(err) },
        "Failed to send Teams notification"
      );
      throw err;
    }
  }

  sendEmail(config: EmailConfig, message: EmailMessage): void {
    logger.info(
      {
        from: message.from,
        to: message.to,
        subject: message.subject,
      },
      "Email notification (stub - SMTP not configured, would send)"
    );
  }

  formatResultsForSlack(result: SuiteResult): SlackMessage {
    const { summary } = result;
    const statusEmoji =
      result.status === "success"
        ? ":white_check_mark:"
        : result.status === "failure"
          ? ":x:"
          : ":warning:";

    const blocks: SlackMessage["blocks"] = [
      {
        type: "header",
        text: { type: "plain_text", text: `${statusEmoji} Test Results: ${result.suiteName}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total:*\n${summary.total}` },
          { type: "mrkdwn", text: `*Passed:*\n${summary.passed}` },
          { type: "mrkdwn", text: `*Failed:*\n${summary.failed}` },
          { type: "mrkdwn", text: `*Errors:*\n${summary.errors}` },
          { type: "mrkdwn", text: `*Skipped:*\n${summary.skipped}` },
          { type: "mrkdwn", text: `*Pass Rate:*\n${summary.passRate.toFixed(1)}%` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Duration:* ${result.duration}ms | *Started:* ${result.startTime}`,
        },
      },
    ];

    const failures = result.testResults.filter(
      (t) => t.status === "failure" || t.status === "error"
    );
    if (failures.length > 0) {
      blocks.push({
        type: "header",
        text: { type: "plain_text", text: "Failed Tests" },
      });
      for (const fail of failures.slice(0, 5)) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `• *${fail.testName}*: ${fail.error ?? "Unknown error"}`,
          },
        });
      }
      if (failures.length > 5) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `_...and ${failures.length - 5} more_`,
          },
        });
      }
    }

    return {
      text: `Test Results: ${result.suiteName} - ${summary.passed}/${summary.total} passed`,
      blocks,
    };
  }

  formatResultsForTeams(result: SuiteResult): TeamsMessage {
    const { summary } = result;
    const statusText =
      result.status === "success"
        ? "Passed"
        : result.status === "failure"
          ? "Failed"
          : "Error";

    const body: Array<{ type: string; text?: string; size?: string; weight?: string; [key: string]: unknown }> = [
      {
        type: "TextBlock",
        text: `Test Results: ${result.suiteName}`,
        size: "large",
        weight: "bolder",
      },
      {
        type: "TextBlock",
        text: `Status: ${statusText}`,
        size: "medium",
      },
      {
        type: "FactSet",
        facts: [
          { title: "Total", value: String(summary.total) },
          { title: "Passed", value: String(summary.passed) },
          { title: "Failed", value: String(summary.failed) },
          { title: "Errors", value: String(summary.errors) },
          { title: "Skipped", value: String(summary.skipped) },
          { title: "Pass Rate", value: `${summary.passRate.toFixed(1)}%` },
          { title: "Duration", value: `${result.duration}ms` },
          { title: "Started", value: result.startTime },
        ],
      },
    ];

    const failures = result.testResults.filter(
      (t) => t.status === "failure" || t.status === "error"
    );
    if (failures.length > 0) {
      body.push({
        type: "TextBlock",
        text: "Failed Tests",
        weight: "bolder",
      });
      for (const fail of failures.slice(0, 5)) {
        body.push({
          type: "TextBlock",
          text: `• ${fail.testName}: ${fail.error ?? "Unknown error"}`,
          wrap: true,
        });
      }
      if (failures.length > 5) {
        body.push({
          type: "TextBlock",
          text: `...and ${failures.length - 5} more`,
          isSubtle: true,
        });
      }
    }

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.0",
            body,
          },
        },
      ],
    };
  }

  async notifyTestResults(
    result: SuiteResult,
    channels: NotificationChannel[]
  ): Promise<void> {
    for (const channel of channels) {
      try {
        if (channel === "slack" && this.config.slack?.webhookUrl) {
          const message = this.formatResultsForSlack(result);
          await this.sendSlack(this.config.slack.webhookUrl, message);
        } else if (channel === "teams" && this.config.teams?.webhookUrl) {
          const message = this.formatResultsForTeams(result);
          await this.sendTeams(this.config.teams.webhookUrl, message);
        } else if (channel === "email" && this.config.email?.smtpConfig) {
          const message: EmailMessage = {
            from: `test-automation@localhost`,
            to: [],
            subject: `Test Results: ${result.suiteName} - ${result.summary.passed}/${result.summary.total} passed`,
            text: `Suite: ${result.suiteName}\nStatus: ${result.status}\nPassed: ${result.summary.passed}\nFailed: ${result.summary.failed}\nDuration: ${result.duration}ms`,
          };
          this.sendEmail(
            { from: message.from, to: message.to, subject: message.subject },
            message
          );
        }
      } catch (err) {
        logger.error(
          { channel, error: err instanceof Error ? err.message : String(err) },
          "Failed to send notification"
        );
      }
    }
  }
}
