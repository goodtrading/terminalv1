import { envBool, envInt } from "../../lib/runtimeEnv";

export type GoodTradingAiProviderId = "mock" | "openai";

export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type GoodTradingOpenAIConfig = {
  provider: GoodTradingAiProviderId;
  /** True when provider=openai and API key is present (never expose the key). */
  configured: boolean;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningEffort: OpenAIReasoningEffort | null;
  storeResponses: boolean;
  fallbackToMock: boolean;
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  /** Soft caps for prompt assembly */
  maxKnowledgeEntries: number;
  maxKnowledgeChars: number;
  maxUserChars: number;
};

const ALLOWED_REASONING: ReadonlySet<string> = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseUsdPer1M(key: string): number | null {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Server-only OpenAI Mentors config (AI-3).
 * Never returns the API key. Never reads client body for provider/model.
 */
export function loadGoodTradingOpenAIConfig(): GoodTradingOpenAIConfig {
  const rawProvider = (process.env.GOODTRADING_AI_PROVIDER ?? "mock").trim().toLowerCase();
  let provider: GoodTradingAiProviderId = "mock";

  if (rawProvider === "openai") {
    provider = "openai";
  } else if (rawProvider && rawProvider !== "mock") {
    console.warn(
      `[GoodTradingAI] Unknown GOODTRADING_AI_PROVIDER="${rawProvider}". Falling back to mock.`,
    );
    provider = "mock";
  }

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const model = (process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim() || "gpt-4.1-mini";

  const maxOutputTokens = clampInt(envInt("OPENAI_MAX_OUTPUT_TOKENS", 900), 700, 1200);
  const timeoutMs = clampInt(envInt("OPENAI_TIMEOUT_MS", 15_000), 3_000, 60_000);

  const effortRaw = (process.env.OPENAI_REASONING_EFFORT ?? "").trim().toLowerCase();
  let reasoningEffort: OpenAIReasoningEffort | null = null;
  if (effortRaw) {
    if (ALLOWED_REASONING.has(effortRaw)) {
      reasoningEffort = effortRaw as OpenAIReasoningEffort;
    } else {
      console.warn(
        `[GoodTradingAI] Invalid OPENAI_REASONING_EFFORT="${effortRaw}". Ignoring.`,
      );
    }
  }

  // Default false — never store Mentors prompts/responses in OpenAI.
  const storeResponses = envBool("OPENAI_STORE_RESPONSES", false);
  if (storeResponses) {
    console.warn(
      "[GoodTradingAI] OPENAI_STORE_RESPONSES=true is discouraged for Mentors privacy; forcing store:false.",
    );
  }

  return {
    provider,
    configured: provider === "openai" ? hasKey : true,
    model,
    maxOutputTokens,
    timeoutMs,
    reasoningEffort,
    storeResponses: false,
    fallbackToMock: envBool("GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK", false),
    inputUsdPer1M: parseUsdPer1M("OPENAI_INPUT_USD_PER_1M"),
    outputUsdPer1M: parseUsdPer1M("OPENAI_OUTPUT_USD_PER_1M"),
    maxKnowledgeEntries: 8,
    maxKnowledgeChars: 12_000,
    maxUserChars: 2000,
  };
}

/** Server-only — never log or return this. */
export function getOpenAIApiKeyOrNull(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export function estimateOpenAICostUsd(
  config: GoodTradingOpenAIConfig,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number | null {
  if (config.inputUsdPer1M == null || config.outputUsdPer1M == null) return null;
  if (inputTokens == null || outputTokens == null) return null;
  const usd =
    (inputTokens / 1_000_000) * config.inputUsdPer1M +
    (outputTokens / 1_000_000) * config.outputUsdPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
