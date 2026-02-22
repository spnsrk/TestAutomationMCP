"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStatus, getResults } from "../lib/api";

interface Stats { totalRuns: number; completedRuns: number; runningRuns: number }
interface RunSummary { id: string; status: string; environment: string; createdAt: string; resultsSummaryJson?: { total: number; passed: number; failed: number; passRate: number } | null }

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStatus()
      .then((data) => setStats(data.stats as unknown as Stats))
      .catch(() => setError("API server not available. Start it with: node packages/api-server/dist/index.js"));
    getResults()
      .then((data) => setRecentRuns((data.results ?? []).slice(0, 5) as unknown as RunSummary[]))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-gray-500 mb-8">Test Automation MCP Platform overview</p>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
          <p className="text-yellow-800 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <StatCard label="Total Runs" value={stats?.totalRuns ?? 0} color="blue" />
        <StatCard label="Completed" value={stats?.completedRuns ?? 0} color="green" />
        <StatCard label="Running" value={stats?.runningRuns ?? 0} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/documents" className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center text-lg">+</div>
              <div>
                <p className="font-medium text-gray-900">Upload Requirements</p>
                <p className="text-sm text-gray-500">Upload FDD, Jira stories, or paste requirements</p>
              </div>
            </Link>
            <Link href="/runs" className="flex items-center gap-3 p-4 rounded-lg bg-green-50 hover:bg-green-100 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-green-600 text-white flex items-center justify-center text-lg">&#9654;</div>
              <div>
                <p className="font-medium text-gray-900">View Test Runs</p>
                <p className="text-sm text-gray-500">Monitor executions and results</p>
              </div>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Runs</h2>
          {recentRuns.length === 0 ? (
            <p className="text-gray-400 text-sm">No test runs yet. Upload a document to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <Link key={run.id} href={`/runs?id=${run.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${run.status === "completed" ? "bg-green-500" : run.status === "running" ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-sm font-medium text-gray-900">{run.environment}</span>
                  </div>
                  <div className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div className={`rounded-xl border p-6 ${colors[color] ?? colors.blue}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
