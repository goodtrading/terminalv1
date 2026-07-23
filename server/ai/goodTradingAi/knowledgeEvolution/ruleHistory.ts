/**
 * Rule History — append-only counters from human signals. Never mutates Brain.
 */
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";
import type { RegisteredRule, RuleHistory } from "@shared/goodTradingAiKnowledgeEvolution";
import { ruleHistorySchema } from "@shared/goodTradingAiKnowledgeEvolution";
import { buildStableRuleId, inferRuleKind } from "./ruleIds";

export function buildHistories(
  rules: RegisteredRule[],
  observations: DistilledObservation[],
  previous: RuleHistory[] = [],
): RuleHistory[] {
  const prevMap = new Map(previous.map((h) => [h.ruleId, h]));
  const out: RuleHistory[] = [];

  for (const rule of rules) {
    const related = observations.filter((o) => {
      if (!o.lenses.length) return false;
      const id = buildStableRuleId(o.lenses, inferRuleKind(o.text, o.lenses));
      return id === rule.id;
    });
    const prev = prevMap.get(rule.id);
    let agreementCount = prev?.agreementCount ?? 0;
    let disagreementCount = prev?.disagreementCount ?? 0;
    let deferCount = prev?.deferCount ?? 0;
    let needsConditionsCount = prev?.needsConditionsCount ?? 0;
    let needsEvidenceCount = prev?.needsEvidenceCount ?? 0;
    let revisions = prev?.revisions ?? 0;
    let exceptionCount = prev?.exceptionCount ?? 0;
    let contradictionCount = prev?.contradictionCount ?? 0;

    // Rebuild from observations for determinism when previous empty; else accumulate delta by lastSeen
    if (!prev) {
      agreementCount = 0;
      disagreementCount = 0;
      deferCount = 0;
      needsConditionsCount = 0;
      needsEvidenceCount = 0;
      revisions = 0;
      exceptionCount = 0;
      contradictionCount = 0;
      for (const o of related) {
        for (const s of o.signals) {
          if (s === "AGREE") agreementCount++;
          if (s === "DISAGREE") {
            disagreementCount++;
            contradictionCount++;
          }
          if (s === "DEFER") deferCount++;
          if (s === "NEEDS_CONDITIONS") {
            needsConditionsCount++;
            exceptionCount++;
          }
          if (s === "NEEDS_MORE_EVIDENCE") needsEvidenceCount++;
          if (s === "REVISION") revisions++;
        }
      }
    } else {
      for (const o of related.filter((x) => x.createdAtMs > prev.lastSeenAtMs)) {
        for (const s of o.signals) {
          if (s === "AGREE") agreementCount++;
          if (s === "DISAGREE") {
            disagreementCount++;
            contradictionCount++;
          }
          if (s === "DEFER") deferCount++;
          if (s === "NEEDS_CONDITIONS") {
            needsConditionsCount++;
            exceptionCount++;
          }
          if (s === "NEEDS_MORE_EVIDENCE") needsEvidenceCount++;
          if (s === "REVISION") revisions++;
        }
      }
    }

    const times = related.map((o) => o.createdAtMs);
    const firstSeenAtMs = times.length ? Math.min(...times) : rule.firstSeenAtMs;
    const lastSeenAtMs = times.length ? Math.max(...times) : rule.lastSeenAtMs;
    const currentVersion = Math.max(1, (prev?.currentVersion ?? 1) + (revisions > (prev?.revisions ?? 0) ? 1 : 0));

    out.push(
      ruleHistorySchema.parse({
        ruleId: rule.id,
        createdAtMs: rule.createdAtMs,
        firstSeenAtMs,
        lastSeenAtMs,
        reviewCount: related.length || prev?.reviewCount || 0,
        agreementCount,
        disagreementCount,
        deferCount,
        needsConditionsCount,
        needsEvidenceCount,
        revisions,
        exceptionCount,
        contradictionCount,
        currentVersion,
        mentorEligible: false,
      }),
    );
  }
  return out;
}