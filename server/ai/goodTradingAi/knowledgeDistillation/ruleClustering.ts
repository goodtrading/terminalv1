/**
 * Rule Clustering — structural similarity only (no embeddings/NLP).
 */
import type { DistilledObservation, RuleCluster } from "@shared/goodTradingAiKnowledgeDistillation";
import { ruleClusterSchema } from "@shared/goodTradingAiKnowledgeDistillation";
import { conceptKeyFromText, normalizeText, tokenOverlap } from "./normalize";

export function clusterRules(observations: DistilledObservation[]): RuleCluster[] {
  const buckets = new Map<string, DistilledObservation[]>();
  for (const obs of observations) {
    const key = conceptKeyFromText(obs.text, obs.lenses);
    const list = buckets.get(key) ?? [];
    list.push(obs);
    buckets.set(key, list);
  }

  // Merge near-duplicate keys by token overlap OR same lens+priority pattern
  // (e.g. "Absorcion > Delta" / "absorcion pesa mas" → same concept).
  const entries = [...buckets.entries()];
  const merged = new Map<string, DistilledObservation[]>();
  const used = new Set<string>();
  const lensPrioSignature = (obs: DistilledObservation): string => {
    const lenses = [...obs.lenses].sort().join("+");
    const key = conceptKeyFromText(obs.text, obs.lenses);
    const prio = key.includes("|PRIO|") ? "PRIO" : "STMT";
    return `${lenses}|${prio}`;
  };
  for (let i = 0; i < entries.length; i++) {
    const [key, list] = entries[i]!;
    if (used.has(key)) continue;
    used.add(key);
    let canon = list[0]!.text;
    const members = [...list];
    const sig = lensPrioSignature(list[0]!);
    for (let j = i + 1; j < entries.length; j++) {
      const [k2, list2] = entries[j]!;
      if (used.has(k2)) continue;
      const sample = list2[0]!.text;
      const sameLensPrio = sig === lensPrioSignature(list2[0]!) && sig.endsWith("|PRIO");
      if (
        sameLensPrio ||
        tokenOverlap(canon, sample) >= 0.55 ||
        normalizeText(canon) === normalizeText(sample)
      ) {
        used.add(k2);
        members.push(...list2);
      }
    }
    const lenses = [...new Set(members.flatMap((m) => m.lenses))].slice(0, 8);
    const conceptKey = conceptKeyFromText(canon, lenses);
    merged.set(conceptKey, members);
  }

  const clusters: RuleCluster[] = [];
  let i = 0;
  for (const [conceptKey, members] of merged) {
    i++;
    const sorted = [...members].sort((a, b) => a.createdAtMs - b.createdAtMs);
    const canonicalText = sorted[0]!.text.slice(0, 400);
    clusters.push(
      ruleClusterSchema.parse({
        id: `clu_${String(i).padStart(4, "0")}`,
        conceptKey,
        canonicalText: canonicalText.length >= 4 ? canonicalText : `${canonicalText} rule`,
        memberObservationIds: sorted.map((m) => m.id).slice(0, 200),
        lenses: [...new Set(sorted.flatMap((m) => m.lenses))].slice(0, 8),
        frequency: sorted.length,
        mentorEligible: false,
      }),
    );
  }
  return clusters.sort((a, b) => b.frequency - a.frequency);
}