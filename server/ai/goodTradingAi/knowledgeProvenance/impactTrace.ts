/**
 * Impact Trace — affected rules, dependencies, modification impact, related proposals.
 */
import type {
  ImpactTrace,
  JustificationEvent,
  LineageGraph,
  ProvenanceRecord,
  StableRuleId,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { impactTraceSchema } from "@shared/goodTradingAiKnowledgeProvenance";

export function buildImpactTraces(input: {
  registry: ProvenanceRecord[];
  events: JustificationEvent[];
  lineage: LineageGraph;
  proposalIdsByRule?: Record<string, string[]>;
}): ImpactTrace[] {
  return input.registry.map((r) => {
    const related = input.lineage.edges
      .filter((e) => e.fromRuleId === r.stableRuleId || e.toRuleId === r.stableRuleId)
      .map((e) => (e.fromRuleId === r.stableRuleId ? e.toRuleId : e.fromRuleId));
    const deps = input.lineage.edges
      .filter((e) => e.fromRuleId === r.stableRuleId || e.toRuleId === r.stableRuleId)
      .map((e) => `${e.relation}:${e.fromRuleId}->${e.toRuleId}`);
    const challenges = input.events.filter(
      (e) =>
        e.stableRuleId === r.stableRuleId &&
        (e.kind === "CHALLENGED" || e.kind === "CONTRADICTION_FOUND" || e.kind === "EXCEPTION_ADDED"),
    ).length;
    const degree = related.length;
    const potentialModificationImpact =
      degree >= 4 || challenges >= 3 ? "HIGH" : degree >= 2 || challenges >= 1 ? "MEDIUM" : "LOW";
    const relatedProposalIds = (input.proposalIdsByRule?.[r.stableRuleId] ?? []).slice(0, 40);

    return impactTraceSchema.parse({
      ruleId: r.stableRuleId,
      affectedRules: [...new Set(related)].slice(0, 80),
      dependencies: deps.slice(0, 80),
      potentialModificationImpact,
      relatedProposalIds,
      detail: `degree=${degree}; challenges=${challenges}; origin=${r.origin}`,
      mentorEligible: false,
    });
  });
}

export function impactForRule(traces: ImpactTrace[], ruleId: StableRuleId): ImpactTrace | null {
  return traces.find((t) => t.ruleId === ruleId) ?? null;
}