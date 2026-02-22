import type {
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMConfig,
} from "../provider.js";

interface OllamaChatResponse {
  message: { role: string; content: string };
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private baseUrl: string;
  private model: string;
  private defaultTemp: number;
  private defaultMaxTokens: number;

  constructor(config: LLMConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.model = config.model;
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
      stream: false,
      options: {
        temperature: options?.temperature ?? this.defaultTemp,
        num_predict: options?.maxTokens ?? this.defaultMaxTokens,
      },
    };

    if (options?.jsonMode) {
      body.format = "json";
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaChatResponse;

    return {
      content: data.message.content,
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
