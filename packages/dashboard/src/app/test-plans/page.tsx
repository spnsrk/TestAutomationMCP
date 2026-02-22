"use client";

import { useEffect, useState } from "react";
import { getTestPlans, getTestPlan, approveTestPlan, generateTests, runTests } from "../../lib/api";

interface PlanRow { id: string; status: string; createdAt: string; documentId?: string }
interface PlanDetail { planJson: { plan: { testCases: Array<{ id: string; name: string; type: string; priority: string; targetSystems: string[]; estimatedDuration: number }>; estimatedDuration: number } }; requirementsJson: Array<{ id: string; title: string; priority: string; targetSystem: string }> | null }

export default function TestPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<(PlanRow & PlanDetail) | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = () => {
    getTestPlans().then((d) => setPlans(d.testPlans)).catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const viewPlan = async (id: string) => {
    const data = await getTestPlan(id);
    setSelectedPlan(data as unknown as PlanRow & PlanDetail);
  };

  const handleApprove = async (id: string) => {
    await approveTestPlan(id);
    setMessage({ type: "success", text: "Test plan approved!" });
    refresh();
    if (selectedPlan?.id === id) viewPlan(id);
  };

  const handleGenerate = async (id: string) => {
    setLoading(true);
    try {
      const result = await generateTests(id) as { generated: Array<{ id: string; name: string }> };
      setMessage({ type: "success", text: `${result.generated.length} test(s) generated!` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Generation failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (id: string) => {
    setLoading(true);
    try {
      const result = await runTests(id);
      setMessage({ type: "success", text: `Test run started! Run ID: ${result.runId}` });
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

        <div className="lg:col-span-2">
          {selectedPlan ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Plan Details</h2>
                  <p className="text-xs text-gray-500">{selectedPlan.id}</p>
                </div>
                <div className="flex gap-2">
                  {selectedPlan.status === "draft" && (
                    <button onClick={() => handleApprove(selectedPlan.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">Approve</button>
                  )}
                  {(selectedPlan.status === "draft" || selectedPlan.status === "approved") && (
                    <button onClick={() => handleGenerate(selectedPlan.id)} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">Generate Tests</button>
                  )}
                  <button onClick={() => handleRun(selectedPlan.id)} disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">Run Tests</button>
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
