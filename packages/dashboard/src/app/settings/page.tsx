"use client";

import { useEffect, useState } from "react";
import { getLLMConfig, getStatus } from "../../lib/api";

export default function SettingsPage() {
  const [llm, setLlm] = useState<{ provider: string; model: string; available: boolean } | null>(null);
  const [platform, setPlatform] = useState<{ status: string; version: string } | null>(null);

  useEffect(() => {
    getLLMConfig().then(setLlm).catch(() => {});
    getStatus().then(setPlatform).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-gray-500 mb-8">Configure the platform, LLM provider, and environments</p>

      <div className="space-y-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${platform?.status === "healthy" ? "bg-green-500" : "bg-red-500"}`} />
                {platform?.status ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Version</p>
              <p className="text-sm font-medium text-gray-900">{platform?.version ?? "N/A"}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">AI / LLM Configuration</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Provider</p>
              <p className="text-sm font-medium text-gray-900">{llm?.provider ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Model</p>
              <p className="text-sm font-medium text-gray-900">{llm?.model ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-sm font-medium flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${llm?.available ? "bg-green-500" : "bg-red-500"}`} />
                {llm?.available ? "Connected" : "Not available"}
              </p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Configure via environment variables:</p>
            <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">{`LLM_PROVIDER=ollama    # ollama, openai, anthropic, azure-openai
LLM_MODEL=llama3       # model name
LLM_BASE_URL=http://localhost:11434  # provider URL
LLM_API_KEY=           # API key (for cloud providers)`}</pre>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Environments</h2>
          <div className="space-y-3">
            {[
              { name: "default", desc: "Local development environment", status: "active" },
              { name: "staging", desc: "Staging environment", status: "configured" },
              { name: "production", desc: "Production environment", status: "not configured" },
            ].map((env) => (
              <div key={env.name} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">{env.name}</p>
                  <p className="text-xs text-gray-500">{env.desc}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${env.status === "active" ? "bg-green-100 text-green-700" : env.status === "configured" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>{env.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Supported Document Formats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { ext: "PDF", desc: "Functional design docs, specs" },
              { ext: "DOCX", desc: "Word documents, requirements" },
              { ext: "XLSX", desc: "Test case spreadsheets" },
              { ext: "TXT/MD", desc: "Plain text, markdown" },
            ].map((fmt) => (
              <div key={fmt.ext} className="p-3 rounded-lg bg-gray-50 text-center">
                <p className="text-sm font-bold text-gray-700">{fmt.ext}</p>
                <p className="text-xs text-gray-500 mt-1">{fmt.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
