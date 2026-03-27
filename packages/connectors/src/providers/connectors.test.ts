import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JiraConnector } from "./jira.js";
import { GitHubConnector } from "./github.js";
import type { ConnectorConfig } from "../connector.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
  });
}

// ─── JiraConnector ────────────────────────────────────────────────────────────

describe("JiraConnector", () => {
  let connector: JiraConnector;

  beforeEach(() => {
    connector = new JiraConnector();
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("authenticate", () => {
    it("sets Bearer header for token auth", async () => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token", token: "my-token" },
      });
      // Verify by making a fetch call and checking headers
      const fetchMock = mockFetch({ issues: [], total: 0, maxResults: 50 });
      vi.stubGlobal("fetch", fetchMock);
      await connector.fetchRequirements({ project: "PROJ" });
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-token");
    });

    it("sets Basic auth header for basic auth", async () => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "basic", username: "user@test.com", password: "api-token" },
      });
      const fetchMock = mockFetch({ issues: [], total: 0, maxResults: 50 });
      vi.stubGlobal("fetch", fetchMock);
      await connector.fetchRequirements({ project: "PROJ" });
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const expected = Buffer.from("user@test.com:api-token").toString("base64");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(`Basic ${expected}`);
    });

    it("throws when basic auth credentials are missing", async () => {
      await expect(connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "basic" },
      })).rejects.toThrow("username and password");
    });

    it("throws when token is missing for token auth", async () => {
      await expect(connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token" },
      })).rejects.toThrow("token");
    });
  });

  describe("testConnection", () => {
    beforeEach(async () => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token", token: "tok" },
      });
    });

    it("returns true when /myself responds ok", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      expect(await connector.testConnection()).toBe(true);
    });

    it("returns false when fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      expect(await connector.testConnection()).toBe(false);
    });
  });

  describe("fetchRequirements", () => {
    beforeEach(async () => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token", token: "tok" },
      });
    });

    it("returns mapped requirements from Jira issues", async () => {
      const jiraResponse = {
        total: 1,
        maxResults: 50,
        issues: [{
          key: "PROJ-1",
          id: "10001",
          fields: {
            summary: "User can log in",
            description: "The user should be able to log in.\nAcceptance Criteria\n- Valid credentials work\n- Invalid credentials are rejected",
            issuetype: { name: "Story" },
            priority: { name: "High" },
            labels: ["authentication"],
            status: { name: "In Progress" },
          },
        }],
      };
      vi.stubGlobal("fetch", mockFetch(jiraResponse));

      const docs = await connector.fetchRequirements({ project: "PROJ" });
      expect(docs).toHaveLength(1);
      expect(docs[0].externalId).toBe("PROJ-1");
      expect(docs[0].title).toBe("User can log in");
      expect(docs[0].source).toBe("jira");
      expect(docs[0].type).toBe("story");
      expect(docs[0].priority).toBe("high");
      expect(docs[0].labels).toContain("authentication");
    });

    it("builds JQL with project and labels", async () => {
      const fetchMock = mockFetch({ issues: [], total: 0, maxResults: 50 });
      vi.stubGlobal("fetch", fetchMock);

      await connector.fetchRequirements({
        project: "MYPROJ",
        labels: ["backend", "api"],
        status: ["Done"],
      });

      const [url] = fetchMock.mock.calls[0] as [string];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain(`project = "MYPROJ"`);
      expect(decoded).toContain(`labels in ("backend","api")`);
      expect(decoded).toContain(`status in ("Done")`);
    });

    it("throws on API error", async () => {
      vi.stubGlobal("fetch", mockFetch("Not Found", false, 404));
      await expect(connector.fetchRequirements({ project: "PROJ" })).rejects.toThrow("Jira API error (404)");
    });
  });

  describe("fetchSingle", () => {
    beforeEach(async () => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token", token: "tok" },
      });
    });

    it("returns null when issue not found", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
      const result = await connector.fetchSingle("PROJ-999");
      expect(result).toBeNull();
    });

    it("returns mapped document when issue found", async () => {
      const issue = {
        key: "PROJ-42",
        id: "10042",
        fields: {
          summary: "Fix login bug",
          description: "",
          issuetype: { name: "Bug" },
          priority: { name: "Critical" },
          labels: [],
          status: { name: "Open" },
        },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(issue),
      }));

      const doc = await connector.fetchSingle("PROJ-42");
      expect(doc).not.toBeNull();
      expect(doc!.externalId).toBe("PROJ-42");
      expect(doc!.type).toBe("bug");
      expect(doc!.priority).toBe("critical");
    });
  });

  describe("priority mapping", () => {
    it.each([
      ["Critical", "critical"],
      ["Blocker", "critical"],
      ["High", "high"],
      ["Major", "high"],
      ["Low", "low"],
      ["Minor", "low"],
      ["Trivial", "low"],
      ["Medium", "medium"],
      [undefined, "medium"],
    ])("maps Jira priority '%s' to '%s'", async (jiraPriority, expected) => {
      await connector.authenticate({
        baseUrl: "https://example.atlassian.net",
        auth: { type: "token", token: "tok" },
      });
      const issue = {
        key: "T-1",
        id: "1",
        fields: {
          summary: "Test",
          description: "",
          issuetype: { name: "Task" },
          priority: jiraPriority ? { name: jiraPriority } : undefined,
          labels: [],
          status: { name: "Open" },
        },
      };
      vi.stubGlobal("fetch", mockFetch({
        issues: [issue],
        total: 1,
        maxResults: 50,
      }));

      const docs = await connector.fetchRequirements({});
      expect(docs[0].priority).toBe(expected);
    });
  });
});

