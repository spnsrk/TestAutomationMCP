import type {
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMConfig,
} from "../provider.js";

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private defaultTemp: number;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.apiKey = config.apiKey ?? "";
    this.model = config.model || "gpt-4o-mini";
    this.defaultTemp = config.temperature;
    this.defaultMaxTokens = config.maxTokens;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? this.defaultTemp,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? "unknown",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
