/**
 * AI-7 — Main deterministic Decision Graph engine.
 * Question + retrieved knowledge + optional validated MarketSnapshot → graph.
 * No OpenAI. No trading outcomes. No full Brain traversal.
 */
import type { MarketSnapshot } from "@shared/goodTradingAiMarket";
import type {
  DecisionEdge,
  DecisionGraphInternal,
  DecisionNode,
} from "@shared/goodTradingAiDecisionGraph";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { buildDecisionContext } from "./decisionContext";
import { detectDecisionConflicts } from "./conflictEngine";
import { evaluateNode } from "./nodeEvaluators";
import {
  buildPaths,
  MAX_DECISION_DEPTH,
  MAX_INTERNAL_NODES,
  pickPrimaryPath,
  propagateHypothesisState,
  pruneDecisionNodes,
} from "./pathEngine";
import { classifyDecisionQuality } from "./decisionQuality";
import { validateDecisionGraph } from "./decisionValidator";
import { toClientSafeDecisionGraph } from "./clientSafeProjection";
import {
  getDecisionGraphTemplate,
  selectDecisionGraphTemplate,
  type DecisionGraphTemplate,
} from "./templates";
import type { DecisionGraphClientSafe } from "@shared/goodTradingAiDecisionGraph";

export type EvaluateDecisionGraphInput = {
  question: string;
  scenarioLabel?: string;
  knowledgeEntries: GoodTradingKnowledgeEntry[];
  marketSnapshot?: MarketSnapshot | null;
  forceUntrusted?: boolean;
  /** Optional explicit template id */
  templateId?: string;
  nowMs?: number;
};

export type EvaluateDecisionGraphResult = {
  ok: boolean;
  graph: DecisionGraphInternal | null;
  clientSafe: DecisionGraphClientSafe | null;
  issues: Array<{ code: string; message: string }>;
  durationMs: number;
};

function instantiateNodes(template: DecisionGraphTemplate, env: Parameters<typeof evaluateNode>[1]): DecisionNode[] {
  const nodes: DecisionNode[] = [];
  for (const def of template.nodes.slice(0, MAX_INTERNAL_NODES)) {
    const r = evaluateNode(def.evalKey, env);
    nodes.push({
      id: def.id,
      kind: def.kind,
      label: def.label,
      priority: def.priority,
      state: r.state,
      knowledgeId: def.knowledgeId,
      detail: r.detail,
    });
  }
  return nodes;
}

function instantiateEdges(template: DecisionGraphTemplate): DecisionEdge[] {
  return template.edges
    .filter((e) => template.nodes.some((n) => n.id === e.from) && template.nodes.some((n) => n.id === e.to))
    .slice(0, 96)
    .map((e) => ({ ...e }));
}

/**
 * Evaluate a decision graph from context. Caps node count / depth.
 */
export function evaluateDecisionGraph(
  input: EvaluateDecisionGraphInput,
): EvaluateDecisionGraphResult {
  const t0 = performance.now();
  const context = buildDecisionContext({
    question: input.question,
    scenarioLabel: input.scenarioLabel,
    knowledgeEntries: input.knowledgeEntries,
    marketSnapshot: input.marketSnapshot,
    forceUntrusted: input.forceUntrusted,
    nowMs: input.nowMs,
  });

  const template =
    (input.templateId ? getDecisionGraphTemplate(input.templateId) : null) ??
    selectDecisionGraphTemplate(input.question);

  // Bound expansion: template nodes only (no full registry walk)
  const conflicts = detectDecisionConflicts({
    question: input.question,
    entries: input.knowledgeEntries.slice(0, 24),
  });

  const env = {
    context,
    questionLower: input.question.toLowerCase(),
    conflicts,
  };

  let nodes = instantiateNodes(template, env);
  const edges = instantiateEdges(template);
  nodes = propagateHypothesisState({ nodes, edges, context });
  nodes = pruneDecisionNodes(nodes, MAX_INTERNAL_NODES);
  // Drop edges that reference pruned nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  const prunedEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  void MAX_DECISION_DEPTH;

  const paths = buildPaths({ template, nodes, edges: prunedEdges });
  const primary = pickPrimaryPath(paths);
  const quality = classifyDecisionQuality({
    trust: context.trust,
    snapshotStale: context.snapshotStale,
    primaryOutcome: primary?.outcome ?? null,
    conflictCount: conflicts.length,
  });

  const durationMs = Math.round((performance.now() - t0) * 1000) / 1000;
  const warnings = [
    ...context.warnings,
    ...conflicts.map((c) => c.code),
  ].slice(0, 20);

  const graph: DecisionGraphInternal = {
    schemaVersion: "1.0",
    templateId: template.id,
    templateVersion: template.version,
    contextTrust: context.trust,
    quality,
    nodes,
    edges: prunedEdges,
    paths,
    primaryPathId: primary?.id ?? null,
    contradictions: conflicts.map((c) => c.message).slice(0, 12),
    warnings,
    evaluatedAtMs: context.nowMs,
    durationMs,
    mentorEligible: false,
  };

  const v = validateDecisionGraph(graph);
  if (!v.ok) {
    return {
      ok: false,
      graph: null,
      clientSafe: null,
      issues: v.issues,
      durationMs,
    };
  }

  return {
    ok: true,
    graph,
    clientSafe: toClientSafeDecisionGraph(graph),
    issues: [],
    durationMs,
  };
}
