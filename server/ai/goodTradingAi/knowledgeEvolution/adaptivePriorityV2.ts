/**
 * Adaptive Priority Engine v2.
 * HIGH_VOLATILITY → HIGH_CONFLICT → HIGH_INFORMATION_GAIN → LOW_COVERAGE → LOW_STABILITY → LOW_CONFIDENCE → RANDOM
 * Compatible export for AI-7.3.4 adaptive queue consumers.
 */
import type {
  AdaptivePriorityItem,
  AdaptivePriorityV2Driver,
  RuleHistory,
  RuleStability,
  RuleVolatility,
  KeystoneScore,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { adaptivePriorityItemSchema } from "@shared/goodTradingAiKnowledgeEvolution";

const DRIVER_RANK: AdaptivePriorityV2Driver[] = [
  "HIGH_VOLATILITY",
  "HIGH_CONFLICT",
  "HIGH_INFORMATION_GAIN",
  "LOW_COVERAGE",
  "LOW_STABILITY",
  "LOW_CONFIDENCE",
  "RANDOM",
];

function rankOf(drivers: AdaptivePriorityV2Driver[]): number {
  let best = DRIVER_RANK.length;
  for (const d of drivers) {
    const i = DRIVER_RANK.indexOf(d);
    if (i >= 0 && i < best) best = i;
  }
  return best;
}

export function buildAdaptivePriorityV2(input: {
  histories: RuleHistory[];
  stabilities: RuleStability[];
  volatilities: RuleVolatility[];
  keystones: KeystoneScore[];
  limit?: number;
}): AdaptivePriorityItem[] {
  const limit = input.limit ?? 40;
  const stab = new Map(input.stabilities.map((s) => [s.ruleId, s]));
  const vol = new Map(input.volatilities.map((v) => [v.ruleId, v]));
  const key = new Map(input.keystones.map((k) => [k.ruleId, k]));
  const items: AdaptivePriorityItem[] = [];

  for (const h of input.histories) {
    const s = stab.get(h.ruleId);
    const v = vol.get(h.ruleId);
    const k = key.get(h.ruleId);
    const drivers: AdaptivePriorityV2Driver[] = [];
    if ((v?.volatilityScore ?? 0) >= 0.55) drivers.push("HIGH_VOLATILITY");
    if (h.disagreementCount + h.contradictionCount >= 2) drivers.push("HIGH_CONFLICT");
    if ((k?.keystoneScore ?? 0) >= 0.5 || (v?.volatilityScore ?? 0) >= 0.4) {
      drivers.push("HIGH_INFORMATION_GAIN");
    }
    if (h.reviewCount <= 1) drivers.push("LOW_COVERAGE");
    if ((s?.stabilityScore ?? 1) < 0.4) drivers.push("LOW_STABILITY");
    if (h.needsEvidenceCount + h.deferCount >= 2 || (s?.consistency ?? 1) < 0.45) {
      drivers.push("LOW_CONFIDENCE");
    }
    if (!drivers.length) drivers.push("RANDOM");

    const primary = rankOf(drivers);
    const priorityScore = Math.max(
      0,
      Math.min(
        1,
        1 - primary / DRIVER_RANK.length + 0.15 * (v?.volatilityScore ?? 0) + 0.1 * (k?.keystoneScore ?? 0),
      ),
    );

    items.push(
      adaptivePriorityItemSchema.parse({
        ruleId: h.ruleId,
        drivers: drivers.slice(0, 4),
        priorityScore,
        reason: `drivers=${drivers.join(",")}; vol=${(v?.volatilityScore ?? 0).toFixed(2)}; stab=${(s?.stabilityScore ?? 0).toFixed(2)}`,
        mentorEligible: false,
      }),
    );
  }

  return items
    .sort((a, b) => {
      const ra = rankOf(a.drivers);
      const rb = rankOf(b.drivers);
      if (ra !== rb) return ra - rb;
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, limit);
}

/** Map v2 drivers onto 7.3.4-compatible labels for dual-path consumers. */
export function mapPriorityV2ToDistillationDrivers(
  drivers: AdaptivePriorityV2Driver[],
): Array<"HIGH_CONFLICT" | "HIGH_INFORMATION_GAIN" | "LOW_COVERAGE" | "LOW_CONFIDENCE" | "RANDOM"> {
  const out: Array<"HIGH_CONFLICT" | "HIGH_INFORMATION_GAIN" | "LOW_COVERAGE" | "LOW_CONFIDENCE" | "RANDOM"> = [];
  for (const d of drivers) {
    if (d === "HIGH_VOLATILITY" || d === "HIGH_CONFLICT") out.push("HIGH_CONFLICT");
    else if (d === "HIGH_INFORMATION_GAIN") out.push("HIGH_INFORMATION_GAIN");
    else if (d === "LOW_COVERAGE" || d === "LOW_STABILITY") out.push("LOW_COVERAGE");
    else if (d === "LOW_CONFIDENCE") out.push("LOW_CONFIDENCE");
    else out.push("RANDOM");
  }
  return [...new Set(out)].slice(0, 4) as Array<
    "HIGH_CONFLICT" | "HIGH_INFORMATION_GAIN" | "LOW_COVERAGE" | "LOW_CONFIDENCE" | "RANDOM"
  >;
}