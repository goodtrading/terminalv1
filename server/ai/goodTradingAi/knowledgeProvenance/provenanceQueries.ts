/**
 * Provenance Queries — origin, evolution, revisions, counterexamples, derived, superseded.
 */
import type {
  JustificationEvent,
  LineageGraph,
  ProvenanceQueryResult,
  ProvenanceRecord,
  StableRuleId,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { provenanceQueryResultSchema } from "@shared/goodTradingAiKnowledgeProvenance";

export function queryProvenance(input: {
  ruleId: StableRuleId;
  registry: ProvenanceRecord[];
  events: JustificationEvent[];
  lineage: LineageGraph;
}): ProvenanceQueryResult {
  const origin = input.registry.find((r) => r.stableRuleId === input.ruleId) ?? null;
  const fullEvolution = input.events
    .filter((e) => e.stableRuleId === input.ruleId)
    .sort((a, b) => a.atMs - b.atMs);
  const revisions = fullEvolution.filter((e) => e.kind === "REFINED" || e.kind === "REVIEWED");
  const counterexamples = fullEvolution.filter(
    (e) =>
      e.kind === "CHALLENGED" ||
      e.kind === "EXCEPTION_ADDED" ||
      e.kind === "CONTRADICTION_FOUND" ||
      e.rationale.opposingEvidence.length > 0,
  );
  const derivedRules = input.lineage.edges
    .filter(
      (e) =>
        e.fromRuleId === input.ruleId &&
        (e.relation === "childRule" || e.relation === "splitInto" || e.relation === "relatedRules"),
    )
    .map((e) => e.toRuleId);
  // Also rules that list this as parent
  const derivedFromParent = input.lineage.edges
    .filter((e) => e.toRuleId === input.ruleId && e.relation === "parentRule")
    .map((e) => e.fromRuleId);
  const supersededRules = input.lineage.edges
    .filter(
      (e) =>
        (e.fromRuleId === input.ruleId || e.toRuleId === input.ruleId) &&
        (e.relation === "supersededBy" || e.relation === "mergedFrom"),
    )
    .map((e) => (e.fromRuleId === input.ruleId ? e.toRuleId : e.fromRuleId));

  return provenanceQueryResultSchema.parse({
    ruleId: input.ruleId,
    origin,
    fullEvolution: fullEvolution.slice(0, 500),
    revisions: revisions.slice(0, 200),
    counterexamples: counterexamples.slice(0, 200),
    derivedRules: [...new Set([...derivedRules, ...derivedFromParent])].slice(0, 80),
    supersededRules: [...new Set(supersededRules)].slice(0, 80),
    mentorEligible: false,
  });
}