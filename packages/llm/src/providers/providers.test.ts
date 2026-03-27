import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { AzureOpenAIProvider } from "./azure-openai.js";
import { OllamaProvider } from "./ollama.js";
import type { LLMConfig } from "../provider.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetch(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    json: () => Promise.resolve(data),
  });
}

const baseMessages = [{ role: "user" as const, content: "Hello" }];

const defaultConfig: LLMConfig = {
  provider: "anthropic",
  model: "claude-test",
  temperature: 0.5,
  maxTokens: 512,
};

// ─── AnthropicProvider ────────────────────────────────────────────────────────

describe("AnthropicProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is available when apiKey is set", async () => {
    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "sk-test" });
    expect(await p.isAvailable()).toBe(true);
  });

  it("is not available when apiKey is empty", async () => {
    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "" });
    expect(await p.isAvailable()).toBe(false);
  });

  it("calls Anthropic messages endpoint with correct headers", async () => {
    const fetchMock = mockFetch({
      content: [{ type: "text", text: "Test response" }],
      model: "claude-test",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "sk-test" });
    const result = await p.complete(baseMessages);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/messages");
    expect((options.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    expect((options.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
    expect(result.content).toBe("Test response");
    expect(result.model).toBe("claude-test");
    expect(result.usage?.promptTokens).toBe(10);
    expect(result.usage?.completionTokens).toBe(5);
    expect(result.usage?.totalTokens).toBe(15);
  });

  it("extracts system message into top-level system field", async () => {
    const fetchMock = mockFetch({
      content: [{ type: "text", text: "ok" }],
      model: "claude-test",
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "sk-test" });
    await p.complete([
      { role: "system", content: "You are a QA engineer." },
      { role: "user", content: "Test this" },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toBe("You are a QA engineer.");
    expect(body.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
  });

  it("uses custom baseUrl", async () => {
    const fetchMock = mockFetch({ content: [{ type: "text", text: "ok" }], model: "m" });
    vi.stubGlobal("fetch", fetchMock);

    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "k", baseUrl: "https://proxy.example.com" });
    await p.complete(baseMessages);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://proxy.example.com");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Unauthorized" }, false, 401));
    const p = new AnthropicProvider({ ...defaultConfig, apiKey: "bad" });
    await expect(p.complete(baseMessages)).rejects.toThrow("Anthropic error (401)");
  });
});

// ─── OpenAIProvider ───────────────────────────────────────────────────────────

describe("OpenAIProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is available when apiKey is set", async () => {
    const p = new OpenAIProvider({ ...defaultConfig, provider: "openai", apiKey: "sk-test" });
    expect(await p.isAvailable()).toBe(true);
  });

  it("is not available when apiKey is empty", async () => {
    const p = new OpenAIProvider({ ...defaultConfig, provider: "openai", apiKey: "" });
    expect(await p.isAvailable()).toBe(false);
  });

  it("calls /chat/completions with Bearer auth", async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: "Hello there" } }],
      model: "gpt-4o-mini",
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new OpenAIProvider({ ...defaultConfig, provider: "openai", apiKey: "sk-test" });
    const result = await p.complete(baseMessages);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/chat/completions");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk-test");
    expect(result.content).toBe("Hello there");
    expect(result.usage?.totalTokens).toBe(12);
  });

  it("sets response_format when jsonMode is true", async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: '{"key":"value"}' } }],
      model: "gpt-4o-mini",
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new OpenAIProvider({ ...defaultConfig, provider: "openai", apiKey: "sk-test" });
    await p.complete(baseMessages, { jsonMode: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Rate limited" }, false, 429));
    const p = new OpenAIProvider({ ...defaultConfig, provider: "openai", apiKey: "sk-test" });
    await expect(p.complete(baseMessages)).rejects.toThrow("OpenAI error (429)");
  });
});

// ─── AzureOpenAIProvider ──────────────────────────────────────────────────────

describe("AzureOpenAIProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is available when apiKey and endpoint are both set", async () => {
    const p = new AzureOpenAIProvider({
      ...defaultConfig,
      provider: "azure-openai",
      apiKey: "key",
      baseUrl: "https://my.openai.azure.com",
    });
    expect(await p.isAvailable()).toBe(true);
  });

  it("is not available when endpoint is missing", async () => {
    const p = new AzureOpenAIProvider({ ...defaultConfig, provider: "azure-openai", apiKey: "key" });
    expect(await p.isAvailable()).toBe(false);
  });

  it("builds correct Azure URL with deployment name and api-version", async () => {
    const fetchMock = mockFetch({
      choices: [{ message: { content: "Azure response" } }],
      model: "my-deployment",
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new AzureOpenAIProvider({
      ...defaultConfig,
      provider: "azure-openai",
      apiKey: "az-key",
      baseUrl: "https://my.openai.azure.com",
      model: "gpt-4-deployment",
    });
    const result = await p.complete(baseMessages);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/openai/deployments/gpt-4-deployment/chat/completions");
    expect(url).toContain("api-version=");
    expect((options.headers as Record<string, string>)["api-key"]).toBe("az-key");
    expect(result.content).toBe("Azure response");
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Forbidden" }, false, 403));
    const p = new AzureOpenAIProvider({
      ...defaultConfig,
      provider: "azure-openai",
      apiKey: "key",
      baseUrl: "https://my.openai.azure.com",
    });
    await expect(p.complete(baseMessages)).rejects.toThrow("Azure OpenAI error (403)");
  });
});

// ─── OllamaProvider ───────────────────────────────────────────────────────────

describe("OllamaProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /api/chat and returns content", async () => {
    const fetchMock = mockFetch({
      message: { role: "assistant", content: "Ollama says hi" },
      model: "llama3",
      prompt_eval_count: 20,
      eval_count: 10,
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new OllamaProvider({ ...defaultConfig, provider: "ollama", model: "llama3" });
    const result = await p.complete(baseMessages);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/chat");
    expect(result.content).toBe("Ollama says hi");
    expect(result.usage?.promptTokens).toBe(20);
    expect(result.usage?.completionTokens).toBe(10);
    expect(result.usage?.totalTokens).toBe(30);
  });

  it("sets format=json when jsonMode is true", async () => {
    const fetchMock = mockFetch({
      message: { role: "assistant", content: '{"ok":true}' },
      model: "llama3",
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new OllamaProvider({ ...defaultConfig, provider: "ollama", model: "llama3" });
    await p.complete(baseMessages, { jsonMode: true });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.format).toBe("json");
    expect(body.stream).toBe(false);
  });

  it("uses custom baseUrl", async () => {
    const fetchMock = mockFetch({
      message: { role: "assistant", content: "ok" },
      model: "llama3",
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = new OllamaProvider({
      ...defaultConfig,
      provider: "ollama",
      model: "llama3",
      baseUrl: "http://remote-ollama:11434",
    });
    await p.complete(baseMessages);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("http://remote-ollama:11434");
  });

  it("isAvailable returns true when /api/tags responds ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const p = new OllamaProvider({ ...defaultConfig, provider: "ollama", model: "llama3" });
    expect(await p.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when /api/tags fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const p = new OllamaProvider({ ...defaultConfig, provider: "ollama", model: "llama3" });
    expect(await p.isAvailable()).toBe(false);
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch("model not found", false, 404));
    const p = new OllamaProvider({ ...defaultConfig, provider: "ollama", model: "llama3" });
    await expect(p.complete(baseMessages)).rejects.toThrow("Ollama error (404)");
  });
});
