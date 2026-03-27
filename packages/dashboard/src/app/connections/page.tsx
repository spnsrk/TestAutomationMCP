"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  getConnections,
  getConnectionDetail,
  saveConnectionConfig,
  testConnection,
  disconnectConnection,
  getSalesforceOAuthUrl,
} from "../../lib/api";

interface ConnectionStatus {
  type: string;
  status: "connected" | "disconnected" | "error";
  connectedUser: string | null;
  connectedAt: string | null;
  instanceUrl: string | null;
}

interface ConnectorDetail extends ConnectionStatus {
  config: Record<string, string>;
}

// ── Per-connector form configs ─────────────────────────────────────────────

const CONNECTOR_META: Record<string, {
  label: string;
  logo: string;
  description: string;
  fields: Array<{ key: string; label: string; type: string; placeholder: string; required?: boolean; hint?: string }>;
  hasOAuth?: boolean;
}> = {
  salesforce: {
    label: "Salesforce",
    logo: "☁️",
    description: "Connect your Salesforce org to import Cases, User Stories, and run automated tests",
    fields: [
      { key: "clientId", label: "Consumer Key (Client ID)", type: "text", placeholder: "3MVG9...", required: true, hint: "From your Connected App > OAuth Settings" },
      { key: "clientSecret", label: "Consumer Secret", type: "password", placeholder: "••••••••", required: true, hint: "From your Connected App > OAuth Settings" },
      { key: "redirectUri", label: "Callback URL", type: "text", placeholder: "http://localhost:3100/api/connections/salesforce/callback", required: true, hint: "Must match exactly what's registered in the Connected App" },
      { key: "isSandbox", label: "Use Sandbox", type: "checkbox", placeholder: "", hint: "Check if connecting to test.salesforce.com" },
      { key: "authType", label: "Auth Flow", type: "select", placeholder: "oauth", hint: "OAuth is recommended for production" },
    ],
    hasOAuth: true,
  },
  jira: {
    label: "Jira",
    logo: "J",
    description: "Import requirements and user stories from Jira projects",
    fields: [
      { key: "baseUrl", label: "Jira URL", type: "text", placeholder: "https://yourorg.atlassian.net", required: true },
      { key: "username", label: "Email / Username", type: "text", placeholder: "you@example.com", required: true },
      { key: "token", label: "API Token", type: "password", placeholder: "••••••••", required: true, hint: "Generate at id.atlassian.com/manage-profile/security/api-tokens" },
    ],
  },
  github: {
    label: "GitHub",
    logo: "G",
    description: "Import issues and requirements from GitHub repositories",
    fields: [
      { key: "baseUrl", label: "GitHub API URL", type: "text", placeholder: "https://api.github.com", required: true },
      { key: "token", label: "Personal Access Token", type: "password", placeholder: "ghp_••••••••", required: true, hint: "Needs repo and issues read scopes" },
    ],
  },
};

