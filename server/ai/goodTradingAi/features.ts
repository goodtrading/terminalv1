import { isGoodTradingAiEnabledEnv } from "../../lib/runtimeEnv";
import { loadGoodTradingOpenAIConfig, type GoodTradingAiProviderId } from "./openaiConfig";

/** Server-side feature flag. Default OFF. */
export function isGoodTradingAiEnabled(): boolean {
  return isGoodTradingAiEnabledEnv();
}

/**
 * Server-only provider selector (AI-3: mock | openai).
 * Invalid / unset → mock (safe fallback + warning). Never from client body.
 */
export function resolveGoodTradingAiProviderId(): GoodTradingAiProviderId {
  return loadGoodTradingOpenAIConfig().provider;
}

export function isOpenAIMentorsConfigured(): boolean {
  const cfg = loadGoodTradingOpenAIConfig();
  return cfg.provider === "openai" && cfg.configured;
}
