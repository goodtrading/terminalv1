import { randomUUID } from "node:crypto";
import {
  AI1_ALLOWED_MODES,
  goodTradingAiChatRequestSchema,
  type GoodTradingAIChatRequest,
  type GoodTradingAIChatResponse,
} from "@shared/goodTradingAi";
import { GoodTradingAIError } from "./errors";
import { isGoodTradingAiEnabled } from "./features";
import { createAIProvider, type AIProvider, type CreateAIProviderDeps } from "./provider";
import { validateMentorResponse } from "./responseValidator";
import { loadGoodTradingOpenAIConfig } from "./openaiConfig";
import { MockGoodTradingAIProvider } from "./mockProvider";

const MANDATORY_SERVICE_WARNINGS = [
  "GoodTrading AI Modo Mentor — contenido educativo únicamente.",
  "Sin lectura de mercado en vivo, Bookmap, DOM, heatmap, gamma/orderflow live ni ejecución automática.",
] as const;

export type GoodTradingAIServiceResult = GoodTradingAIChatResponse;

export type GoodTradingAIServiceOptions = {
  providerDeps?: CreateAIProviderDeps;
  /** Fully inject provider (tests). */
  provider?: AIProvider;
  signal?: AbortSignal;
};

/**
 * Orchestrator: validate → mentor-only → provider → normalize/validate.
 * Must NOT call buildLiveMarketContext, exchanges, DOM/heatmap, or auto-signals.
 */
export class GoodTradingAIService {
  private readonly options: GoodTradingAIServiceOptions;

  constructor(options: GoodTradingAIServiceOptions = {}) {
    this.options = options;
  }

  async handleChat(
    rawBody: unknown,
    runtime: { signal?: AbortSignal } = {},
  ): Promise<GoodTradingAIServiceResult> {
    const requestId = randomUUID();
    const config = loadGoodTradingOpenAIConfig();

    if (!isGoodTradingAiEnabled()) {
      throw new GoodTradingAIError("AI_DISABLED", undefined, requestId);
    }

    const parsed = goodTradingAiChatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new GoodTradingAIError("INVALID_REQUEST", undefined, requestId);
    }

    const request: GoodTradingAIChatRequest = parsed.data;

    if (!AI1_ALLOWED_MODES.includes(request.mode)) {
      throw new GoodTradingAIError("MODE_NOT_AVAILABLE", undefined, requestId);
    }

    if (request.mode !== "mentor") {
      throw new GoodTradingAIError("MODE_NOT_AVAILABLE", undefined, requestId);
    }

    let provider: AIProvider;
    try {
      provider =
        this.options.provider ?? createAIProvider(this.options.providerDeps ?? {});
    } catch (err) {
      if (err instanceof GoodTradingAIError) throw err;
      throw new GoodTradingAIError("PROVIDER_CONFIGURATION_ERROR", undefined, requestId);
    }

    const timeoutMs =
      provider.id === "openai" ? config.timeoutMs : Math.min(5_000, config.timeoutMs);

    let executed;
    try {
      executed = await provider.execute({
        requestId,
        request,
        timeoutMs,
        signal: runtime.signal ?? this.options.signal,
      });
    } catch (err) {
      if (err instanceof GoodTradingAIError) {
        if (
          provider.id === "openai" &&
          config.fallbackToMock &&
          shouldFallbackToMock(err)
        ) {
          const mock = new MockGoodTradingAIProvider();
          executed = await mock.execute({
            requestId,
            request,
            timeoutMs: 5_000,
            signal: runtime.signal ?? this.options.signal,
          });
          executed = {
            ...executed,
            provider: { ...executed.provider, mocked: true, id: "mock" },
            warnings: [
              ...executed.warnings,
              "Fallback a mock activado (GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK). Respuesta simulada — no es el proveedor OpenAI.",
            ],
          };
        } else {
          throw err;
        }
      } else {
        throw new GoodTradingAIError("PROVIDER_ERROR", undefined, requestId);
      }
    }

    const warnings = uniqueStrings([
      ...MANDATORY_SERVICE_WARNINGS,
      ...executed.warnings,
    ]);

    const provisional: GoodTradingAIChatResponse = {
      schemaVersion: "1.0",
      requestId,
      mode: "mentor",
      summary: executed.summary,
      observations: executed.observations,
      educationalNote: executed.educationalNote,
      warnings,
      provider: executed.provider,
      usage: {
        inputChars: request.message.length,
        outputChars: executed.summary.length,
        knowledgeHits: executed.knowledgeHits ?? executed.observations.length,
        inputTokens: executed.usageExtras?.inputTokens,
        outputTokens: executed.usageExtras?.outputTokens,
        durationMs: executed.usageExtras?.durationMs,
        estimatedCostUsd: executed.usageExtras?.estimatedCostUsd,
      },
      generatedAt: new Date().toISOString(),
      conversationId: request.conversationId,
      knowledgeReferences: executed.knowledgeReferences,
      coverage: executed.coverage,
    };

    const { response } = validateMentorResponse(provisional);
    return response;
  }
}

export const goodTradingAIService = new GoodTradingAIService();

function shouldFallbackToMock(err: GoodTradingAIError): boolean {
  return (
    err.code === "OPENAI_TIMEOUT" ||
    err.code === "OPENAI_RATE_LIMITED" ||
    err.code === "OPENAI_UNAVAILABLE" ||
    err.code === "OPENAI_BAD_RESPONSE" ||
    err.code === "PROVIDER_ERROR" ||
    err.code === "PROVIDER_TIMEOUT"
  );
}

function uniqueStrings(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