// ── Status badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connected: "bg-green-100 text-green-700 border-green-200",
    disconnected: "bg-gray-100 text-gray-500 border-gray-200",
    error: "bg-red-100 text-red-600 border-red-200",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${styles[status] ?? styles.disconnected}`}>
      {status}
    </span>
  );
}

// ── Single connector card ─────────────────────────────────────────────────

function ConnectorCard({
  type,
  status,
  onRefresh,
}: {
  type: string;
  status: ConnectionStatus;
  onRefresh: () => void;
}) {
  const meta = CONNECTOR_META[type];
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      const d = await getConnectionDetail(type) as unknown as ConnectorDetail;
      const raw = (d.config ?? {}) as Record<string, unknown>;
      // Unpack nested auth for Jira/GitHub into flat form state
      if (type === "jira" || type === "github") {
        const auth = (raw.auth ?? {}) as Record<string, string>;
        setForm({
          baseUrl: (raw.baseUrl as string) ?? "",
          username: auth.username ?? "",
          token: auth.token ?? "",
        });
      } else if (type === "salesforce") {
        setForm({
          clientId: (raw.clientId as string) ?? "",
          clientSecret: (raw.clientSecret as string) ?? "",
          redirectUri: (raw.redirectUri as string) ?? "",
          isSandbox: String(raw.isSandbox ?? false),
          authType: (raw.authType as string) ?? "oauth",
          username: (raw.username as string) ?? "",
          password: (raw.password as string) ?? "",
          securityToken: (raw.securityToken as string) ?? "",
        });
      } else {
        setForm(raw as Record<string, string>);
      }
    } catch { /* ok */ }
  }, [type]);

  const handleExpand = () => {
    if (!expanded) loadDetail();
    setExpanded((e) => !e);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Build payload based on connector type
      let payload: Record<string, unknown> = { ...form };
      if (type === "jira") {
        payload = {
          type: "jira",
          baseUrl: form.baseUrl,
          auth: { type: "token", username: form.username, token: form.token },
        };
      } else if (type === "github") {
        payload = {
          type: "github",
          baseUrl: form.baseUrl || "https://api.github.com",
          auth: { type: "token", token: form.token },
        };
      } else if (type === "salesforce") {
        payload = {
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          redirectUri: form.redirectUri,
          isSandbox: form.isSandbox === "true",
          authType: form.authType || "oauth",
        };
      }
      await saveConnectionConfig(type, payload);
      setMessage({ text: "Config saved", ok: true });
      await loadDetail();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await testConnection(type) as { ok: boolean; error?: string };
      setMessage({ text: result.ok ? "Connection successful!" : `Failed: ${result.error ?? "unknown"}`, ok: result.ok });
      onRefresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Test failed", ok: false });
    } finally {
      setTesting(false);
    }
  };

  const handleOAuth = async () => {
    setMessage(null);
    try {
      const result = await getSalesforceOAuthUrl() as { authUrl: string; error?: string };
      if (result.error) { setMessage({ text: result.error, ok: false }); return; }
      window.location.href = result.authUrl;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to get OAuth URL", ok: false });
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta?.label ?? type}?`)) return;
    try {
      await disconnectConnection(type);
      setMessage({ text: "Disconnected", ok: true });
      onRefresh();
    } catch { /* ok */ }
  };

  if (!meta) return null;

  return (
    <div className={`bg-white rounded-xl border transition-all ${status.status === "connected" ? "border-green-200 shadow-sm" : "border-gray-200"}`}>
      {/* Header */}
      <div className="p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold ${status.status === "connected" ? "bg-green-50" : "bg-gray-50"}`}>
          {meta.logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{meta.label}</h3>
            <StatusBadge status={status.status} />
          </div>
          {status.status === "connected" && status.connectedUser ? (
            <p className="text-xs text-gray-500 mt-0.5">Connected as {status.connectedUser}{status.instanceUrl ? ` · ${status.instanceUrl}` : ""}</p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status.status === "connected" && (
            <button onClick={handleDisconnect} className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:border-red-300 transition-colors">
              Disconnect
            </button>
          )}
          <button onClick={handleExpand} className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">
            {expanded ? "Hide" : "Configure"}
          </button>
        </div>
      </div>

      {/* Expandable form */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {meta.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {field.type === "checkbox" ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[field.key] === "true"}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: String(e.target.checked) }))}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Connect to Sandbox (test.salesforce.com)</span>
                </label>
              ) : field.type === "select" ? (
                <select
                  value={form[field.key] ?? "oauth"}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="oauth">OAuth 2.0 Authorization Code (recommended)</option>
                  <option value="client_credentials">Client Credentials</option>
                  <option value="password">Username + Password (legacy)</option>
                </select>
              ) : (
                <input
                  type={field.type}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              {field.hint && <p className="text-xs text-gray-400 mt-1">{field.hint}</p>}
            </div>
          ))}

          {/* Password + security token fields for Salesforce password flow */}
          {type === "salesforce" && (form.authType === "password" || form.authType === "client_credentials") && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {form.authType === "password" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input type="text" value={form.username ?? ""} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="user@org.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input type="password" value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Security Token</label>
                    <input type="password" value={form.securityToken ?? ""} onChange={(e) => setForm((f) => ({ ...f, securityToken: e.target.value }))} placeholder="Token from Salesforce profile" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`text-sm px-3 py-2 rounded-lg ${message.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
              {message.text}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Config"}
            </button>

            {/* Salesforce: OAuth button or Test button */}
            {type === "salesforce" && (!form.authType || form.authType === "oauth") ? (
              <button
                onClick={handleOAuth}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                Connect with Salesforce
              </button>
            ) : (
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {testing ? "Testing…" : "Test Connection"}
              </button>
            )}
          </div>

          {/* OAuth instructions */}
          {type === "salesforce" && (!form.authType || form.authType === "oauth") && (
            <div className="bg-blue-50 rounded-lg p-4 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">OAuth Setup Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700">
                <li>In Salesforce, go to <strong>Setup → Apps → App Manager → New Connected App</strong></li>
                <li>Enable OAuth, add the Callback URL above to <strong>Selected OAuth Scopes</strong></li>
                <li>Add scopes: <code>api</code>, <code>refresh_token</code></li>
                <li>Copy the Consumer Key and Consumer Secret here, then save</li>
                <li>Click <strong>Connect with Salesforce</strong> to authorize</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Import section (only when connected) */}
      {status.status === "connected" && !expanded && (
        <div className="px-5 pb-4">
          <ImportPanel type={type} />
        </div>
      )}
    </div>
  );
}

// ── Import panel (shown when connector is connected) ──────────────────────

function ImportPanel({ type }: { type: string }) {
  const [project, setProject] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100"}/api/connectors/${type}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: project || undefined, maxResults: 50 }),
      });
      const data = await res.json() as { importedCount?: number; extractedRequirements?: number; error?: string };
      if (!res.ok) { setResult(`Error: ${data.error ?? "Import failed"}`); return; }
      setResult(`Imported ${data.importedCount} items → ${data.extractedRequirements} requirements extracted`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      {type !== "github" && (
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder={type === "salesforce" ? "Optional: filter query" : "Project key (e.g. PROJ)"}
          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
      <button
        onClick={handleImport}
        disabled={importing}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {importing ? "Importing…" : "Import Requirements"}
      </button>
      {result && <p className={`text-xs ${result.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{result}</p>}
    </div>
  );
}

