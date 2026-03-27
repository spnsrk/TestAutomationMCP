import { createLogger } from "@test-automation-mcp/core";
import type { Connector, ConnectorConfig, ConnectorQuery, RequirementDocument } from "../connector.js";

const logger = createLogger("connector-jira");

interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    description?: string | null;
    issuetype: { name: string };
    priority?: { name: string };
    labels?: string[];
    status: { name: string };
    [key: string]: unknown;
  };
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
}

export class JiraConnector implements Connector {
  name = "jira";
  private baseUrl = "";
  private headers: Record<string, string> = {};

  async authenticate(config: ConnectorConfig): Promise<void> {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");

    if (config.auth.type === "basic") {
      if (!config.auth.username || !config.auth.password) {
        throw new Error("Jira basic auth requires username and password");
      }
      const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64");
      this.headers = {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      };
    } else if (config.auth.type === "token") {
      if (!config.auth.token) {
        throw new Error("Jira token auth requires a token");
      }
      this.headers = {
        Authorization: `Bearer ${config.auth.token}`,
        "Content-Type": "application/json",
      };
    } else {
      throw new Error(`Unsupported auth type: ${config.auth.type}`);
    }

    logger.info("Jira connector authenticated");
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/rest/api/2/myself`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchRequirements(query: ConnectorQuery): Promise<RequirementDocument[]> {
    const jql = this.buildJql(query);
    const maxResults = query.maxResults ?? 50;

    logger.info({ jql, maxResults }, "Fetching Jira issues");

    const res = await fetch(
      `${this.baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,description,issuetype,priority,labels,status`,
      { headers: this.headers }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as JiraSearchResult;
    const issues = data.issues ?? [];
    logger.info({ total: data.total, fetched: issues.length }, "Jira issues fetched");

    return issues.map((issue) => this.mapIssueToRequirement(issue));
  }

  async fetchSingle(externalId: string): Promise<RequirementDocument | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/rest/api/2/issue/${externalId}?fields=summary,description,issuetype,priority,labels,status`,
        { headers: this.headers }
      );
      if (!res.ok) return null;
      const issue = (await res.json()) as JiraIssue;
      return this.mapIssueToRequirement(issue);
    } catch {
      return null;
    }
  }

  private buildJql(query: ConnectorQuery): string {
    const conditions: string[] = [];

    if (query.project) {
      conditions.push(`project = "${query.project}"`);
    }
    if (query.labels && query.labels.length > 0) {
      conditions.push(`labels in (${query.labels.map((l) => `"${l}"`).join(",")})`);
    }
    if (query.status && query.status.length > 0) {
      conditions.push(`status in (${query.status.map((s) => `"${s}"`).join(",")})`);
    }
    if (query.query) {
      conditions.push(query.query);
    }

    if (conditions.length === 0) {
      return "issuetype in (Story, Bug, Task) ORDER BY updated DESC";
    }

    return conditions.join(" AND ") + " ORDER BY updated DESC";
  }

  private mapIssueToRequirement(issue: JiraIssue): RequirementDocument {
    const acceptanceCriteria = this.extractAcceptanceCriteria(
      issue.fields.description ?? ""
    );

    return {
      id: issue.id,
      externalId: issue.key,
      title: issue.fields.summary,
      description: issue.fields.description ?? "",
      source: "jira",
      type: issue.fields.issuetype.name.toLowerCase(),
      priority: this.mapPriority(issue.fields.priority?.name),
      labels: issue.fields.labels,
      acceptanceCriteria,
      rawData: issue.fields as Record<string, unknown>,
    };
  }

  private extractAcceptanceCriteria(description: string): string[] {
    const criteria: string[] = [];
    const lines = description.split("\n");

    let inAcSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/acceptance\s+criteria/i.test(trimmed) || /given.*when.*then/i.test(trimmed)) {
        inAcSection = true;
        continue;
      }
      if (inAcSection && trimmed.length > 0) {
        if (/^(#{1,3}\s|---|\*\*\*)/.test(trimmed)) {
          inAcSection = false;
          continue;
        }
        const cleaned = trimmed.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "");
        if (cleaned.length > 5) {
          criteria.push(cleaned);
        }
      }
    }

    if (criteria.length === 0) {
      const bullets = lines
        .map((l) => l.trim())
        .filter((l) => /^[-*]\s+/.test(l) || /^(given|when|then|and)\s/i.test(l))
        .map((l) => l.replace(/^[-*]\s*/, ""));
      criteria.push(...bullets.slice(0, 10));
    }

    return criteria;
  }

  private mapPriority(jiraPriority?: string): string {
    if (!jiraPriority) return "medium";
    const lower = jiraPriority.toLowerCase();
    if (lower.includes("critical") || lower.includes("blocker")) return "critical";
    if (lower.includes("high") || lower.includes("major")) return "high";
    if (lower.includes("low") || lower.includes("minor") || lower.includes("trivial")) return "low";
    return "medium";
  }
}
