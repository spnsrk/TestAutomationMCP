import { z } from "zod";

export const LLMConfigSchema = z.object({
  provider: z.enum(["ollama", "openai", "anthropic", "azure-openai"]).default("ollama"),
  model: z.string().default("llama3"),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().default(4096),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>;
  isAvailable(): Promise<boolean>;
}
