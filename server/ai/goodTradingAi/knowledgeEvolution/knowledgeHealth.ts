/**
 * Knowledge Health metrics.
 */
import type {
  DependencyGraph,
  KnowledgeHealth,
  RegisteredRule,
  RuleHistory,
  RuleStability,
  RuleVolatility,
  TimelineEvent,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { knowledgeHealthSchema } from "@shared/goodTradingAiKnowledgeEvolution";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computeKnowledgeHealth(input: {
  rules: RegisteredRule[];
  histories: RuleHistory[];
  stabilities: RuleStability[];
  volatilities: RuleVolatility[];
  graph: DependencyGraph;
  timeline: TimelineEvent[];
  nowMs?: number;
}): KnowledgeHealth {
  const now = input.nowMs ?? Date.now();
  const n = Math.max(1, input.rules.length);
  const overallStability =
    input.stabilities.reduce((s, x) => s + x.stabilityScore, 0) / Math.max(1, input.stabilities.length);
  const covered = input.histories.filter((h) => h.reviewCount > 0).length;
  const overallCoverage = covered / n;
  const overallVolatility =
    input.volatilities.reduce((s, x) => s + x.volatilityScore, 0) / Math.max(1, input.volatilities.length);
  const ruleDensity = clamp01(input.rules.length / 50);
  const dependencyDensity = clamp01(input.graph.edges.length / Math.max(1, n * 3));
  const ages = input.rules.map((r) => Math.max(0, now - r.createdAtMs));
  const averageRuleAgeMs = ages.reduce((s, a) => s + a, 0) / ages.length || 0;
  const createdEvents = input.timeline.filter((e) => e.kind === "CREATED").length;
  const churnEvents = input.timeline.filter((e) =>
    ["REVISION", "DISAGREEMENT", "EXCEPTION", "OBSOLETE_FLAGGED"].includes(e.kind),
  ).length;
  const knowledgeGrowth = clamp01(createdEvents / Math.max(5, n));
  const knowledgeChurn = clamp01(churnEvents / Math.max(5, input.timeline.length || 1));

  return knowledgeHealthSchema.parse({
    overallStability: clamp01(overallStability),
    overallCoverage: clamp01(overallCoverage),
    overallVolatility: clamp01(overallVolatility),
    ruleDensity,
    dependencyDensity,
    averageRuleAgeMs,
    knowledgeGrowth,
    knowledgeChurn,
    mentorEligible: false,
  });
}