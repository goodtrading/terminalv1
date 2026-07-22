/**
 * AI-7 — Decision Graph feature flag. Default OFF.
 */
import { envBool, isGoodTradingAiDecisionGraphEnabledEnv } from "../../../lib/runtimeEnv";

export function isGoodTradingAiDecisionGraphEnabled(): boolean {
  return isGoodTradingAiDecisionGraphEnabledEnv();
}

/** Internal/mock attach only — never implies Mentor live market wiring. */
export function isDecisionGraphAttachAllowedForInternal(): boolean {
  return isGoodTradingAiDecisionGraphEnabled() && envBool("GOODTRADING_AI_DECISION_GRAPH_INTERNAL_ATTACH", false);
}
