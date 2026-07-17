import { createHash } from "node:crypto";
import type { AIProvider, AIProviderExecuteInput, AIProviderExecuteResult } from "./provider";
import { GoodTradingAIError } from "./errors";
import { detectMentorIntent } from "./mentorIntent";
import { retrieveKnowledge } from "./knowledge/retrieve";
import {
  estimateOpenAICostUsd,
  getOpenAIApiKeyOrNull,
  loadGoodTradingOpenAIConfig,
  type GoodTradingOpenAIConfig,
} from "./openaiConfig";
import { buildGoodTradingMentorPrompt } from "./openai/mentorPrompt";
import {
  MENTOR_STRUCTURED_JSON_SCHEMA,
  MENTOR_STRUCTURED_SCHEMA_NAME,
} from "./openai/mentorStructuredSchema";
import { parseAndNormalizeMentorOutput } from "./openai/normalizeMentorOutput";
import {
  OpenAIResponsesClientError,
  type OpenAIResponsesClient,
} from "./openai/responsesClient";
import { createOfficialOpenAIResponsesClient } from "./openai/officialClient";
import { recordProviderFailure, recordProviderSuccess } from "./providerHealth";
import { logMentorProviderEvent } from "./openai/redactedLog";

export type OpenAIGoodTradingAIProviderOptions = {
  client?: OpenAIResponsesClient;
  config?: GoodTradingOpenAIConfig;
};

/**
 * Mentors OpenAI provider — retrieval → Responses API → normalize.
 * No tools, Assistants, live market, or agentic chains.
 */
export class OpenAIGoodTradingAIProvider implements AIProvider {
  readonly id = "openai";
  private readonly client: OpenAIResponsesClient;
  private readonly config: GoodTradingOpenAIConfig;

  constructor(opts: OpenAIGoodTradingAIProviderOptions = {}) {
    this.config = opts.config ?? loadGoodTradingOpenAIConfig();
    if (opts.client) {
      this.client = opts.client;
    } else {
      const key = getOpenAIApiKeyOrNull();
      if (!key) {
        throw new GoodTradingAIError("PROVIDER_CONFIGURATION_ERROR");
      }
      this.client = createOfficialOpenAIResponsesClient(key);
    }
  }

