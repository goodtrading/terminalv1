/**
 * Keystone Detection — high dependency / impact rules.
 */
import type {
  DependencyGraph,
  KeystoneScore,
  RegisteredRule,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { keystoneScoreSchema } from "@shared/goodTradingAiKnowledgeEvolution";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function detectKeystones(rules: RegisteredRule[], graph: DependencyGraph): KeystoneScore[] {
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const e of graph.edges) {
    outDeg.set(e.fromRuleId, (outDeg.get(e.fromRuleId) ?? 0) + 1);
    inDeg.set(e.toRuleId, (inDeg.get(e.toRuleId) ?? 0) + 1);
  }
  const maxDep = Math.max(1, ...rules.map((r) => (outDeg.get(r.id) ?? 0) + (inDeg.get(r.id) ?? 0)));
  return rules.map((r) => {
    const down = outDeg.get(r.id) ?? 0;
    const up = inDeg.get(r.id) ?? 0;
    const dependencyCount = down + up;
    const downstreamImpact = clamp01(down / maxDep);
    const upstreamImpact = clamp01(up / maxDep);
    const keystoneScore = clamp01(0.45 * downstreamImpact + 0.35 * upstreamImpact + 0.2 * (dependencyCount / maxDep));
    return keystoneScoreSchema.parse({
      ruleId: r.id,
      dependencyCount,
      downstreamImpact,
      upstreamImpact,
      keystoneScore,
      mentorEligible: false,
    });
  }).sort((a, b) => b.keystoneScore - a.keystoneScore);
}