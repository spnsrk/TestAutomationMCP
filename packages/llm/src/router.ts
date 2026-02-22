import { createLogger } from "@test-automation-mcp/core";
import type {
  LLMConfig,
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "./provider.js";
import { OllamaProvider } from "./providers/ollama.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { AzureOpenAIProvider } from "./providers/azure-openai.js";

const logger = createLogger("llm-router");

export class LLMRouter {
  private provider: LLMProvider;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.provider = this.createProvider(config);
    logger.info({ provider: config.provider, model: config.model }, "LLM router initialized");
  }

  private createProvider(config: LLMConfig): LLMProvider {
    switch (config.provider) {
      case "ollama":
        return new OllamaProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "azure-openai":
        return new AzureOpenAIProvider(config);
      default:
        logger.warn({ provider: config.provider }, "Unknown provider, falling back to Ollama");
        return new OllamaProvider(config);
    }
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const startTime = performance.now();

    try {
      const result = await this.provider.complete(messages, options);
      const duration = Math.round(performance.now() - startTime);
      logger.debug(
        { provider: this.provider.name, model: result.model, duration, tokens: result.usage?.totalTokens },
        "LLM completion finished"
      );
      return result;
    } catch (err) {
      logger.error(
        { provider: this.provider.name, error: err instanceof Error ? err.message : String(err) },
        "LLM completion failed"
      );
      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  getProviderName(): string {
    return this.provider.name;
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }
}
