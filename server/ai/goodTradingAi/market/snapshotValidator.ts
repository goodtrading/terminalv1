import {
  marketSnapshotSchema,
  type MarketSnapshot,
} from "@shared/goodTradingAiMarket";

export type SnapshotValidationIssue = { code: string; message: string };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Validate snapshot: schema + no empty/NaN/impossible/dupe providers/invalid timestamp.
 */
export function validateMarketSnapshot(snapshot: MarketSnapshot): {
  ok: boolean;
  snapshot: MarketSnapshot;
  issues: SnapshotValidationIssue[];
} {
  const issues: SnapshotValidationIssue[] = [];
  const parsed = marketSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return {
      ok: false,
      snapshot,
      issues: [
        {
          code: "SCHEMA",
          message: parsed.error.issues[0]?.message ?? "invalid snapshot schema",
        },
      ],
    };
  }
  const s = parsed.data;

  const ts = Date.parse(s.timestamp);
  if (!Number.isFinite(ts)) {
    issues.push({ code: "INVALID_TIMESTAMP", message: "timestamp no parseable" });
  } else {
    const ageMs = Date.now() - ts;
    // Allow future skew up to 2 min (clock) and past up to 7 days for simulate
    if (ageMs < -120_000) {
      issues.push({ code: "TIMESTAMP_FUTURE", message: "timestamp demasiado en el futuro" });
    }
    if (ageMs > 7 * 24 * 3600_000) {
      issues.push({ code: "TIMESTAMP_STALE", message: "timestamp demasiado antiguo" });
    }
  }

  if (!s.symbol.trim()) {
    issues.push({ code: "EMPTY_SYMBOL", message: "symbol vacío" });
  }

  const scoreKeys = ["marketConfidence", "confluence", "risk", "snapshotQuality"] as const;
  for (const k of scoreKeys) {
    if (!isFiniteNumber(s.scores[k]) || s.scores[k] < 0 || s.scores[k] > 100) {
      issues.push({ code: "IMPOSSIBLE_SCORE", message: `scores.${k} inválido` });
    }
  }

  if (!isFiniteNumber(s.confidence) || s.confidence < 0 || s.confidence > 1) {
    issues.push({ code: "IMPOSSIBLE_CONFIDENCE", message: "confidence fuera de rango" });
  }

  if (s.price.displayRef !== undefined && !isFiniteNumber(s.price.displayRef)) {
    issues.push({ code: "NAN_PRICE", message: "displayRef NaN" });
  }

  const seen = new Set<string>();
  for (const p of s.providersUsed) {
    if (seen.has(p)) {
      issues.push({ code: "DUPLICATE_PROVIDER", message: `provider duplicado: ${p}` });
      break;
    }
    seen.add(p);
  }

  // Evidence provider dupes by id
  const evIds = new Set<string>();
  for (const e of s.evidence) {
    if (evIds.has(e.id)) {
      issues.push({ code: "DUPLICATE_EVIDENCE", message: e.id });
      break;
    }
    evIds.add(e.id);
    if (!isFiniteNumber(e.weight) || !isFiniteNumber(e.confidence)) {
      issues.push({ code: "NAN_EVIDENCE", message: e.id });
    }
  }

  if (!s.marketRegime.summary.trim() || !s.gamma.summary.trim()) {
    issues.push({ code: "EMPTY_SUMMARY", message: "summary vacío en régimen/gamma" });
  }

  // Impossible: hypothesisOnly must be true on gamma (educational)
  if (s.gamma.hypothesisOnly !== true) {
    issues.push({ code: "GAMMA_NOT_HYPOTHESIS", message: "gamma debe ser hypothesisOnly" });
  }

  const hard = issues.filter((i) =>
    ["SCHEMA", "INVALID_TIMESTAMP", "EMPTY_SYMBOL", "IMPOSSIBLE_SCORE", "NAN_PRICE", "DUPLICATE_PROVIDER"].includes(
      i.code,
    ),
  );

  return { ok: hard.length === 0 && !issues.some((i) => i.code === "SCHEMA"), snapshot: s, issues };
}
