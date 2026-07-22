/**
 * AI-7.1 — Decision Graph size limits + priority-preserving prune.
 *
 * Internal ≤20 nodes · rendered ≤12 · paths ≤2 · depth ≤5.
 * Prune order (drop last): supporting LOW → alternative extras → then never
 * drop invalidations/conflicts/guards before low evidence.
 */
import type { DecisionNode, DecisionPath } from "@shared/goodTradingAiDecisionGraph";
import { priorityRank, type DecisionPriorityTier } from "./priority";

/** Internal graph hard cap (contract AI-7.1). */
export const MAX_INTERNAL_NODES = 20;
/** Client-safe / rendered projection cap. */
export const MAX_RENDERED_NODES = 12;
/** Max evaluated paths retained. */
export const MAX_PATHS = 2;
/** Max path depth (node hops). */
export const MAX_DECISION_DEPTH = 5;

/** @deprecated Use MAX_INTERNAL_NODES — kept as alias for callers. */
export const MAX_DECISION_NODES = MAX_INTERNAL_NODES;

/**
 * Retention priority for pruning (higher = keep longer).
 * Invalidations / critical conflicts / data-quality guards outrank LOW supporting evidence.
 */
export function nodeRetentionScore(n: DecisionNode): number {
  let score = priorityRank(n.priority) * 10;
  switch (n.kind) {
    case "CONTEXT":
      score += 100;
      break;
    case "GUARD":
      score += n.state === "BLOCKED" || n.state === "STALE" ? 95 : 70;
      break;
    case "CONFLICT":
      score += n.state === "CONFLICTED" ? 90 : 50;
      break;
    case "INVALIDATION":
      score += n.state === "INVALIDATED" ? 92 : 60;
      break;
    case "HYPOTHESIS":
      score += 85;
      break;
    case "CONCLUSION":
      score += 75;
      break;
    case "CONFIRMATION":
      score += n.state === "SUPPORTED" ? 65 : 40;
      break;
    case "EVIDENCE":
      score += 35;
      break;
    default:
      score += 20;
  }
  // Never prefer pruning triggered invalidation for LOW evidence elsewhere
  if (n.kind === "INVALIDATION" && n.state === "INVALIDATED") score += 50;
  if (n.kind === "CONFIRMATION" && n.priority === "LOW" && n.state !== "SUPPORTED") {
    score -= 15;
  }
  return score;
}

/**
 * Prune to maxNodes preserving methodological order.
 * Never removes a triggered INVALIDATION while a LOW unsupported CONFIRMATION remains.
 */
export function pruneDecisionNodes(
  nodes: DecisionNode[],
  maxNodes: number = MAX_INTERNAL_NODES,
): DecisionNode[] {
  if (nodes.length <= maxNodes) return nodes;

  const sorted = [...nodes].sort((a, b) => nodeRetentionScore(b) - nodeRetentionScore(a));
  const kept = sorted.slice(0, maxNodes);

  const swapIn = (
    missing: DecisionNode[],
    victimPred: (n: DecisionNode) => boolean,
  ) => {
    for (const item of missing) {
      if (kept.some((k) => k.id === item.id)) continue;
      const victim = [...kept]
        .map((n, i) => ({ n, i, s: nodeRetentionScore(n) }))
        .filter((x) => victimPred(x.n))
        .sort((a, b) => a.s - b.s)[0];
      if (victim) kept[victim.i] = item;
    }
  };

  swapIn(
    nodes.filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED"),
    (n) =>
      n.kind === "EVIDENCE" ||
      n.kind === "CONFIRMATION" ||
      n.priority === "LOW",
  );
  swapIn(
    nodes.filter((n) => n.kind === "CONFLICT" && n.state === "CONFLICTED"),
    (n) => n.kind === "EVIDENCE" || n.priority === "LOW",
  );
  swapIn(
    nodes.filter(
      (n) =>
        n.kind === "GUARD" && (n.state === "BLOCKED" || n.state === "STALE"),
    ),
    (n) => n.kind === "EVIDENCE" || n.priority === "LOW",
  );

  return kept;
}

/** Rendered subset for client-safe labels / debug UI. */
export function selectRenderedNodes(nodes: DecisionNode[]): DecisionNode[] {
  return pruneDecisionNodes(nodes, MAX_RENDERED_NODES);
}

export function limitPaths(paths: DecisionPath[]): DecisionPath[] {
  if (paths.length <= MAX_PATHS) return paths;
  return [...paths]
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, MAX_PATHS);
}

export function describeLimitPolicy(): {
  maxInternalNodes: number;
  maxRenderedNodes: number;
  maxPaths: number;
  maxDepth: number;
  pruneOrder: string[];
} {
  return {
    maxInternalNodes: MAX_INTERNAL_NODES,
    maxRenderedNodes: MAX_RENDERED_NODES,
    maxPaths: MAX_PATHS,
    maxDepth: MAX_DECISION_DEPTH,
    pruneOrder: [
      "1_data_quality_context_guards",
      "2_critical_conflicts",
      "3_triggered_invalidations",
      "4_required_confirmations",
      "5_primary_hypothesis",
      "6_alternative_paths",
      "7_supporting_low_evidence_pruned_first",
    ],
  };
}

export type { DecisionPriorityTier };
