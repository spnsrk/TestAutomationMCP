"use client";

import { useEffect, useState } from "react";
import { getRuns, getRun } from "../../lib/api";

interface RunRow {
  id: string;
  status: string;
  environment: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  resultsSummaryJson: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    passRate: number;
    simulated?: boolean;
    analysis?: string;
    recommendations?: string[];
    failures?: Array<{ testName: string; rootCause: string; category: string }>;
  } | null;
}

interface StepResult {
  stepName: string;
  status: string;
  toolResult?: { error?: { message: string; code?: string } };
}

interface TestResult {
  id: string;
  testId: string;
  testName: string;
  status: string;
  duration: number;
  result?: { error?: string; stepResults?: StepResult[] };
  createdAt: string;
}

interface RunDetail extends RunRow {
  results: TestResult[];
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selected, setSelected] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getRuns().then((d) => setRuns((d.results ?? []) as unknown as RunRow[])).catch(() => {});
  }, []);

  const viewRun = async (id: string) => {
    try {
      // API returns { run: {...}, results: [...] } — flatten it
      const data = await getRun(id) as unknown as { run: RunRow; results: TestResult[] };
      setSelected({ ...data.run, results: data.results ?? [] });
      setExpanded(new Set());
    } catch {
      setSelected(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const statusColor: Record<string, string> = {
    completed: "bg-green-500",
    running: "bg-amber-500 animate-pulse",
    failed: "bg-red-500",
    queued: "bg-gray-400",
  };

  const resultBadge = (status: string) => {
    if (status === "success") return "bg-green-100 text-green-700";
    if (status === "failure") return "bg-red-100 text-red-700";
    if (status === "error") return "bg-orange-100 text-orange-700";
    return "bg-gray-100 text-gray-600";
  };

  const resultDot = (status: string) => {
    if (status === "success") return "bg-green-500";
    if (status === "failure") return "bg-red-500";
    if (status === "error") return "bg-orange-500";
    return "bg-gray-400";
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Runs</h1>
      <p className="text-gray-500 mb-8">Monitor test execution and view detailed results</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">All Runs</h2>
            </div>
            {runs.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No test runs yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <button key={run.id} onClick={() => viewRun(run.id)} className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selected?.id === run.id ? "bg-blue-50" : ""}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${statusColor[run.status] ?? "bg-gray-400"}`} />
                      <span className="text-sm font-medium text-gray-900">{run.status}</span>
                      <span className="text-xs text-gray-400">{run.environment}</span>
                    </div>
                    <p className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</p>
                    {run.resultsSummaryJson && (
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="text-green-600">{run.resultsSummaryJson.passed} passed</span>
                        {run.resultsSummaryJson.failed > 0 && <span className="text-red-600">{run.resultsSummaryJson.failed} failed</span>}
                        {run.resultsSummaryJson.errors > 0 && <span className="text-orange-600">{run.resultsSummaryJson.errors} errors</span>}
                        <span className="text-gray-400">{run.resultsSummaryJson.passRate?.toFixed(0)}%</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Run Summary</h2>
                  {selected.resultsSummaryJson?.simulated && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">Simulated (no gateway)</span>
                  )}
                </div>
                {selected.resultsSummaryJson ? (
                  <div>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="text-center p-3 rounded-lg bg-gray-50">
                        <p className="text-2xl font-bold text-gray-900">{selected.resultsSummaryJson.total}</p>
                        <p className="text-xs text-gray-500">Total</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-green-50">
                        <p className="text-2xl font-bold text-green-700">{selected.resultsSummaryJson.passed}</p>
                        <p className="text-xs text-green-600">Passed</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50">
                        <p className="text-2xl font-bold text-red-700">{selected.resultsSummaryJson.failed}</p>
                        <p className="text-xs text-red-600">Failed</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-orange-50">
                        <p className="text-2xl font-bold text-orange-700">{selected.resultsSummaryJson.errors}</p>
                        <p className="text-xs text-orange-600">Errors</p>
                      </div>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
                      <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${selected.resultsSummaryJson.passRate ?? 0}%` }} />
                    </div>

                    {selected.resultsSummaryJson.analysis && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs font-semibold text-blue-700 mb-1">AI Analysis</p>
                        <p className="text-sm text-blue-800">{selected.resultsSummaryJson.analysis}</p>
                      </div>
                    )}

                    {selected.resultsSummaryJson.recommendations && selected.resultsSummaryJson.recommendations.length > 0 && (
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Recommendations</h3>
                        <ul className="space-y-1">
                          {selected.resultsSummaryJson.recommendations.map((rec, i) => (
                            <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                              <span className="text-blue-500 mt-0.5">&#8226;</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">{selected.status === "running" ? "Test execution in progress..." : "No results available"}</p>
                )}
              </div>

              {selected.results && selected.results.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Results ({selected.results.length})</h2>
                  <div className="space-y-2">
                    {selected.results.map((r, i) => (
                      <div key={`${r.id ?? r.testId}-${i}`} className="rounded-lg border border-gray-100 overflow-hidden">
                        <button
                          onClick={() => toggleExpand(`${r.id}-${i}`)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${resultDot(r.status)}`} />
                            <span className="text-sm text-gray-900 truncate">{r.testName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <span className="text-xs text-gray-500">{r.duration}ms</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultBadge(r.status)}`}>{r.status}</span>
                            <span className="text-xs text-gray-400">{expanded.has(`${r.id}-${i}`) ? "▲" : "▼"}</span>
                          </div>
                        </button>

                        {expanded.has(`${r.id}-${i}`) && (
                          <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                            {r.result?.error && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700 font-mono break-all">
                                <span className="font-semibold">Error: </span>{r.result.error}
                              </div>
                            )}
                            {r.result?.stepResults && r.result.stepResults.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-gray-600 mb-1">Steps:</p>
                                <div className="space-y-1">
                                  {r.result.stepResults.map((step, si) => (
                                    <div key={si} className="flex items-start gap-2 text-xs">
                                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${resultDot(step.status)}`} />
                                      <div className="min-w-0">
                                        <span className="text-gray-700">{step.stepName}</span>
                                        {step.toolResult?.error && (
                                          <p className="text-red-600 font-mono break-all mt-0.5">{step.toolResult.error.message}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!r.result?.error && (!r.result?.stepResults || r.result.stepResults.length === 0) && (
                              <p className="mt-2 text-xs text-gray-400">No detail available</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400 text-sm">
              Select a run to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
