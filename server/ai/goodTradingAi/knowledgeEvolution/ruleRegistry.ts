/**
 * Rule Registry — persistent known rules with stable IDs.
 */
import type { DistilledObservation, RuleCluster } from "@shared/goodTradingAiKnowledgeDistillation";
import type { RegisteredRule, StableRuleId } from "@shared/goodTradingAiKnowledgeEvolution";
import { registeredRuleSchema } from "@shared/goodTradingAiKnowledgeEvolution";
import { buildStableRuleId, inferRuleKind, labelForRule } from "./ruleIds";

export function upsertRegistryFromObservations(
  observations: DistilledObservation[],
  clusters: RuleCluster[],
  existing: RegisteredRule[] = [],
): RegisteredRule[] {
  const map = new Map<StableRuleId, RegisteredRule>();
  for (const r of existing) map.set(r.id, r);
  const now = Date.now();

  const sources: Array<{ text: string; lenses: DistilledObservation["lenses"]; at: number; conceptKey: string }> = [];
  for (const c of clusters) {
    sources.push({
      text: c.canonicalText,
      lenses: c.lenses.length ? c.lenses : (["CONFIDENCE"] as DistilledObservation["lenses"]),
      at: now,
      conceptKey: c.conceptKey,
    });
  }
  for (const o of observations) {
    if (!o.lenses.length) continue;
    sources.push({
      text: o.text,
      lenses: o.lenses,
      at: o.createdAtMs,
      conceptKey: o.lenses.slice().sort().join("+"),
    });
  }

  for (const s of sources) {
    const kind = inferRuleKind(s.text, s.lenses);
    const id = buildStableRuleId(s.lenses, kind);
    const prev = map.get(id);
    if (!prev) {
      map.set(
        id,
        registeredRuleSchema.parse({
          id,
          kind,
          label: labelForRule(id, kind, s.lenses),
          lenses: s.lenses.slice(0, 8),
          conceptKey: s.conceptKey.slice(0, 160),
          createdAtMs: s.at,
          firstSeenAtMs: s.at,
          lastSeenAtMs: s.at,
          currentVersion: 1,
          mentorEligible: false,
        }),
      );
    } else {
      map.set(
        id,
        registeredRuleSchema.parse({
          ...prev,
          lastSeenAtMs: Math.max(prev.lastSeenAtMs, s.at),
          firstSeenAtMs: Math.min(prev.firstSeenAtMs, s.at),
          lenses: [...new Set([...prev.lenses, ...s.lenses])].slice(0, 8),
        }),
      );
    }
  }

  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}