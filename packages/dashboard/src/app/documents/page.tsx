"use client";

import { useCallback, useEffect, useState } from "react";
import { uploadDocument, submitText, getDocuments, createTestPlan } from "../../lib/api";
import Link from "next/link";

interface DocRow { id: string; name: string; type: string; status: string; createdAt: string }

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(() => {
    getDocuments().then((d) => setDocs(d.documents)).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleFile = async (file: File) => {
    setLoading(true);
    setMessage(null);
    try {
      await uploadDocument(file);
      setMessage({ type: "success", text: `"${file.name}" uploaded and parsed successfully!` });
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

  const handleCreatePlan = async (docId: string) => {
    setLoading(true);
    try {
      const result = await createTestPlan(docId) as { id: string };
      setMessage({ type: "success", text: `Test plan created! ID: ${result.id}` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Plan creation failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Documents</h1>
      <p className="text-gray-500 mb-8">Upload requirements documents or paste text to generate test plans</p>

      {message && (
        <div className={`rounded-xl p-4 mb-6 ${message.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex gap-4 mb-6">
          <button onClick={() => setMode("upload")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "upload" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Upload File</button>
          <button onClick={() => setMode("paste")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "paste" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Paste Text</button>
        </div>

        {mode === "upload" ? (
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <p className="text-gray-500 mb-2">Drag and drop a file here, or click to browse</p>
            <p className="text-xs text-gray-400 mb-4">Supports PDF, Word (.docx), Excel (.xlsx), Text (.txt, .md)</p>
            <input type="file" className="hidden" id="fileInput" accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <label htmlFor="fileInput" className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
              Choose File
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <input type="text" placeholder="Title (optional)" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            <textarea placeholder="Paste your requirements, user stories, test cases, or any text here..." value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y" />
            <button onClick={handlePaste} disabled={loading || !pasteText.trim()} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? "Processing..." : "Submit & Extract Requirements"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Uploaded Documents</h2>
        </div>
        {docs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No documents uploaded yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {docs.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 uppercase">{doc.type}</div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                    <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${doc.status === "parsed" ? "bg-green-100 text-green-700" : doc.status === "error" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{doc.status}</span>
                  {doc.status === "parsed" && (
                    <button onClick={() => handleCreatePlan(doc.id)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Create Test Plan</button>
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
