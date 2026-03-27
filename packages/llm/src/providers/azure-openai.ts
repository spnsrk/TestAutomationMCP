import type {
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMConfig,
} from "../provider.js";

interface AzureOpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class AzureOpenAIProvider implements LLMProvider {
  name = "azure-openai";
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;
  private apiVersion: string;
  private defaultTemp: number;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.endpoint = config.baseUrl ?? "";
    this.apiKey = config.apiKey ?? "";
    this.deploymentName = config.model || "gpt-4o-mini";
    this.apiVersion = "2024-08-01-preview";
    this.defaultTemp = config.temperature;
    this.defaultMaxTokens = config.maxTokens;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const url = `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;

    const body: Record<string, unknown> = {
      messages,
      temperature: options?.temperature ?? this.defaultTemp,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure OpenAI error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as AzureOpenAIChatResponse;

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
    return !!this.apiKey && !!this.endpoint;
  }
}
