/**
 * AI-7.3.12 — Recluster on HumanDecisionUnits (not document votes).
 */
import {
  auditedClusterSchema,
  type AuditedCluster,
  type ClusterSupportClass,
  type DocumentObservation,
  type HumanDecisionUnit,
} from "@shared/goodTradingAiIndependentEvidence";
import { conceptKeyFromText, normalizeText, tokenOverlap } from "../normalize";
import { claimBucketKey, weightedIndependentSupport } from "./correlatedSupport";

function classifySupport(input: {
  decisionUnitMemberCount: number;
  independentCaseCount: number;
  documentMemberCount: number;
  withinCaseClarificationCount: number;
  weighted: number;
}): ClusterSupportClass {
  if (input.decisionUnitMemberCount <= 0) return "INSUFFICIENT_INDEPENDENT_SUPPORT";
  if (input.decisionUnitMemberCount === 1 && input.documentMemberCount > 1) {
    return "WITHIN_CASE_ENRICHED_OBSERVATION";
  }
  if (input.decisionUnitMemberCount === 1) return "SINGLE_CASE_OBSERVATION";
  if (input.independentCaseCount >= 2 && input.weighted >= 1.5) {
    return "CROSS_CASE_REPEATED_PATTERN";
  }
  if (input.independentCaseCount >= 2 && input.withinCaseClarificationCount > 0) {
    return "MIXED_CLUSTER";
  }
  if (input.weighted < 1.25) return "INSUFFICIENT_INDEPENDENT_SUPPORT";
  return "MIXED_CLUSTER";
}

export function reclusterDecisionUnits(input: {
  units: HumanDecisionUnit[];
  documents: DocumentObservation[];
}): AuditedCluster[] {
  const buckets = new Map<string, HumanDecisionUnit[]>();
  for (const u of input.units) {
    const key = claimBucketKey(u);
    const list = buckets.get(key) ?? [];
    list.push(u);
    buckets.set(key, list);
  }

  // Merge near-duplicate claim buckets
  const entries = Array.from(buckets.entries());
  const merged = new Map<string, HumanDecisionUnit[]>();
  const used = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const [key, list] = entries[i]!;
    if (used.has(key)) continue;
    used.add(key);
    const members = [...list];
    const sample = list[0]!.claimSummary;
    for (let j = i + 1; j < entries.length; j++) {
      const [k2, list2] = entries[j]!;
      if (used.has(k2)) continue;
      if (tokenOverlap(sample, list2[0]!.claimSummary) >= 0.55) {
        used.add(k2);
        members.push(...list2);
      }
    }
    const conceptKey = conceptKeyFromText(sample, members.flatMap((m) => m.lenses));
    merged.set(conceptKey, members);
  }

  const clusters: AuditedCluster[] = [];
  let i = 0;
  for (const [conceptKey, members] of Array.from(merged.entries())) {
    i++;
    const unitIds = members.map((m: HumanDecisionUnit) => m.unitId);
    const docs = input.documents.filter((d) =>
      unitIds.some((id: string) => id === `${d.sessionId}|${d.questionId}`),
    );
    const sessions = new Set(members.map((m: HumanDecisionUnit) => m.sessionId));
    const revisionCount = docs.filter((d) => d.documentType === "REVISION").length;
    const addendumCount = docs.filter((d) => d.documentType === "ADDENDUM").length;
    const withinCaseClarificationCount = docs.filter(
      (d) => d.documentType === "REVISION" || d.documentType === "ADDENDUM",
    ).length;
    const independentCaseCount = members.length;
    const weighted = weightedIndependentSupport(members);
    const crossCaseSupportCount = members.length >= 2 ? members.length : 0;
    const supportClass = classifySupport({
      decisionUnitMemberCount: members.length,
      independentCaseCount,
      documentMemberCount: docs.length,
      withinCaseClarificationCount,
      weighted,
    });
    clusters.push(
      auditedClusterSchema.parse({
        id: `ieu_clu_${String(i).padStart(4, "0")}`,
        conceptKey: conceptKey.slice(0, 160),
        documentMemberCount: docs.length,
        decisionUnitMemberCount: members.length,
        independentCaseCount,
        sessionCount: sessions.size,
        crossCaseSupportCount,
        withinCaseClarificationCount,
        revisionCount,
        addendumCount,
        supportClass,
        weightedIndependentSupport: weighted,
        lenses: Array.from(new Set(members.flatMap((m: HumanDecisionUnit) => m.lenses))).slice(0, 8),
        memberUnitIds: unitIds.slice(0, 40),
        mentorEligible: false,
      }),
    );
  }
  return clusters.sort((a, b) => b.independentCaseCount - a.independentCaseCount);
}

/** Synthetic distilled observation text from a decision unit — no full answer dump. */
export function decisionUnitToSyntheticText(unit: HumanDecisionUnit): string {
  const parts = [
    `unit:${unit.unitId}`,
    unit.answerType ? `type:${unit.answerType}` : "",
    unit.dependsFlag ? "depends:true" : "",
    `claim:${unit.claimSummary}`,
    `conds:${unit.conditionCount}`,
    `confirms:${unit.confirmationCount}`,
    `invalidations:${unit.invalidationCount}`,
    `lenses:${unit.lenses.join("+")}`,
  ].filter(Boolean);
  const text = parts.join(" | ");
  return text.length >= 4 ? text.slice(0, 400) : `${text} rule`;
}

export function normalizeClaimKey(text: string): string {
  return normalizeText(text).slice(0, 80);
}
