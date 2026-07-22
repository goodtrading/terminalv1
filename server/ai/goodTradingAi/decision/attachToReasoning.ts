/**
 * AI-7 — Optional attach of client-safe Decision Graph to AI-4-shaped responses.
 * Internal/mock only — MUST NOT be called from live /api/ai/chat MarketSnapshot wiring.
 */
import type { GoodTradingAIChatResponse } from "@shared/goodTradingAi";
import type { DecisionGraphClientSafe } from "@shared/goodTradingAiDecisionGraph";
import { isDecisionGraphAttachAllowedForInternal } from "./features";
import { evaluateDecisionGraph } from "./decisionGraphEngine";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";

/**
 * Attach decisionGraph projection when internal flag allows.
 * Never pulls live snapshot here — caller may pass none.
 */
export function maybeAttachDecisionGraphForInternal(params: {
  response: GoodTradingAIChatResponse;
  question: string;
  knowledgeEntries: GoodTradingKnowledgeEntry[];
}): GoodTradingAIChatResponse & { decisionGraph?: DecisionGraphClientSafe } {
  if (!isDecisionGraphAttachAllowedForInternal()) {
    return params.response;
  }
  const result = evaluateDecisionGraph({
    question: params.question,
    knowledgeEntries: params.knowledgeEntries,
    marketSnapshot: null,
  });
  if (!result.ok || !result.clientSafe) return params.response;

  // Coherence: if reasoning contradictions exist, ensure graph warnings include a marker
  const warnings = [...(params.response.warnings ?? [])];
  if (params.response.reasoning?.contradictions?.length) {
    warnings.push("DECISION_GRAPH_ALIGNED_WITH_REASONING_CONTRADICTIONS");
  }

  return {
    ...params.response,
    warnings: warnings.slice(0, 20),
    decisionGraph: result.clientSafe,
  };
}
