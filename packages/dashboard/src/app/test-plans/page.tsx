"use client";

import { useEffect, useRef, useState } from "react";
import { getTestPlans, getTestPlan, approveTestPlan, generateTests, runTests, createRunWebSocket } from "../../lib/api";

interface PlanRow { id: string; status: string; createdAt: string; documentId?: string; generatedCount?: number }
interface PlanDetail { planJson: { plan: { testCases: Array<{ id: string; name: string; type: string; priority: string; targetSystems: string[]; estimatedDuration: number }>; estimatedDuration: number } }; requirementsJson: Array<{ id: string; title: string; priority: string; targetSystem: string }> | null }

interface RunLogEntry {
  type: string;
  testName?: string;
  status?: string;
  error?: string;
  message?: string;
}

interface ActiveRun {
  id: string;
  log: RunLogEntry[];
  runStatus: "running" | "completed" | "failed";
  testCount: number;
  completed: number;
}

export default function TestPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<(PlanRow & PlanDetail) | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const refresh = () => {
    getTestPlans().then((d) => setPlans(d.testPlans)).catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeRun?.log]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  const viewPlan = async (id: string) => {
    try {
      const data = await getTestPlan(id);
      setSelectedPlan(data as unknown as PlanRow & PlanDetail);
      setActiveRun(null);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to load plan" });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveTestPlan(id);
      setMessage({ type: "success", text: "Test plan approved!" });
      refresh();
      if (selectedPlan?.id === id) viewPlan(id);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Approval failed" });
    }
  };

  const handleGenerate = async (id: string) => {
    setLoading(true);
    try {
      const result = await generateTests(id) as { generated: Array<{ id: string; name: string }> };
      setMessage({ type: "success", text: `${result.generated.length} test(s) generated! You can now run the tests.` });
      refresh();
      if (selectedPlan?.id === id) {
        const updated = await getTestPlan(id);
        setSelectedPlan({ ...(updated as unknown as PlanRow & PlanDetail), generatedCount: result.generated.length });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Generation failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (id: string) => {
    if (!selectedPlan?.generatedCount) {
      setMessage({ type: "error", text: "Generate tests first before running." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await runTests(id);

      setActiveRun({
        id: result.runId,
        log: [{ type: "started", message: `Run started — ${result.testCount} test(s) queued` }],
        runStatus: "running",
        testCount: result.testCount,
        completed: 0,
      });

      wsRef.current?.close();
      wsRef.current = createRunWebSocket(result.runId, (data) => {
        if (data.type === "test_completed") {
          setActiveRun((prev) =>
            prev
              ? {
                  ...prev,
                  completed: prev.completed + 1,
                  log: [...prev.log, { type: "test_completed", testName: data.testName as string, status: data.status as string }],
                }
              : prev
          );
        } else if (data.type === "run_completed") {
          setActiveRun((prev) =>
            prev ? { ...prev, runStatus: "completed", log: [...prev.log, { type: "done", message: "All tests finished." }] } : prev
          );
          wsRef.current?.close();
          refresh();
        } else if (data.type === "run_failed") {
          setActiveRun((prev) =>
            prev
              ? { ...prev, runStatus: "failed", log: [...prev.log, { type: "error", error: data.error as string }] }
              : prev
          );
          wsRef.current?.close();
        }
      });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Run failed" });
    } finally {
      setLoading(false);
    }
  };

  const priorityColor: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-blue-100 text-blue-700",
    low: "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Plans</h1>
      <p className="text-gray-500 mb-8">Review, approve, and generate tests from AI-created plans</p>

      {message && (
        <div className={`rounded-xl p-4 mb-6 ${message.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">All Plans</h2>
            </div>
            {plans.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No test plans yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {plans.map((plan) => (
                  <button key={plan.id} onClick={() => viewPlan(plan.id)} className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedPlan?.id === plan.id ? "bg-blue-50" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 truncate">{plan.id.slice(0, 8)}...</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.status === "approved" ? "bg-green-100 text-green-700" : plan.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{plan.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{new Date(plan.createdAt).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {selectedPlan ? (
            <>
              {/* Plan Details */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Plan Details</h2>
                    <p className="text-xs text-gray-500">{selectedPlan.id}</p>
                  </div>
                  <div className="flex gap-2">
                    {(selectedPlan.status === "pending" || selectedPlan.status === "draft") && (
                      <button onClick={() => handleApprove(selectedPlan.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">Approve</button>
                    )}
                    {(selectedPlan.status === "pending" || selectedPlan.status === "draft" || selectedPlan.status === "approved") && (
                      <button onClick={() => handleGenerate(selectedPlan.id)} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {loading ? "Generating..." : "Generate Tests"}
                      </button>
                    )}
                    {selectedPlan.generatedCount && selectedPlan.generatedCount > 0 ? (
                      <button
                        onClick={() => handleRun(selectedPlan.id)}
                        disabled={loading || activeRun?.runStatus === "running"}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        {activeRun?.runStatus === "running" ? "Running..." : "Run Tests"}
                      </button>
                    ) : (
                      <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed" title="Generate tests first">Run Tests</button>
                    )}
                  </div>
                </div>

                {selectedPlan.planJson?.plan?.testCases && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Test Cases ({selectedPlan.planJson.plan.testCases.length})</h3>
                    <div className="space-y-2">
                      {selectedPlan.planJson.plan.testCases.map((tc) => (
                        <div key={tc.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-gray-500">{tc.id}</span>
                            <span className="text-sm text-gray-900">{tc.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[tc.priority] ?? priorityColor.medium}`}>{tc.priority}</span>
                            <span className="text-xs text-gray-500">{tc.type}</span>
                            <span className="text-xs text-gray-400">{tc.targetSystems.join(", ")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Estimated duration: {Math.round((selectedPlan.planJson.plan.estimatedDuration ?? 0) / 1000)}s</p>
                  </div>
                )}
              </div>

              {/* Live Execution Progress */}
              {activeRun ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Execution Progress</h3>
                    <div className="flex items-center gap-3">
                      {activeRun.runStatus === "running" && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Running
                        </span>
                      )}
                      {activeRun.runStatus === "completed" && (
                        <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Completed
                        </span>
                      )}
                      {activeRun.runStatus === "failed" && (
                        <span className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Failed
                        </span>
                      )}
                      {activeRun.testCount > 0 && (
                        <span className="text-xs text-gray-500">{activeRun.completed} / {activeRun.testCount} tests</span>
                      )}
                    </div>
                  </div>

                  {activeRun.testCount > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${activeRun.runStatus === "failed" ? "bg-red-500" : activeRun.runStatus === "completed" ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${(activeRun.completed / activeRun.testCount) * 100}%` }}
                      />
                    </div>
                  )}

                  <div className="bg-gray-950 rounded-lg p-4 h-56 overflow-y-auto font-mono text-xs space-y-1">
                    {activeRun.log.map((entry, i) => {
                      if (entry.type === "started") {
                        return <p key={i} className="text-blue-400">&gt; {entry.message}</p>;
                      }
                      if (entry.type === "test_completed") {
                        const cls = entry.status === "success" ? "text-green-400" : entry.status === "failure" ? "text-red-400" : "text-orange-400";
                        const icon = entry.status === "success" ? "✓" : "✗";
                        return <p key={i} className={cls}>{icon} [{entry.status?.toUpperCase()}] {entry.testName}</p>;
                      }
                      if (entry.type === "error") {
                        return <p key={i} className="text-red-400">✗ Run error: {entry.error}</p>;
                      }
                      if (entry.type === "done") {
                        return <p key={i} className="text-green-400 font-semibold">&gt; {entry.message}</p>;
                      }
                      return <p key={i} className="text-gray-400">{entry.message}</p>;
                    })}
                    <div ref={logEndRef} />
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Run ID: <span className="font-mono">{activeRun.id}</span> —{" "}
                    <a href="/runs" className="text-blue-500 hover:underline">View full results in Test Runs</a>
                  </p>
                </div>
              ) : (
                selectedPlan.generatedCount && selectedPlan.generatedCount > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <p className="text-sm text-gray-400">Click <span className="font-medium text-gray-600">Run Tests</span> to execute and monitor live progress here</p>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400 text-sm">
              Select a test plan to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
