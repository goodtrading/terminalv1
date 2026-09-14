import type {
  MarketTruthComponentQuality,
  MarketTruthProvenance,
  MarketTruthTimestamps,
  RegimeContext,
} from "./marketTruth";

export type RegimeSnapshotSource = "GAMMA_REGIME" | "AI6_REGIME" | "GAMMA_LIVE_ADAPTER" | string;

export type RegimeSnapshotInput = {
  source: RegimeSnapshotSource;
  label: string | null | undefined;
  inputs?: Readonly<Record<string, unknown>> | null;
  sourceLabel?: string | null;
  classifier?: string | null;
  classifierVersion?: string | null;
  snapshotId?: string | number | null;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  provenance?: MarketTruthProvenance | null;
  quality?: MarketTruthComponentQuality | null;
};

export type RegimeContextAdapterConfig = {
  capturedAt: number;
  maxAgeMs?: number;
};

const OPERATIONAL_KEYS = new Set([
  "confidence",
  "probability",
  "recommendation",
  "narrative",
  "signal",
  "entry",
  "stop",
  "takeProfit",
  "target",
  "expectedMove",
]);

function copy<T>(value: T): T {
  return structuredClone(value);
}

function safeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeMetadata);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !OPERATIONAL_KEYS.has(key)).map(([key, nested]) => [key, safeMetadata(nested)]));
  }
  return value;
}

function timestamps(snapshot: RegimeSnapshotInput): MarketTruthTimestamps {
  return {
    eventTime: snapshot.eventTime ?? null,
    receiveTime: snapshot.receiveTime ?? null,
    snapshotTime: snapshot.snapshotTime ?? null,
    calculatedAt: snapshot.calculatedAt ?? null,
  };
}

function freshness(
  snapshot: RegimeSnapshotInput,
  config: RegimeContextAdapterConfig,
  base: MarketTruthComponentQuality,
): MarketTruthComponentQuality {
  if (base === "UNAVAILABLE" || base === "PARTIAL" || config.maxAgeMs == null) return base;
  const freshnessTime = snapshot.calculatedAt ?? snapshot.snapshotTime ?? snapshot.eventTime;
  if (freshnessTime == null) return base;
  return config.capturedAt - freshnessTime > config.maxAgeMs ? "STALE" : base;
}

function normalizedLabel(source: RegimeSnapshotSource, label: string): { label: string; sourceLabel: string } | null {
  const sourceLabel = label.trim();
  const normalized = sourceLabel.toLowerCase().replace(/[ -]+/g, "_");
  const safe: Record<string, string> = {
    "long_gamma": "POSITIVE_GAMMA",
    "short_gamma": "NEGATIVE_GAMMA",
    neutral: "NEUTRAL_GAMMA",
    neutral_gamma: "NEUTRAL_GAMMA",
    positive_gamma: "POSITIVE_GAMMA",
    negative_gamma: "NEGATIVE_GAMMA",
    transition: "TRANSITION",
    range: "RANGE",
    trend_attempt: "TREND_ATTEMPT",
    unclear: "UNCLEAR",
    unknown: "UNKNOWN",
  };
  if (source === "GAMMA_LIVE_ADAPTER" && ["bullish", "bearish", "neutral", "mixed"].includes(normalized)) return null;
  const result = safe[normalized];
  return result == null ? null : { label: result, sourceLabel };
}

function buildProvenance(snapshot: RegimeSnapshotInput, normalized: string, sourceLabel: string): MarketTruthProvenance {
  return {
    ...(snapshot.provenance == null ? {} : copy(safeMetadata(snapshot.provenance)) as MarketTruthProvenance),
    origin: "INFERRED",
    source: snapshot.source,
    eventTime: snapshot.eventTime ?? null,
    receiveTime: snapshot.receiveTime ?? null,
    snapshotTime: snapshot.snapshotTime ?? null,
    calculatedAt: snapshot.calculatedAt ?? null,
    identifiers: {
      ...(snapshot.provenance?.identifiers == null ? {} : copy(safeMetadata(snapshot.provenance.identifiers)) as Record<string, string | number | null>),
      snapshotId: snapshot.snapshotId ?? null,
      sourceLabel,
      normalizedLabel: normalized,
      ...(snapshot.classifier == null ? {} : { classifier: snapshot.classifier }),
      ...(snapshot.classifierVersion == null ? {} : { classifierVersion: snapshot.classifierVersion }),
    },
  };
}

export function adaptRegimeContext(
  snapshot: RegimeSnapshotInput | null,
  config: RegimeContextAdapterConfig,
): RegimeContext | null {
  if (!Number.isFinite(config.capturedAt)) throw new Error("Regime adapter requires finite capturedAt");
  if (!snapshot || typeof snapshot.label !== "string" || !snapshot.label.trim()) return null;
  const mapped = normalizedLabel(snapshot.source, snapshot.sourceLabel ?? snapshot.label);
  if (!mapped) return null;

  const snapshotTimestamps = timestamps(snapshot);
  const metadataComplete = snapshot.source.trim().length > 0 && snapshot.provenance != null && snapshot.calculatedAt != null;
  const baseQuality: MarketTruthComponentQuality = snapshot.quality ?? (metadataComplete ? "VALID" : "PARTIAL");
  const quality = freshness(snapshot, config, baseQuality);
  const inputs: Record<string, unknown> = {
    ...(snapshot.inputs == null ? {} : copy(safeMetadata(snapshot.inputs)) as Record<string, unknown>),
    sourceLabel: mapped.sourceLabel,
    normalizedLabel: mapped.label,
    ...(snapshot.classifier == null ? {} : { classifier: snapshot.classifier }),
    ...(snapshot.classifierVersion == null ? {} : { classifierVersion: snapshot.classifierVersion }),
  };
  return {
    label: mapped.label,
    inputs,
    quality,
    timestamps: snapshotTimestamps,
    provenance: buildProvenance(snapshot, mapped.label, mapped.sourceLabel),
  };
}
