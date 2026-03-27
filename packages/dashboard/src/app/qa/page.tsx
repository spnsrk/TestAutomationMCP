"use client";

import { useEffect, useRef, useState } from "react";
import { startQARun, getQARun, getQARuns, createQAWebSocket } from "../../lib/api";

type InputTab = "text" | "jira" | "github" | "file";
type RunStatus = "idle" | "running" | "completed" | "failed";

interface LiveEvent {
  type: string;
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  status?: string;
  durationMs?: number;
  message?: string;
}

interface QASummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  passRate: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface QARunRow {
  id: string;
  title: string;
  source: string;
  status: string;
  createdAt: string;
  summary?: QASummary;
  errorMessage?: string;
}

interface QARunDetail extends QARunRow {
  reportMarkdown?: string;
  report?: {
    narrative: string;
    testCases: Array<{ name: string; status: string; failureReason?: string }>;
    recommendations: string[];
    summary: QASummary;
  };
}

const riskColors: Record<string, string> = {
  LOW: "bg-green-100 text-green-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  running: "bg-amber-500 animate-pulse",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

export default function QAPage() {
  const [tab, setTab] = useState<InputTab>("text");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QARunDetail | null>(null);
  const [pastRuns, setPastRuns] = useState<QARunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Form state
  const [textContent, setTextContent] = useState("");
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubIssue, setGithubIssue] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [environment, setEnvironment] = useState("default");
  const [model, setModel] = useState("claude-opus-4-6");

  useEffect(() => {
    getQARuns().then((d) => setPastRuns((d as unknown as { runs: QARunRow[] }).runs)).catch(() => {});
  }, []);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const buildInput = () => {
    switch (tab) {
      case "text":
        return { type: "text" as const, content: textContent };
      case "jira":
        return { type: "jira" as const, issueKeyOrUrl: jiraUrl, baseUrl: jiraBaseUrl, token: jiraToken };
      case "github":
        return {
          type: "github" as const,
          repo: githubRepo,
          issueNumber: githubIssue ? parseInt(githubIssue, 10) : undefined,
          token: githubToken || undefined,
        };
      default:
        return { type: "text" as const, content: textContent };
    }
  };

  const handleRun = async () => {
    setError(null);
    setEvents([]);
    setDetail(null);
    setRunStatus("running");

    try {
      const res = await startQARun({ input: buildInput(), environment, model }) as { runId: string; title: string };
      const runId = res.runId;
      setCurrentRunId(runId);

      // Subscribe to live WebSocket events
      const ws = createQAWebSocket(runId, (data: Record<string, unknown>) => {
        const event = data as unknown as LiveEvent;
        setEvents((prev) => [...prev, event]);

        if (event.type === "completed") {
          setRunStatus("completed");
          getQARun(runId).then((d) => {
            setDetail(d as unknown as QARunDetail);
            setPastRuns((prev) => [{ id: runId, title: res.title, source: tab, status: "completed", createdAt: new Date().toISOString() }, ...prev]);
          }).catch(() => {});
          ws.close();
        }

        if (event.type === "error") {
          setRunStatus("failed");
          setError(event.message ?? "Unknown error");
          ws.close();
        }
      });
      wsRef.current = ws;
    } catch (err) {
      setRunStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to start QA run");
    }
  };

  const viewPastRun = async (id: string) => {
    try {
      const d = await getQARun(id);
      setDetail(d as unknown as QARunDetail);
      setCurrentRunId(id);
    } catch { /* ignore */ }
  };

  const tabs: { id: InputTab; label: string }[] = [
    { id: "text", label: "Paste Text" },
    { id: "jira", label: "Jira Story" },
    { id: "github", label: "GitHub" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-1">AI QA Engineer</h1>
        <p className="text-gray-500">Paste a requirement, Jira story, or GitHub issue and let Claude test it like a senior QA engineer.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Input Panel ─────────────────────────────────────────────── */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">What to test</h2>

            {/* Tab selector */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Text input */}
            {tab === "text" && (
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste a user story, solution document, acceptance criteria, or any description of what needs to be tested..."
                className="w-full h-40 text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {/* Jira input */}
            {tab === "jira" && (
              <div className="space-y-3">
                <input value={jiraUrl} onChange={(e) => setJiraUrl(e.target.value)} placeholder="Issue key or URL (e.g. PROJ-123)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={jiraBaseUrl} onChange={(e) => setJiraBaseUrl(e.target.value)} placeholder="Jira base URL (e.g. https://org.atlassian.net)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={jiraToken} onChange={(e) => setJiraToken(e.target.value)} type="password" placeholder="API token" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* GitHub input */}
            {tab === "github" && (
              <div className="space-y-3">
                <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="owner/repo (e.g. acme/my-app)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={githubIssue} onChange={(e) => setGithubIssue(e.target.value)} placeholder="Issue number (optional)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input value={githubToken} onChange={(e) => setGithubToken(e.target.value)} type="password" placeholder="GitHub token (optional, for private repos)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Options */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Environment</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="default">default</option>
                  <option value="staging">staging</option>
                  <option value="production">production</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Model</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <button
              onClick={handleRun}
              disabled={runStatus === "running"}
              className="mt-4 w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runStatus === "running" ? "Running QA Analysis..." : "Run QA Analysis"}
            </button>
          </div>

          {/* Past runs */}
          {pastRuns.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm">Past Runs</h3>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {pastRuns.slice(0, 10).map((run) => (
                  <button
                    key={run.id}
                    onClick={() => viewPastRun(run.id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${currentRunId === run.id ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[run.status] ?? "bg-gray-400"}`} />
                      <span className="text-xs font-medium text-gray-900 truncate">{run.title}</span>
                    </div>
                    <p className="text-xs text-gray-400 pl-4">{new Date(run.createdAt).toLocaleString()}</p>
                    {run.summary && (
                      <div className="flex gap-2 mt-1 pl-4 text-xs">
                        <span className="text-green-600">{run.summary.passed} pass</span>
                        {run.summary.failed > 0 && <span className="text-red-600">{run.summary.failed} fail</span>}
                        <span className={`px-1.5 rounded-full font-medium ${riskColors[run.summary.riskLevel] ?? ""}`}>{run.summary.riskLevel}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel: Live + Report ───────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Live activity feed */}
          {(runStatus === "running" || events.length > 0) && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-2 p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Live Activity</h2>
                {runStatus === "running" && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Running
                  </span>
                )}
              </div>
              <div className="p-4 font-mono text-xs space-y-1.5 max-h-64 overflow-y-auto">
                {events.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {ev.type === "thinking" && (
                      <p className="text-gray-600 leading-relaxed">{ev.text}</p>
                    )}
                    {ev.type === "tool_call" && (
                      <p className="text-blue-600">
                        <span className="font-semibold">→ {ev.tool}</span>
                        {ev.input && Object.keys(ev.input).length > 0 && (
                          <span className="text-gray-400 ml-2">{JSON.stringify(ev.input).slice(0, 80)}</span>
                        )}
                      </p>
                    )}
                    {ev.type === "tool_result" && (
                      <p className={ev.status === "error" ? "text-red-500" : "text-green-600"}>
                        {ev.status === "error" ? "✗" : "✓"} {ev.tool} <span className="text-gray-400">({ev.durationMs}ms)</span>
                      </p>
                    )}
                    {ev.type === "error" && (
                      <p className="text-red-600 font-semibold">Error: {ev.message}</p>
                    )}
                  </div>
                ))}
                <div ref={eventsEndRef} />
              </div>
            </div>
          )}

          {/* Report */}
          {detail?.report && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">{detail.title}</h2>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${riskColors[detail.report.summary.riskLevel] ?? ""}`}>
                    Risk: {detail.report.summary.riskLevel}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-3 mb-4">
                  {[
                    { label: "Total", value: detail.report.summary.total, color: "gray" },
                    { label: "Passed", value: detail.report.summary.passed, color: "green" },
                    { label: "Failed", value: detail.report.summary.failed, color: "red" },
                    { label: "Errors", value: detail.report.summary.errors, color: "orange" },
                    { label: "Pass Rate", value: `${detail.report.summary.passRate}%`, color: "blue" },
                  ].map((s) => (
                    <div key={s.label} className={`text-center p-3 rounded-lg bg-${s.color}-50`}>
                      <p className={`text-xl font-bold text-${s.color}-700`}>{s.value}</p>
                      <p className={`text-xs text-${s.color}-500`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Pass rate bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${detail.report.summary.passRate}%` }}
                  />
                </div>
              </div>

              {/* Test cases */}
              {detail.report.testCases.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Test Cases</h3>
                  <div className="space-y-2">
                    {detail.report.testCases.map((tc, i) => (
                      <div key={i} className="flex items-start justify-between p-3 rounded-lg border border-gray-100">
                        <div className="flex items-start gap-3">
                          <span className={`text-sm font-bold mt-0.5 ${tc.status === "PASS" ? "text-green-500" : tc.status === "FAIL" ? "text-red-500" : "text-gray-400"}`}>
                            {tc.status === "PASS" ? "✓" : tc.status === "FAIL" ? "✗" : "○"}
                          </span>
                          <div>
                            <p className="text-sm text-gray-900">{tc.name}</p>
                            {tc.failureReason && <p className="text-xs text-red-600 mt-0.5">{tc.failureReason}</p>}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tc.status === "PASS" ? "bg-green-100 text-green-700" : tc.status === "FAIL" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                          {tc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {detail.report.recommendations.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Recommendations</h3>
                  <ul className="space-y-2">
                    {detail.report.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full narrative */}
              {detail.report.narrative && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3">Full Analysis</h3>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {detail.report.narrative}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {runStatus === "idle" && !detail && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-16 text-center text-gray-400">
              <p className="text-lg mb-2">Ready to test</p>
              <p className="text-sm">Enter a requirement on the left and click Run QA Analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