// ─── GitHubConnector ──────────────────────────────────────────────────────────

describe("GitHubConnector", () => {
  let connector: GitHubConnector;

  beforeEach(async () => {
    connector = new GitHubConnector();
    await connector.authenticate({
      baseUrl: "https://api.github.com",
      auth: { type: "token", token: "gh-token" },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("testConnection", () => {
    it("returns true when /user responds ok", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      expect(await connector.testConnection()).toBe(true);
    });

    it("returns false when fetch throws", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      expect(await connector.testConnection()).toBe(false);
    });
  });

  describe("fetchRequirements", () => {
    it("returns mapped requirements from GitHub issues", async () => {
      const issues = [
        {
          id: 1001,
          number: 42,
          title: "Add OAuth support",
          body: "We need OAuth 2.0 login",
          labels: [{ name: "enhancement" }, { name: "auth" }],
          state: "open",
        },
        {
          id: 1002,
          number: 43,
          title: "Fix broken UI",
          body: null,
          labels: [],
          state: "open",
        },
      ];
      vi.stubGlobal("fetch", mockFetch(issues));

      const docs = await connector.fetchRequirements({ project: "org/repo" });
      expect(docs).toHaveLength(2);
      expect(docs[0].externalId).toBe("#42");
      expect(docs[0].title).toBe("Add OAuth support");
      expect(docs[0].source).toBe("github");
      expect(docs[0].labels).toEqual(["enhancement", "auth"]);
      expect(docs[1].description).toBe("");
    });

    it("filters out pull requests", async () => {
      const data = [
        { id: 1, number: 10, title: "Feature", body: "", labels: [], state: "open" },
        { id: 2, number: 11, title: "PR", body: "", labels: [], state: "open", pull_request: { url: "..." } },
      ];
      vi.stubGlobal("fetch", mockFetch(data));

      const docs = await connector.fetchRequirements({ project: "org/repo" });
      expect(docs).toHaveLength(1);
      expect(docs[0].externalId).toBe("#10");
    });

    it("throws when project is not provided", async () => {
      await expect(connector.fetchRequirements({})).rejects.toThrow("owner/repo");
    });

    it("includes labels in query string", async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal("fetch", fetchMock);

      await connector.fetchRequirements({ project: "org/repo", labels: ["bug", "p0"] });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("labels=");
      expect(decodeURIComponent(url)).toContain("bug,p0");
    });

    it("throws on API error", async () => {
      vi.stubGlobal("fetch", mockFetch("Forbidden", false, 403));
      await expect(connector.fetchRequirements({ project: "org/repo" })).rejects.toThrow(
        "GitHub API error (403)"
      );
    });

    it("uses Bearer token in Authorization header", async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal("fetch", fetchMock);

      await connector.fetchRequirements({ project: "org/repo" });

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer gh-token");
    });
  });

  describe("fetchSingle", () => {
    it("always returns null (not yet implemented)", async () => {
      const result = await connector.fetchSingle("42");
      expect(result).toBeNull();
    });
  });
});
