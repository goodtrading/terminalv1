/**
 * Conflict Heatmap — lens-pair matrix as structured data (no charts).
 */
import type {
  ConflictHeatmap,
  DistilledObservation,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { conflictHeatmapSchema } from "@shared/goodTradingAiKnowledgeDistillation";
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";

const CONFLICT_SIGNALS = new Set([
  "DISAGREE",
  "NEEDS_CONDITIONS",
  "NEEDS_MORE_EVIDENCE",
  "DEFER",
]);

function pairKey(a: EvidenceLens, b: EvidenceLens): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildConflictHeatmap(observations: DistilledObservation[]): ConflictHeatmap {
  const map = new Map<string, { count: number; last: number; a: EvidenceLens; b: EvidenceLens }>();
  const conflictObs = observations.filter(
    (o) => o.signals.some((s) => CONFLICT_SIGNALS.has(s)) || o.lenses.length >= 2,
  );
  for (const o of conflictObs) {
    const lenses = o.lenses.length >= 2 ? o.lenses : o.lenses;
    if (lenses.length < 2) continue;
    const isConflictish =
      o.signals.some((s) => CONFLICT_SIGNALS.has(s)) ||
      /\b(conflict|vs|versus|contra|pero|but|however)\b/i.test(o.text);
    if (!isConflictish) continue;
    for (let i = 0; i < lenses.length; i++) {
      for (let j = i + 1; j < lenses.length; j++) {
        const a = lenses[i]!;
        const b = lenses[j]!;
        const k = pairKey(a, b);
        const prev = map.get(k) ?? { count: 0, last: 0, a: a < b ? a : b, b: a < b ? b : a };
        prev.count += 1;
        prev.last = Math.max(prev.last, o.createdAtMs);
        map.set(k, prev);
      }
    }
  }
  const total = [...map.values()].reduce((s, v) => s + v.count, 0) || 1;
  const cells = [...map.values()]
    .map((v) => {
      const frequency = v.count / total;
      const confidence = v.count >= 5 ? "HIGH" : v.count >= 2 ? "MEDIUM" : "LOW";
      return {
        lensA: v.a,
        lensB: v.b,
        count: v.count,
        frequency,
        lastSeenAtMs: v.last,
        confidence: confidence as "LOW" | "MEDIUM" | "HIGH",
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);

  return conflictHeatmapSchema.parse({
    cells,
    totalConflicts: cells.reduce((s, c) => s + c.count, 0),
    mentorEligible: false,
  });
}