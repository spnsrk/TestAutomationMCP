import type {
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMConfig,
} from "../provider.js";

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private defaultTemp: number;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com";
    this.apiKey = config.apiKey ?? "";
    this.model = config.model || "claude-sonnet-4-20250514";
    this.defaultTemp = config.temperature;
    this.defaultMaxTokens = config.maxTokens;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemp,
      messages: nonSystemMessages,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const textContent = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      content: textContent,
      model: data.model ?? "unknown",
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
