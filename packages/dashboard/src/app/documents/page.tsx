"use client";

import { useCallback, useEffect, useState } from "react";
import { uploadDocument, submitText, getDocuments, createTestPlan, getConnections, importFromConnector } from "../../lib/api";
import Link from "next/link";

interface DocRow { id: string; name: string; type: string; status: string; createdAt: string }
interface Connection { type: string; status: string; connectedUser: string | null; instanceUrl: string | null }

const CONNECTOR_LABELS: Record<string, string> = {
  salesforce: "Salesforce",
  jira: "Jira",
  github: "GitHub",
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [mode, setMode] = useState<"upload" | "paste" | "import">("upload");
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [importMaxResults, setImportMaxResults] = useState("20");
  const [importQuery, setImportQuery] = useState("");
  const [importConnector, setImportConnector] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getDocuments().then((d) => setDocs(d.documents)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    getConnections()
      .then((d) => {
        const connected = (d as unknown as { connections: Connection[] }).connections.filter((c) => c.status === "connected");
        setConnections(connected);
        if (connected.length > 0 && !importConnector) setImportConnector(connected[0].type);
      })
      .catch(() => {});
  }, [refresh, importConnector]);

  const handleFile = async (file: File) => {
    setLoading(true);
    setMessage(null);
    try {
      await uploadDocument(file);
      setMessage({ type: "success", text: `"${file.name}" uploaded and parsed successfully.` });
      refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    if (!pasteText.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      await submitText(pasteText, pasteTitle || undefined);
      setMessage({ type: "success", text: "Requirements submitted and parsed!" });
      setPasteText("");
      setPasteTitle("");
      refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Submit failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importConnector) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = await importFromConnector(importConnector, {
        maxResults: parseInt(importMaxResults, 10) || 20,
        query: importQuery.trim() || undefined,
      });
      setMessage({ type: "success", text: `Imported ${result.importedCount} items from ${CONNECTOR_LABELS[importConnector] ?? importConnector}. Extracted ${result.extractedRequirements} requirements.` });
      refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (docId: string) => {
    setCreatingPlan(docId);
    setMessage(null);
    try {
      const result = await createTestPlan(docId) as { id: string };
      setMessage({ type: "success", text: `Test plan created! Open Test Plans to review and run it.` });
      void result;
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Plan creation failed" });
    } finally {
      setCreatingPlan(null);
    }
  };

  const tabs = [
    { id: "upload" as const, label: "Upload File" },
    { id: "paste" as const, label: "Paste Text" },
    { id: "import" as const, label: "Import from App", badge: connections.length > 0 ? String(connections.length) : undefined },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Documents</h1>
      <p className="text-gray-500 mb-8">Upload requirements, paste text, or import directly from your connected apps</p>

      {message && (
        <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${message.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
          <span className="text-lg">{message.type === "success" ? "✓" : "✗"}</span>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === tab.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {tab.label}
              {tab.badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${mode === tab.id ? "bg-white text-blue-600" : "bg-green-500 text-white"}`}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {mode === "upload" && (
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <p className="text-gray-600 font-medium mb-1">Drag and drop a file here, or click to browse</p>
            <p className="text-xs text-gray-400 mb-5">PDF, Word (.docx), Excel (.xlsx), Text (.txt, .md)</p>
            <input type="file" className="hidden" id="fileInput" accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <label htmlFor="fileInput" className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
              {loading ? "Uploading..." : "Choose File"}
            </label>
          </div>
        )}

        {mode === "paste" && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Title (optional)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <textarea
              placeholder="Paste your requirements, user stories, acceptance criteria, or any text here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
            />
            <button
              onClick={handlePaste}
              disabled={loading || !pasteText.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Processing..." : "Extract Requirements"}
            </button>
          </div>
        )}

        {mode === "import" && (
          <div>
            {connections.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500 mb-3">No apps connected yet.</p>
                <Link href="/connections" className="inline-block px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                  Go to Connections
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {connections.map((conn) => (
                    <button
                      key={conn.type}
                      onClick={() => setImportConnector(conn.type)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${importConnector === conn.type ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${conn.status === "connected" ? "bg-green-500" : "bg-gray-300"}`} />
                        <span className="text-sm font-semibold text-gray-900">{CONNECTOR_LABELS[conn.type] ?? conn.type}</span>
                      </div>
                      {conn.connectedUser && <p className="text-xs text-gray-500 truncate">{conn.connectedUser}</p>}
                      {conn.instanceUrl && <p className="text-xs text-gray-400 truncate">{conn.instanceUrl}</p>}
                    </button>
                  ))}
                </div>

                {importConnector && (
                  <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700">Import options — {CONNECTOR_LABELS[importConnector] ?? importConnector}</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Max records</label>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={importMaxResults}
                          onChange={(e) => setImportMaxResults(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Filter / keyword (optional)</label>
                        <input
                          type="text"
                          placeholder={importConnector === "salesforce" ? "e.g. Priority = 'High'" : "keyword or label"}
                          value={importQuery}
                          onChange={(e) => setImportQuery(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleImport}
                      disabled={loading}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? "Importing..." : `Import from ${CONNECTOR_LABELS[importConnector] ?? importConnector}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
          <span className="text-sm text-gray-400">{docs.length} total</span>
        </div>
        {docs.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No documents yet — upload a file, paste text, or import from a connected app</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {docs.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 uppercase">{doc.type.slice(0, 4)}</div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${doc.status === "parsed" ? "bg-green-100 text-green-700" : doc.status === "error" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {doc.status}
                  </span>
                  {doc.status === "parsed" && (
                    <button
                      onClick={() => handleCreatePlan(doc.id)}
                      disabled={creatingPlan === doc.id}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {creatingPlan === doc.id ? "Creating..." : "Generate Test Plan"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
