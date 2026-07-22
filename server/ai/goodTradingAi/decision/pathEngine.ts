/**
 * AI-7 — Path evaluation + state propagation (bounded nodes/depth).
 * AI-7.1 limits: internal ≤20, paths ≤2, depth ≤5.
 */
import type {
  DecisionEdge,
  DecisionNode,
  DecisionPath,
  DecisionPathOutcome,
  DecisionNodeState,
} from "@shared/goodTradingAiDecisionGraph";
import { applyEvidenceHierarchy } from "./evidenceHierarchy";
import type { DecisionContext } from "./decisionContext";
import { sortByPriorityDesc } from "./priority";
import type { DecisionGraphTemplate } from "./templates";
import { limitPaths, MAX_DECISION_DEPTH } from "./limits";

export {
  MAX_DECISION_DEPTH,
  MAX_DECISION_NODES,
  MAX_INTERNAL_NODES,
  MAX_PATHS,
  MAX_RENDERED_NODES,
  pruneDecisionNodes,
  selectRenderedNodes,
  limitPaths,
  describeLimitPolicy,
  nodeRetentionScore,
} from "./limits";

export function propagateHypothesisState(params: {
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  context: DecisionContext;
}): DecisionNode[] {
  const byId = new Map(params.nodes.map((n) => [n.id, { ...n }]));
  const hyp = [...byId.values()].find((n) => n.kind === "HYPOTHESIS");
  if (!hyp) return [...byId.values()];

  let state: DecisionNodeState = hyp.state;
  for (const e of params.edges) {
    if (e.to !== hyp.id) continue;
    const from = byId.get(e.from);
    if (!from) continue;
    const relation = applyEvidenceHierarchy({
      proposed: e.relation,
      trust: params.context.trust,
      stale: params.context.snapshotStale || from.state === "STALE" || from.state === "BLOCKED",
    });

    if (from.state === "INVALIDATED" || relation === "INVALIDATES") {
      if (from.kind === "INVALIDATION" && from.state === "INVALIDATED") {
        state = "INVALIDATED";
        break;
      }
      if (relation === "INVALIDATES" && from.state === "INVALIDATED") {
        state = "INVALIDATED";
        break;
      }
    }
    if (from.state === "CONFLICTED" || relation === "CONFLICTS") {
      if (from.kind === "CONFLICT" && from.state === "CONFLICTED") {
        state = "CONFLICTED";
      }
    }
    if (from.state === "BLOCKED" && from.kind === "GUARD") {
      if (state !== "INVALIDATED") state = "BLOCKED";
    }
    if (from.state === "STALE" && state === "ACTIVE") {
      state = "STALE";
    }
    if (
      relation === "SUPPORTS" &&
      (from.state === "SUPPORTED" || from.state === "ACTIVE") &&
      state === "ACTIVE"
    ) {
      state = "SUPPORTED";
    }
    if (relation === "WEAKENS" && from.state === "BLOCKED" && state === "SUPPORTED") {
      state = "WEAKENED";
    }
  }

  const confHits = [...byId.values()].filter(
    (n) => n.kind === "CONFIRMATION" && n.state === "SUPPORTED",
  ).length;
  if (state === "ACTIVE" && confHits >= 1) state = "SUPPORTED";
  if (state === "ACTIVE" && confHits === 0) {
    const inv = [...byId.values()].find(
      (n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED",
    );
    if (!inv) state = "INSUFFICIENT";
  }

  byId.set(hyp.id, { ...hyp, state });
  return [...byId.values()];
}

export function buildPaths(params: {
  template: DecisionGraphTemplate;
  nodes: DecisionNode[];
  edges: DecisionEdge[];
}): DecisionPath[] {
  const byId = new Map(params.nodes.map((n) => [n.id, n]));
  const hyp = params.nodes.find((n) => n.kind === "HYPOTHESIS");
  const conc = params.nodes.find((n) => n.kind === "CONCLUSION");
  if (!hyp) return [];

  const confirmationIds = params.nodes
    .filter((n) => n.kind === "CONFIRMATION" && n.state === "SUPPORTED")
    .map((n) => n.id);
  const invalidationIds = params.nodes
    .filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED")
    .map((n) => n.id);
  const conflictCodes = params.nodes
    .filter((n) => n.kind === "CONFLICT" && n.state === "CONFLICTED")
    .flatMap((n) => (n.detail ? n.detail.split(",") : []));

  const outcome = hypothesisToOutcome(hyp.state, { nodes: params.nodes });
  const nodeIds = ["ctx", hyp.id, ...confirmationIds.slice(0, 3), ...invalidationIds.slice(0, 2)]
    .filter((id) => byId.has(id))
    .slice(0, MAX_DECISION_DEPTH + 1);
  if (conc) nodeIds.push(conc.id);

  const primary: DecisionPath = {
    id: `path_${params.template.id}`,
    nodeIds: [...new Set(nodeIds)].slice(0, MAX_DECISION_DEPTH + 2),
    outcome,
    priority: hyp.priority,
    confirmationIds,
    invalidationIds,
    conflictCodes: conflictCodes.slice(0, 12),
  };

  const paths: DecisionPath[] = [primary];
  if (invalidationIds.length > 0 || conflictCodes.length > 0) {
    paths.push({
      id: `path_alt_${params.template.id}`,
      nodeIds: [
        ...new Set(
          (["ctx", hyp.id, ...invalidationIds, conc?.id].filter(Boolean) as string[]),
        ),
      ].slice(0, MAX_DECISION_DEPTH + 2),
      outcome:
        invalidationIds.length > 0 ? "HYPOTHESIS_INVALIDATED" : "READING_CONFLICTED",
      priority: "CRITICAL",
      confirmationIds: [],
      invalidationIds,
      conflictCodes: conflictCodes.slice(0, 12),
    });
  }

  return limitPaths(paths);
}

function hypothesisToOutcome(
  state: DecisionNodeState,
  params: { nodes: DecisionNode[] },
): DecisionPathOutcome {
  const nodes = params.nodes;
  const guardBlocked = nodes.some((n) => n.kind === "GUARD" && n.state === "BLOCKED");
  const ctxNode = nodes.find((n) => n.kind === "CONTEXT");

  if (ctxNode?.state === "BLOCKED" || guardBlocked) {
    if (
      ctxNode?.detail === "UNTRUSTED_SCENARIO" ||
      nodes.some((n) => n.detail === "UNTRUSTED_GUARD")
    ) {
      return "CONTEXT_UNTRUSTED";
    }
    if (ctxNode?.state === "STALE" || nodes.some((n) => n.state === "STALE")) {
      return "CONTEXT_STALE";
    }
    return "GUARD_BLOCKED";
  }
  if (state === "INVALIDATED") return "HYPOTHESIS_INVALIDATED";
  if (state === "CONFLICTED") return "READING_CONFLICTED";
  if (state === "STALE") return "CONTEXT_STALE";
  if (state === "BLOCKED") return "GUARD_BLOCKED";
  if (state === "WEAKENED") return "HYPOTHESIS_WEAKENED";
  if (state === "SUPPORTED") return "HYPOTHESIS_SUPPORTED";
  if (state === "INSUFFICIENT") return "EVIDENCE_INSUFFICIENT";
  if (state === "ACTIVE") return "HYPOTHESIS_OPEN";
  return "NEEDS_MORE_LENSES";
}

export function pickPrimaryPath(paths: DecisionPath[]): DecisionPath | null {
  if (paths.length === 0) return null;
  return sortByPriorityDesc(paths)[0] ?? null;
}
