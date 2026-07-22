/**
 * AI-7 — Decision graph validator (structure + forbidden trading outcomes).
 */
import {
  assertNoForbiddenTradingOutcome,
  decisionGraphInternalSchema,
  type DecisionGraphInternal,
} from "@shared/goodTradingAiDecisionGraph";
import { MAX_DECISION_DEPTH, MAX_INTERNAL_NODES, MAX_PATHS } from "./limits";

export type DecisionValidationIssue = { code: string; message: string };

export function validateDecisionGraph(graph: DecisionGraphInternal): {
  ok: boolean;
  issues: DecisionValidationIssue[];
} {
  const issues: DecisionValidationIssue[] = [];
  const parsed = decisionGraphInternalSchema.safeParse(graph);
  if (!parsed.success) {
    issues.push({
      code: "SCHEMA",
      message: parsed.error.issues[0]?.message ?? "invalid decision graph",
    });
    return { ok: false, issues };
  }

  if (graph.mentorEligible !== false) {
    issues.push({ code: "MENTOR_ELIGIBLE", message: "mentorEligible must be false" });
  }
  if (graph.nodes.length > MAX_INTERNAL_NODES) {
    issues.push({ code: "TOO_MANY_NODES", message: `nodes > ${MAX_INTERNAL_NODES}` });
  }
  if (graph.paths.length > MAX_PATHS) {
    issues.push({ code: "TOO_MANY_PATHS", message: `paths > ${MAX_PATHS}` });
  }
  for (const p of graph.paths) {
    if (p.nodeIds.length > MAX_DECISION_DEPTH + 2) {
      issues.push({ code: "PATH_TOO_DEEP", message: `path ${p.id} too deep` });
    }
    if (!assertNoForbiddenTradingOutcome(p.outcome)) {
      issues.push({ code: "FORBIDDEN_OUTCOME", message: p.outcome });
    }
  }
  for (const n of graph.nodes) {
    if (!assertNoForbiddenTradingOutcome(n.label) || (n.detail && !assertNoForbiddenTradingOutcome(n.detail))) {
      issues.push({ code: "FORBIDDEN_LABEL", message: n.id });
    }
  }
  for (const w of graph.warnings) {
    if (!assertNoForbiddenTradingOutcome(w)) {
      issues.push({ code: "FORBIDDEN_WARNING", message: w.slice(0, 40) });
    }
  }

  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      issues.push({ code: "DANGLING_EDGE", message: e.id });
    }
  }

  return { ok: issues.length === 0, issues };
}
