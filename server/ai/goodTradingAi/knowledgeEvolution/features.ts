/**
 * AI-7.3.5 Knowledge Evolution feature flag. Default OFF.
 */
import { envBool } from "../../../lib/runtimeEnv";

export function isGoodTradingAiKnowledgeEvolutionEnabled(): boolean {
  return envBool("GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED", false);
}