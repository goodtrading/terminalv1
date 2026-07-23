/**
 * Knowledge Compression — duplicates/variants/redundant/too-specific/too-general.
 */
import type {
  CompressionKind,
  CompressionReport,
  DistilledObservation,
  RuleCluster,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { compressionReportSchema } from "@shared/goodTradingAiKnowledgeDistillation";
import { normalizeText, tokenOverlap } from "./normalize";

export function compressClusters(
  observations: DistilledObservation[],
  clusters: RuleCluster[],
): CompressionReport {
  const kinds: Record<CompressionKind, number> = {
    DUPLICATE: 0,
    VARIANT: 0,
    REDUNDANT: 0,
    TOO_SPECIFIC: 0,
    TOO_GENERAL: 0,
    EQUIVALENT: 0,
  };
  const notes: string[] = [];
  let compressedCount = 0;

  for (const c of clusters) {
    if (c.frequency <= 1) continue;
    const members = observations.filter((o) => c.memberObservationIds.includes(o.id));
    const norms = members.map((m) => normalizeText(m.text));
    const uniqueNorms = new Set(norms);
    if (uniqueNorms.size === 1) {
      kinds.DUPLICATE += c.frequency - 1;
      compressedCount += c.frequency - 1;
      notes.push(`Duplicate cluster ${c.id}: ${c.frequency} identical norms`);
      continue;
    }
    let variantPairs = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const ov = tokenOverlap(members[i]!.text, members[j]!.text);
        if (ov >= 0.55) variantPairs++;
      }
    }
    if (variantPairs > 0) {
      kinds.VARIANT += variantPairs;
      compressedCount += Math.min(c.frequency - 1, variantPairs);
      notes.push(`Variant cluster ${c.id}: overlap variants=${variantPairs}`);
    }
    const avgLen = members.reduce((s, m) => s + m.text.length, 0) / members.length;
    if (avgLen > 280) {
      kinds.TOO_SPECIFIC += 1;
      notes.push(`Too-specific wording in ${c.id}`);
    }
    if (avgLen < 40 && c.frequency >= 2) {
      kinds.TOO_GENERAL += 1;
      notes.push(`Too-general wording in ${c.id}`);
    }
    if (c.frequency >= 3 && uniqueNorms.size <= 2) {
      kinds.REDUNDANT += c.frequency - uniqueNorms.size;
      kinds.EQUIVALENT += 1;
    }
  }

  return compressionReportSchema.parse({
    totalObservations: observations.length,
    totalClusters: clusters.length,
    compressedCount,
    kinds,
    notes: notes.slice(0, 40),
    mentorEligible: false,
  });
}