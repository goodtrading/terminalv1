/**
 * Provenance Registry — persistent per-rule origin metadata.
 * Aligns with Evolution RULE_* IDs. Never free-text IDs.
 */
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";
import type { RegisteredRule } from "@shared/goodTradingAiKnowledgeEvolution";
import type { ProvenanceOrigin, ProvenanceRecord } from "@shared/goodTradingAiKnowledgeProvenance";
import { provenanceRecordSchema } from "@shared/goodTradingAiKnowledgeProvenance";
import { buildStableRuleId, inferRuleKind } from "../knowledgeEvolution/ruleIds";

export function upsertProvenanceRegistry(input: {
  evolutionRules?: RegisteredRule[];
  observations?: DistilledObservation[];
  existing?: ProvenanceRecord[];
  createdBy?: string;
}): ProvenanceRecord[] {
  const map = new Map<string, ProvenanceRecord>();
  for (const r of input.existing ?? []) map.set(r.stableRuleId, r);
  const createdBy = input.createdBy ?? "system:provenance";
  const now = Date.now();

  for (const er of input.evolutionRules ?? []) {
    const prev = map.get(er.id);
    if (!prev) {
      map.set(
        er.id,
        provenanceRecordSchema.parse({
          stableRuleId: er.id,
          origin: "KNOWLEDGE_EVOLUTION" as ProvenanceOrigin,
          createdAtMs: er.createdAtMs,
          createdBy,
          currentVersion: er.currentVersion,
          mentorEligible: false,
        }),
      );
    } else {
      map.set(
        er.id,
        provenanceRecordSchema.parse({
          ...prev,
          currentVersion: Math.max(prev.currentVersion, er.currentVersion),
        }),
      );
    }
  }

  for (const o of input.observations ?? []) {
    if (!o.lenses.length) continue;
    const kind = inferRuleKind(o.text, o.lenses);
    const id = buildStableRuleId(o.lenses, kind);
    const origin: ProvenanceOrigin =
      o.sourceKind === "HUMAN_REVIEW" ? "HUMAN_REVIEW" : "CRITICAL_CALIBRATION";
    const prev = map.get(id);
    if (!prev) {
      map.set(
        id,
        provenanceRecordSchema.parse({
          stableRuleId: id,
          origin,
          createdAtMs: o.createdAtMs || now,
          createdBy,
          sourceSession: o.sessionId,
          sourceReview: o.itemId,
          currentVersion: 1,
          mentorEligible: false,
        }),
      );
    } else {
      map.set(
        id,
        provenanceRecordSchema.parse({
          ...prev,
          sourceSession: prev.sourceSession ?? o.sessionId,
          sourceReview: prev.sourceReview ?? o.itemId,
        }),
      );
    }
  }

  return [...map.values()].sort((a, b) => a.stableRuleId.localeCompare(b.stableRuleId));
}