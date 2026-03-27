import { readFile } from "node:fs/promises";
import { createLogger } from "@test-automation-mcp/core";
import { JiraConnector } from "@test-automation-mcp/connectors";
import { GitHubConnector } from "@test-automation-mcp/connectors";
import type { RequirementDocument } from "@test-automation-mcp/connectors";

const logger = createLogger("qa-input-reader");

// ─── Input types ──────────────────────────────────────────────────────────────

export interface TextInput {
  type: "text";
  /** Raw text: paste a user story, spec, or any description */
  content: string;
  title?: string;
}

export interface JiraInput {
  type: "jira";
  /** Full Jira issue URL or just the issue key, e.g. "PROJ-123" */
  issueKeyOrUrl: string;
  baseUrl: string;
  token: string;
  username?: string;
}

export interface GitHubInput {
  type: "github";
  /** owner/repo, e.g. "acme/my-app" */
  repo: string;
  /** Optional: specific issue number or PR number */
  issueNumber?: number;
  /** Optional: file/directory path to read for codebase context */
  path?: string;
  token?: string;
}

export interface FileInput {
  type: "file";
  /** Absolute or relative path to a .txt, .md, .pdf, or .docx file */
  filePath: string;
}

export type QAInput = TextInput | JiraInput | GitHubInput | FileInput;

// ─── Resolved context ─────────────────────────────────────────────────────────

export interface ResolvedContext {
  /** Human-readable title summarising what is being tested */
  title: string;
  /** Full text context passed to Claude */
  content: string;
  /** Source metadata */
  source: string;
  /** Any structured requirements extracted */
  requirements?: RequirementDocument[];
}

// ─── InputReader ──────────────────────────────────────────────────────────────

export class InputReader {
  /**
   * Reads from any input source and returns a normalised context
   * string ready to pass to the QA agent.
   */
  async read(input: QAInput): Promise<ResolvedContext> {
    switch (input.type) {
      case "text":
        return this.readText(input);
      case "jira":
        return this.readJira(input);
      case "github":
        return this.readGitHub(input);
      case "file":
        return this.readFile(input);
    }
  }

  // ─── Text ────────────────────────────────────────────────────────────────

  private readText(input: TextInput): ResolvedContext {
    return {
      title: input.title ?? "Pasted Requirement",
      content: input.content.trim(),
      source: "text",
    };
  }

  // ─── Jira ─────────────────────────────────────────────────────────────────

  private async readJira(input: JiraInput): Promise<ResolvedContext> {
    logger.info({ issue: input.issueKeyOrUrl }, "Fetching Jira issue");

    const connector = new JiraConnector();
    await connector.authenticate({
      type: "jira",
      baseUrl: input.baseUrl,
      auth: {
        type: input.username ? "basic" : "token",
        username: input.username,
        password: input.token,
        token: input.username ? undefined : input.token,
      },
    });

    // Extract issue key from URL if a full URL was passed
    const issueKey = this.extractJiraKey(input.issueKeyOrUrl);
    const doc = await connector.fetchSingle(issueKey);

    if (!doc) {
      throw new Error(`Jira issue not found: ${issueKey}`);
    }

    const content = this.formatRequirementDocument(doc);

    return {
      title: `${doc.externalId}: ${doc.title}`,
      content,
      source: `jira:${issueKey}`,
      requirements: [doc],
    };
  }

  // ─── GitHub ───────────────────────────────────────────────────────────────

  private async readGitHub(input: GitHubInput): Promise<ResolvedContext> {
    const baseUrl = "https://api.github.com";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (input.token) {
      headers["Authorization"] = `Bearer ${input.token}`;
    }

    // If a specific issue was requested
    if (input.issueNumber) {
      logger.info({ repo: input.repo, issue: input.issueNumber }, "Fetching GitHub issue");
      const connector = new GitHubConnector();
      await connector.authenticate({
        type: "github",
        baseUrl,
        auth: { type: "token", token: input.token ?? "" },
      });
      const doc = await connector.fetchSingle(
        `${input.repo}#${input.issueNumber}`
      );
      if (!doc) {
        throw new Error(`GitHub issue not found: ${input.repo}#${input.issueNumber}`);
      }
      return {
        title: `${doc.externalId}: ${doc.title}`,
        content: this.formatRequirementDocument(doc),
        source: `github:${input.repo}#${input.issueNumber}`,
        requirements: [doc],
      };
    }

    // Read codebase files/directories
    if (input.path) {
      logger.info({ repo: input.repo, path: input.path }, "Fetching GitHub codebase content");
      const content = await this.fetchGitHubPath(
        input.repo,
        input.path,
        headers
      );
      return {
        title: `Codebase: ${input.repo} — ${input.path}`,
        content,
        source: `github:${input.repo}/${input.path}`,
      };
    }

    // Fall back to reading the repo README as context
    logger.info({ repo: input.repo }, "Fetching GitHub repo README");
    const content = await this.fetchGitHubPath(input.repo, "README.md", headers);
    return {
      title: `Repository: ${input.repo}`,
      content,
      source: `github:${input.repo}`,
    };
  }

