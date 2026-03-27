const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options.body !== null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/documents/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function submitText(text: string, title?: string) {
  return apiFetch("/api/documents/text", {
    method: "POST",
    body: JSON.stringify({ text, title }),
  });
}

export async function getDocuments() {
  return apiFetch<{ documents: Array<{ id: string; name: string; type: string; status: string; createdAt: string }> }>("/api/documents");
}

export async function getDocument(id: string) {
  return apiFetch<Record<string, unknown>>(`/api/documents/${id}`);
}

export async function createTestPlan(documentId: string) {
  return apiFetch<Record<string, unknown>>("/api/test-plans", {
    method: "POST",
    body: JSON.stringify({ documentId }),
  });
}

export async function getTestPlans() {
  return apiFetch<{ testPlans: Array<{ id: string; status: string; createdAt: string; documentId?: string }> }>("/api/test-plans");
}

export async function getTestPlan(id: string) {
  return apiFetch<Record<string, unknown>>(`/api/test-plans/${id}`);
}

export async function approveTestPlan(id: string) {
  return apiFetch(`/api/test-plans/${id}/approve`, { method: "POST" });
}

export async function generateTests(planId: string) {
  return apiFetch<Record<string, unknown>>(`/api/test-plans/${planId}/generate`, { method: "POST" });
}

export async function runTests(testPlanId: string, environment = "default") {
  return apiFetch<{ runId: string; status: string; testCount: number }>("/api/tests/run", {
    method: "POST",
    body: JSON.stringify({ testPlanId, environment }),
  });
}

export async function getRuns() {
  return apiFetch<{ results: Array<Record<string, unknown>> }>("/api/runs");
}

export async function getRun(id: string) {
  return apiFetch<Record<string, unknown>>(`/api/runs/${id}`);
}

export async function getResults() {
  return apiFetch<{ results: Array<Record<string, unknown>> }>("/api/runs");
}

export async function getStatus() {
  return apiFetch<{ status: string; version: string; stats: Record<string, number> }>("/api/status");
}

export async function getLLMConfig() {
  return apiFetch<{ provider: string; model: string; available: boolean }>("/api/config/llm");
}

export function createRunWebSocket(runId: string, onMessage: (data: Record<string, unknown>) => void) {
  const wsUrl = API_BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsUrl}/ws/runs/${runId}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch { /* ignore parse errors */ }
  };
  return ws;
}

// ── Connections API ────────────────────────────────────────────────────────────

export async function getConnections() {
  return apiFetch<{ connections: Array<Record<string, unknown>> }>("/api/connections");
}

export async function getConnectionDetail(type: string) {
  return apiFetch<Record<string, unknown>>(`/api/connections/${type}`);
}

export async function saveConnectionConfig(type: string, config: Record<string, unknown>) {
  return apiFetch<{ saved: boolean }>(`/api/connections/${type}/config`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function testConnection(type: string) {
  return apiFetch<{ ok: boolean; error?: string }>(`/api/connections/${type}/test`, { method: "POST" });
}

export async function disconnectConnection(type: string) {
  return apiFetch<{ disconnected: boolean }>(`/api/connections/${type}`, { method: "DELETE" });
}

export async function getSalesforceOAuthUrl() {
  return apiFetch<{ authUrl: string }>("/api/connections/salesforce/oauth-url");
}

export async function importFromConnector(
  type: string,
  opts: { maxResults?: number; query?: string; status?: string[] } = {}
) {
  return apiFetch<{ documentId: string; importedCount: number; extractedRequirements: number }>(
    `/api/connectors/${type}/import`,
    { method: "POST", body: JSON.stringify(opts) }
  );
}

// ── QA Agent API ──────────────────────────────────────────────────────────────

export async function startQARun(body: {
  input: Record<string, unknown>;
  environment?: string;
  model?: string;
}) {
  return apiFetch<{ runId: string; status: string; title: string }>("/api/qa/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getQARuns(params?: { limit?: number; status?: string }) {
  const qs = params
    ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()
    : "";
  return apiFetch<{ runs: Array<Record<string, unknown>> }>(`/api/qa/runs${qs}`);
}

export async function getQARun(id: string) {
  return apiFetch<Record<string, unknown>>(`/api/qa/runs/${id}`);
}

export function createQAWebSocket(runId: string, onMessage: (data: Record<string, unknown>) => void) {
  const wsUrl = API_BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsUrl}/ws/qa/${runId}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch { /* ignore parse errors */ }
  };
  return ws;
}