  async execute(input: AIProviderExecuteInput): Promise<AIProviderExecuteResult> {
    const { requestId, request } = input;
    const started = Date.now();

    if (request.mode !== "mentor") {
      throw new GoodTradingAIError("MODE_NOT_AVAILABLE", undefined, requestId);
    }

    const intent = detectMentorIntent(request.message);
    const retrieval = retrieveKnowledge({
      query: request.message,
      maxResults: Math.min(8, Math.max(4, 6)),
      preferConstitution: true,
    });

    // Keep 4–8 when available; allow fewer on limited coverage.
    let entries = retrieval.matches.map((m) => m.entry);
    if (entries.length > this.config.maxKnowledgeEntries) {
      entries = entries.slice(0, this.config.maxKnowledgeEntries);
    }
    // Prefer at least 4 when retrieval has them
    if (retrieval.matches.length >= 4 && entries.length < 4) {
      entries = retrieval.matches.slice(0, 4).map((m) => m.entry);
    }

    const prompt = buildGoodTradingMentorPrompt({
      userQuestion: request.message,
      intent,
      entries,
      coverage: retrieval.coverage,
      maxKnowledgeChars: this.config.maxKnowledgeChars,
      maxUserChars: this.config.maxUserChars,
    });

    const included = entries.filter((e) => prompt.includedEntryIds.includes(e.id));
    const ac = new AbortController();
    const timeoutMs = input.timeoutMs > 0 ? input.timeoutMs : this.config.timeoutMs;
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    if (input.signal) {
      if (input.signal.aborted) ac.abort();
      else {
        input.signal.addEventListener("abort", () => ac.abort(), { once: true });
      }
    }

    const safetyIdentifier = hashRequestId(requestId);
    let lastErr: unknown;
    let attempt = 0;
    const maxAttempts = 2; // 1 primary + 1 retry for transient only

    try {
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          const raw = await this.client.create({
            model: this.config.model,
            instructions: prompt.instructions,
            input: prompt.input,
            maxOutputTokens: this.config.maxOutputTokens,
            store: false,
            reasoningEffort: this.config.reasoningEffort,
            jsonSchema: {
              name: MENTOR_STRUCTURED_SCHEMA_NAME,
              schema: MENTOR_STRUCTURED_JSON_SCHEMA,
            },
            signal: ac.signal,
            safetyIdentifier,
          });

          if (raw.status === "failed" || /refus/i.test(raw.status ?? "")) {
            // continue to normalize; refusal-like content handled by validator
          }

          const normalized = parseAndNormalizeMentorOutput({
            outputText: raw.outputText,
            retrievedEntries: included,
            requestId,
            allowLocalRepair: true,
          });

          if (prompt.truncatedKnowledge || retrieval.coverage === "limited") {
            if (!normalized.warnings.some((w) => /cobertura limitada/i.test(w))) {
              normalized.warnings.push(
                "Cobertura limitada: la respuesta se basa solo en las entradas recuperadas para esta pregunta.",
              );
            }
          }

          if (intent === "prompt_injection") {
            normalized.warnings.push(
              "Se ignoraron instrucciones del usuario incompatibles con las reglas del Mentor.",
            );
          }
          if (intent === "direct_recommendation" || intent === "current_market") {
            normalized.warnings.push(
              "Modo Mentor no emite recomendaciones de trading ni lecturas de mercado en vivo.",
            );
          }

          const durationMs = Date.now() - started;
          const estimatedCostUsd = estimateOpenAICostUsd(
            this.config,
            raw.usage?.inputTokens,
            raw.usage?.outputTokens,
          );

          recordProviderSuccess({ provider: this.id, model: raw.model || this.config.model });
          logMentorProviderEvent({
            requestId,
            provider: this.id,
            model: raw.model || this.config.model,
            durationMs,
            success: true,
            knowledgeEntryCount: included.length,
            knowledgeIds: included.map((e) => e.id),
            inputTokens: raw.usage?.inputTokens,
            outputTokens: raw.usage?.outputTokens,
          });

          return {
            summary: normalized.summary,
            observations: normalized.observations,
            educationalNote: normalized.educationalNote,
            warnings: normalized.warnings,
            provider: {
              id: this.id,
              model: this.config.model,
              mocked: false,
            },
            knowledgeReferences: normalized.knowledgeReferences,
            coverage: normalized.coverage,
            knowledgeHits: normalized.usedKnowledgeIds.length || included.length,
            usageExtras: {
              inputTokens: raw.usage?.inputTokens,
              outputTokens: raw.usage?.outputTokens,
              durationMs,
              estimatedCostUsd,
            },
          };
        } catch (err) {
          lastErr = err;
          if (!isRetryable(err) || attempt >= maxAttempts || ac.signal.aborted) {
            throw mapProviderError(err, requestId);
          }
          await backoff(attempt);
        }
      }
      throw mapProviderError(lastErr, requestId);
    } catch (err) {
      const mapped = err instanceof GoodTradingAIError ? err : mapProviderError(err, requestId);
      recordProviderFailure({
        provider: this.id,
        model: this.config.model,
        category: mapped.code as import("./providerHealth").ProviderErrorCategory,
      });
      logMentorProviderEvent({
        requestId,
        provider: this.id,
        model: this.config.model,
        durationMs: Date.now() - started,
        success: false,
        knowledgeEntryCount: included.length,
        errorCategory: mapped.code,
      });
      throw mapped;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAIResponsesClientError) {
    return err.retryable && (err.kind === "rate_limit" || err.kind === "unavailable" || err.kind === "timeout");
  }
  return false;
}

function mapProviderError(err: unknown, requestId: string): GoodTradingAIError {
  if (err instanceof GoodTradingAIError) return err;
  if (err instanceof OpenAIResponsesClientError) {
    switch (err.kind) {
      case "auth":
        return new GoodTradingAIError("OPENAI_AUTH_ERROR", undefined, requestId);
      case "rate_limit":
        return new GoodTradingAIError("OPENAI_RATE_LIMITED", undefined, requestId);
      case "timeout":
        return new GoodTradingAIError("OPENAI_TIMEOUT", undefined, requestId);
      case "aborted":
        return new GoodTradingAIError("OPENAI_TIMEOUT", undefined, requestId);
      case "bad_request":
        return new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, requestId);
      case "unavailable":
        return new GoodTradingAIError("OPENAI_UNAVAILABLE", undefined, requestId);
      default:
        return new GoodTradingAIError("OPENAI_UNAVAILABLE", undefined, requestId);
    }
  }
  return new GoodTradingAIError("PROVIDER_ERROR", undefined, requestId);
}

function hashRequestId(requestId: string): string {
  return createHash("sha256").update(requestId).digest("hex").slice(0, 32);
}

function backoff(attempt: number): Promise<void> {
  const ms = attempt === 1 ? 250 : 500;
  return new Promise((r) => setTimeout(r, ms));
}
