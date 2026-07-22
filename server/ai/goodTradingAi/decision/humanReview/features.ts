/**
 * AI-7.2 — Human methodology review feature flag. Default OFF.
 */
import { envBool } from "../../../../lib/runtimeEnv";

export function isGoodTradingAiDecisionReviewEnabled(): boolean {
  return envBool("GOODTRADING_AI_DECISION_REVIEW_ENABLED", false);
}