// ── Search param handler (needs Suspense) ────────────────────────────────

function OAuthBanner({ onBanner }: { onBanner: (b: { text: string; ok: boolean } | null) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const sf = searchParams.get("sf");
    const reason = searchParams.get("reason");
    if (sf === "connected") onBanner({ text: "Salesforce connected successfully!", ok: true });
    else if (sf === "error") onBanner({ text: `Salesforce connection failed: ${reason ?? "unknown error"}`, ok: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const data = await getConnections() as unknown as { connections: ConnectionStatus[] };
      setConnections(data.connections ?? []);
    } catch { /* ok */ }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const statusMap = new Map(connections.map((c) => [c.type, c]));
  const connectedCount = connections.filter((c) => c.status === "connected").length;

  return (
    <div>
      <Suspense fallback={null}>
        <OAuthBanner onBanner={(b) => { setBanner(b); if (b?.ok) loadConnections(); }} />
      </Suspense>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Connections</h1>
          <p className="text-gray-500">Connect external applications so the AI agent can log in, read data, and run tests</p>
        </div>
        {connectedCount > 0 && (
          <span className="bg-green-100 text-green-700 text-sm px-3 py-1.5 rounded-full font-medium">
            {connectedCount} connected
          </span>
        )}
      </div>

      {banner && (
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-medium ${banner.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {banner.text}
          <button onClick={() => setBanner(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="space-y-4">
        {(["salesforce", "jira", "github"] as const).map((type) => (
          <ConnectorCard
            key={type}
            type={type}
            status={statusMap.get(type) ?? { type, status: "disconnected", connectedUser: null, connectedAt: null, instanceUrl: null }}
            onRefresh={loadConnections}
          />
        ))}
      </div>

      <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">How it works</h2>
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-2"><span className="font-semibold text-gray-800">1.</span> Configure credentials for each connector above</li>
          <li className="flex gap-2"><span className="font-semibold text-gray-800">2.</span> For Salesforce: click <strong>Connect with Salesforce</strong> to authorize via OAuth</li>
          <li className="flex gap-2"><span className="font-semibold text-gray-800">3.</span> Once connected, click <strong>Import Requirements</strong> to pull data into Documents</li>
          <li className="flex gap-2"><span className="font-semibold text-gray-800">4.</span> Go to <strong>Test Plans</strong> to generate and run automated tests against the imported requirements</li>
        </ol>
      </div>
    </div>
  );
}
