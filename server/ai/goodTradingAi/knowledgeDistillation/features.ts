/**
 * AI-7.3.4 Knowledge Distillation feature flag. Default OFF.
 */
import { envBool } from "../../../lib/runtimeEnv";

export function isGoodTradingAiKnowledgeDistillationEnabled(): boolean {
  return envBool("GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED", false);
}