import { createLogger } from "@test-automation-mcp/core";
import type { Connector, ConnectorConfig, ConnectorQuery, RequirementDocument } from "../connector.js";

const logger = createLogger("connector-github");

interface GitHubIssue {
  number: number;
  id: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  state: string;
}

export class GitHubConnector implements Connector {
  name = "github";
  private baseUrl = "";
  private headers: Record<string, string> = {};

  async authenticate(config: ConnectorConfig): Promise<void> {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${config.auth.token}`,
      Accept: "application/vnd.github.v3+json",
    };
    logger.info({ baseUrl: this.baseUrl }, "GitHub connector authenticated");
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchRequirements(query: ConnectorQuery): Promise<RequirementDocument[]> {
    const repo = query.project ?? "";
    const state = query.status?.[0] ?? "open";
    const perPage = query.maxResults ?? 30;
    const labelsParam = query.labels?.join(",") ?? "";

    let url = `${this.baseUrl}/repos/${repo}/issues?state=${state}&per_page=${perPage}`;
    if (labelsParam) url += `&labels=${encodeURIComponent(labelsParam)}`;

    logger.info({ repo, state }, "Fetching GitHub issues");

    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const issues = (await res.json()) as GitHubIssue[];
    return issues
      .filter((i) => !("pull_request" in i))
      .map((issue) => ({
        id: String(issue.id),
        externalId: `#${issue.number}`,
        title: issue.title,
        description: issue.body ?? "",
        source: "github",
        type: "issue",
        labels: issue.labels.map((l) => l.name),
        acceptanceCriteria: [],
        rawData: issue as unknown as Record<string, unknown>,
      }));
  }

  async fetchSingle(externalId: string): Promise<RequirementDocument | null> {
    return null;
  }
}