  private async fetchGitHubPath(
    repo: string,
    path: string,
    headers: Record<string, string>
  ): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}) for ${repo}/${path}`);
    }

    const data = await res.json() as unknown;

    // Single file — base64 encoded content
    if (
      typeof data === "object" &&
      data !== null &&
      "content" in data &&
      typeof (data as Record<string, unknown>).content === "string"
    ) {
      const encoded = ((data as Record<string, unknown>).content as string).replace(/\n/g, "");
      return Buffer.from(encoded, "base64").toString("utf-8");
    }

    // Directory listing — summarise the structure
    if (Array.isArray(data)) {
      const items = (data as Array<{ name: string; type: string }>)
        .map((item) => `${item.type === "dir" ? "[dir]" : "[file]"} ${item.name}`)
        .join("\n");
      return `Directory listing for ${repo}/${path}:\n${items}`;
    }

    return `Content retrieved from ${repo}/${path}`;
  }

  // ─── File ─────────────────────────────────────────────────────────────────

  private async readFile(input: FileInput): Promise<ResolvedContext> {
    logger.info({ filePath: input.filePath }, "Reading file");

    const ext = input.filePath.split(".").pop()?.toLowerCase() ?? "";

    if (["txt", "md", "yaml", "yml", "json"].includes(ext)) {
      const content = await readFile(input.filePath, "utf-8");
      return {
        title: input.filePath.split("/").pop() ?? "Document",
        content,
        source: `file:${input.filePath}`,
      };
    }

    if (ext === "pdf") {
      // PDF extraction — attempt basic text extraction
      const content = await this.extractPdfText(input.filePath);
      return {
        title: input.filePath.split("/").pop() ?? "PDF Document",
        content,
        source: `file:${input.filePath}`,
      };
    }

    // For unsupported types, read raw bytes and note the limitation
    const content = await readFile(input.filePath, "utf-8").catch(
      () => `[Binary file: ${input.filePath} — content cannot be extracted automatically]`
    );
    return {
      title: input.filePath.split("/").pop() ?? "Document",
      content,
      source: `file:${input.filePath}`,
    };
  }

  private async extractPdfText(filePath: string): Promise<string> {
    // Basic approach: read raw bytes and extract readable text fragments.
    // For production, swap this out for a proper PDF library (pdf-parse etc.)
    try {
      const buffer = await readFile(filePath);
      const text = buffer.toString("latin1");
      // Extract text between BT/ET markers (basic PDF text extraction)
      const matches = text.match(/BT[\s\S]*?ET/g) ?? [];
      const extracted = matches
        .join(" ")
        .replace(/[^\x20-\x7E\n]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return extracted.length > 100
        ? extracted
        : `[PDF content from ${filePath} — install pdf-parse for better extraction]`;
    } catch {
      return `[Could not read PDF: ${filePath}]`;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private extractJiraKey(issueKeyOrUrl: string): string {
    // Handle full URLs like https://company.atlassian.net/browse/PROJ-123
    const match = issueKeyOrUrl.match(/([A-Z]+-\d+)/);
    return match ? match[1] : issueKeyOrUrl;
  }

  private formatRequirementDocument(doc: RequirementDocument): string {
    const lines: string[] = [
      `# ${doc.title}`,
      `**ID:** ${doc.externalId}`,
      `**Type:** ${doc.type}`,
    ];

    if (doc.priority) lines.push(`**Priority:** ${doc.priority}`);
    if (doc.labels?.length) lines.push(`**Labels:** ${doc.labels.join(", ")}`);

    lines.push("", "## Description", doc.description || "(no description)");

    if (doc.acceptanceCriteria?.length) {
      lines.push("", "## Acceptance Criteria");
      for (const criterion of doc.acceptanceCriteria) {
        lines.push(`- ${criterion}`);
      }
    }

    return lines.join("\n");
  }
}
