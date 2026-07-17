import type { AIProvider, AIProviderExecuteInput, AIProviderExecuteResult } from "./provider";
import { GoodTradingAIError } from "./errors";
import { buildValidatedMentorFields } from "./mentorResponseEngine";

/**
 * Deterministic mock provider — no network, keys, randomness, or live market.
 * AI-2: builds responses via Mentor response engine + knowledge retrieval.
 */
export class MockGoodTradingAIProvider implements AIProvider {
  readonly id = "mock";

  async execute(input: AIProviderExecuteInput): Promise<AIProviderExecuteResult> {
    const { requestId, request, timeoutMs } = input;

    const work = async (): Promise<AIProviderExecuteResult> => {
      if (request.mode !== "mentor") {
        throw new GoodTradingAIError("MODE_NOT_AVAILABLE", undefined, requestId);
      }

      const { fields, knowledgeHits, coverage } = buildValidatedMentorFields(request.message);

      return {
        summary: fields.summary,
        observations: fields.observations,
        educationalNote: fields.educationalNote,
        warnings: fields.warnings.filter(
          (w) =>
            !w.startsWith("GoodTrading AI Modo Mentor") &&
            !w.startsWith("Sin lectura de mercado"),
        ),
        provider: {
          id: this.id,
          model: fields.provider.model,
          mocked: true,
        },
        knowledgeReferences: fields.knowledgeReferences,
        coverage: coverage ?? fields.coverage,
        knowledgeHits,
      };
    };

    return withTimeout(work(), timeoutMs, requestId);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, requestId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new GoodTradingAIError("PROVIDER_TIMEOUT", undefined, requestId));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
