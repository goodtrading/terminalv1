/**
 * AI-7.3.6 Knowledge Provenance feature flag. Default OFF.
 */
import { envBool } from "../../../lib/runtimeEnv";

export function isGoodTradingAiKnowledgeProvenanceEnabled(): boolean {
  return envBool("GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED", false);
}