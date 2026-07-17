import type {
  GoodTradingAIChatRequest,
  GoodTradingAIChatResponse,
  GoodTradingAIObservation,
  GoodTradingAIKnowledgeReference,
  GoodTradingAICoverage,
} from "@shared/goodTradingAi";
import { GoodTradingAIError } from "./errors";
import { resolveGoodTradingAiProviderId } from "./features";
import { MockGoodTradingAIProvider } from "./mockProvider";
import { loadGoodTradingOpenAIConfig, getOpenAIApiKeyOrNull } from "./openaiConfig";
import { OpenAIGoodTradingAIProvider } from "./openaiProvider";
import type { OpenAIResponsesClient } from "./openai/responsesClient";

export type AIProviderExecuteInput = {
  requestId: string;
  request: GoodTradingAIChatRequest;
  /** Optional prefetched ids — mock engine retrieves itself in AI-2. */
  knowledgeIds?: string[];
  timeoutMs: number;
  /** Client disconnect / cancel (Express abort). */
  signal?: AbortSignal;
};

export type AIProviderUsageExtras = {
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  estimatedCostUsd?: number | null;
};

export type AIProviderExecuteResult = {
  summary: string;
  observations: GoodTradingAIObservation[];
  educationalNote: string;
  warnings: string[];
  provider: GoodTradingAIChatResponse["provider"];
  knowledgeReferences?: GoodTradingAIKnowledgeReference[];
  coverage?: GoodTradingAICoverage;
  knowledgeHits?: number;
  usageExtras?: AIProviderUsageExtras;
};

export interface AIProvider {
  readonly id: string;
  execute(input: AIProviderExecuteInput): Promise<AIProviderExecuteResult>;
}

export type CreateAIProviderDeps = {
  /** Injectable Responses client for tests (never used from client body). */
  openaiClient?: OpenAIResponsesClient;
  /** Force provider id in tests. */
  providerId?: "mock" | "openai";
};

/**
 * Factory — endpoint must not import SDKs or choose providers from the client.
 * Tests default to mock via GOODTRADING_AI_PROVIDER unset / mock.
 */
export function createAIProvider(deps: CreateAIProviderDeps = {}): AIProvider {
  const id = deps.providerId ?? resolveGoodTradingAiProviderId();
  if (id === "mock") return new MockGoodTradingAIProvider();

  const config = loadGoodTradingOpenAIConfig();
  if (!getOpenAIApiKeyOrNull() && !deps.openaiClient) {
    throw new GoodTradingAIError("PROVIDER_CONFIGURATION_ERROR");
  }

  return new OpenAIGoodTradingAIProvider({
    client: deps.openaiClient,
    config: { ...config, provider: "openai", configured: true },
  });
}
