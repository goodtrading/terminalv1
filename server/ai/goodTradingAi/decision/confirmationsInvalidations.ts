/**
 * AI-7 — Confirmations / invalidations extraction from evaluated nodes.
 */
import type { DecisionNode } from "@shared/goodTradingAiDecisionGraph";

export function collectConfirmations(nodes: DecisionNode[]): DecisionNode[] {
  return nodes.filter((n) => n.kind === "CONFIRMATION" && n.state === "SUPPORTED");
}

export function collectInvalidations(nodes: DecisionNode[]): DecisionNode[] {
  return nodes.filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED");
}
