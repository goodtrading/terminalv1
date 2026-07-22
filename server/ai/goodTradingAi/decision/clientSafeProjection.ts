/**
 * AI-7 — Client-safe projection (never full graph / Brain dump).
 * AI-7.1: pathSummaries ≤2, rendered nodes ≤12.
 */
import {
  decisionGraphClientSafeSchema,
  type DecisionGraphClientSafe,
  type DecisionGraphInternal,
} from "@shared/goodTradingAiDecisionGraph";
import { MAX_PATHS, MAX_RENDERED_NODES, selectRenderedNodes } from "./limits";

export function toClientSafeDecisionGraph(
  graph: DecisionGraphInternal,
): DecisionGraphClientSafe {
  const primary = graph.paths.find((p) => p.id === graph.primaryPathId) ?? graph.paths[0] ?? null;
  const rendered = selectRenderedNodes(graph.nodes);
  const byId = new Map(rendered.map((n) => [n.id, n]));

  const pathSummaries = graph.paths.slice(0, MAX_PATHS).map((p) => ({
    id: p.id,
    outcome: p.outcome,
    priority: p.priority,
    stepLabels: p.nodeIds
      .map((id) => byId.get(id)?.label ?? graph.nodes.find((n) => n.id === id)?.label)
      .filter((x): x is string => !!x)
      .slice(0, MAX_RENDERED_NODES),
  }));

  const confirmationLabels = rendered
    .filter((n) => n.kind === "CONFIRMATION" && n.state === "SUPPORTED")
    .map((n) => n.label)
    .slice(0, 8);
  const invalidationLabels = rendered
    .filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED")
    .map((n) => n.label)
    .slice(0, 8);
  const conflictCodes = [
    ...new Set(graph.paths.flatMap((p) => p.conflictCodes)),
  ].slice(0, 8);

  return decisionGraphClientSafeSchema.parse({
    schemaVersion: "1.0",
    templateId: graph.templateId,
    templateVersion: graph.templateVersion,
    contextTrust: graph.contextTrust,
    quality: graph.quality,
    primaryOutcome: primary?.outcome ?? null,
    pathSummaries,
    confirmationLabels,
    invalidationLabels,
    conflictCodes,
    warnings: graph.warnings.slice(0, 12),
    mentorEligible: false,
    renderedNodeCount: Math.min(rendered.length, MAX_RENDERED_NODES),
  });
}
