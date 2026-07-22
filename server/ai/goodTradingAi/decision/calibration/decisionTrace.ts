/**
 * AI-7.1 — Structured decision trace (no corpus / raw knowledge dump).
 */
import type { DecisionGraphInternal } from "@shared/goodTradingAiDecisionGraph";

export type DecisionTrace = {
  templateId: string;
  contextTrust: string;
  quality: string;
  primaryOutcome: string | null;
  nodeKinds: string[];
  triggeredInvalidations: string[];
  supportedConfirmations: string[];
  conflictCodes: string[];
  pathIds: string[];
  durationMs: number;
  mentorEligible: false;
};

export function buildDecisionTrace(graph: DecisionGraphInternal): DecisionTrace {
  const primary = graph.paths.find((p) => p.id === graph.primaryPathId) ?? graph.paths[0];
  return {
    templateId: graph.templateId,
    contextTrust: graph.contextTrust,
    quality: graph.quality,
    primaryOutcome: primary?.outcome ?? null,
    nodeKinds: graph.nodes.map((n) => n.kind),
    triggeredInvalidations: graph.nodes
      .filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED")
      .map((n) => n.id),
    supportedConfirmations: graph.nodes
      .filter((n) => n.kind === "CONFIRMATION" && n.state === "SUPPORTED")
      .map((n) => n.id),
    conflictCodes: [...new Set(graph.paths.flatMap((p) => p.conflictCodes))],
    pathIds: graph.paths.map((p) => p.id),
    durationMs: graph.durationMs,
    mentorEligible: false,
  };
}
