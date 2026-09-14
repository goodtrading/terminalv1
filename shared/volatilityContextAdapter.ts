import type {
  MarketTruthComponentQuality,
  MarketTruthProvenance,
  MarketTruthTimestamps,
  OptionsReferenceIdentity,
  VolatilityContext,
  VolatilityMeasurement,
} from "./marketTruth";
import type { GammaOptionsSource } from "./gammaOptionsAdapter";

export type VolatilitySnapshotOption = {
  instrument: string;
  ivBid?: number | null;
  ivAsk?: number | null;
  ivMark?: number | null;
  impliedVolatility?: number | null;
  unit: string;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  provenance?: MarketTruthProvenance | null;
};

export type ExistingImpliedVolatilityAggregate = {
  identifier: string;
  value: number | null;
  unit: string;
  origin: "DERIVED";
  quality?: MarketTruthComponentQuality;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  provenance?: MarketTruthProvenance | null;
};

export type VolatilitySnapshotInput = {
  source: GammaOptionsSource;
  snapshotId?: string | number | null;
  referenceIdentity: OptionsReferenceIdentity;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  options?: readonly VolatilitySnapshotOption[] | null;
  aggregates?: readonly ExistingImpliedVolatilityAggregate[] | null;
};

export type VolatilityContextAdapterConfig = {
  capturedAt: number;
  maxAgeMs?: number;
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

function timestamps(
  snapshot: VolatilitySnapshotInput,
  measurement?: Pick<VolatilitySnapshotOption, "eventTime" | "receiveTime" | "snapshotTime" | "calculatedAt">,
): MarketTruthTimestamps {
  return {
    eventTime: measurement?.eventTime ?? snapshot.eventTime ?? null,
    receiveTime: measurement?.receiveTime ?? snapshot.receiveTime ?? null,
    snapshotTime: measurement?.snapshotTime ?? snapshot.snapshotTime ?? null,
    calculatedAt: measurement?.calculatedAt ?? snapshot.calculatedAt ?? null,
  };
}

function qualityFor(
  snapshot: VolatilitySnapshotInput,
  config: VolatilityContextAdapterConfig,
  base: MarketTruthComponentQuality,
  measurementTimestamps: MarketTruthTimestamps,
): MarketTruthComponentQuality {
  if (base === "UNAVAILABLE" || base === "PARTIAL" || config.maxAgeMs == null || measurementTimestamps.snapshotTime == null) return base;
  return config.capturedAt - measurementTimestamps.snapshotTime > config.maxAgeMs ? "STALE" : base;
}

function provenance(
  snapshot: VolatilitySnapshotInput,
  origin: "RAW" | "DERIVED",
  identifier: string,
  upstream?: MarketTruthProvenance | null,
): MarketTruthProvenance {
  return {
    origin,
    source: snapshot.source,
    venue: snapshot.referenceIdentity.venue,
    instrument: snapshot.referenceIdentity.referenceAsset,
    referenceIdentity: copy(snapshot.referenceIdentity),
    eventTime: snapshot.eventTime ?? null,
    receiveTime: snapshot.receiveTime ?? null,
    snapshotTime: snapshot.snapshotTime ?? null,
    calculatedAt: snapshot.calculatedAt ?? null,
    identifiers: { snapshotId: snapshot.snapshotId ?? null, measurement: identifier },
    ...(upstream == null ? {} : { upstream: copy(upstream) }),
  };
}

function optionMeasurements(
  snapshot: VolatilitySnapshotInput,
  config: VolatilityContextAdapterConfig,
): VolatilityMeasurement[] {
  const options = snapshot.options ?? [];
  const hasSomeValue = options.some((option) =>
    option.ivBid !== undefined || option.ivAsk !== undefined || option.ivMark !== undefined || option.impliedVolatility !== undefined,
  );
  const baseQuality: MarketTruthComponentQuality = hasSomeValue
    ? options.every((option) => option.ivBid !== undefined || option.ivAsk !== undefined || option.ivMark !== undefined || option.impliedVolatility !== undefined)
      ? "VALID"
      : "PARTIAL"
    : "UNAVAILABLE";
  const result: VolatilityMeasurement[] = [];
  for (const option of options) {
    const fields: readonly [string, number | null | undefined][] = [
      ["ivBid", option.ivBid],
      ["ivAsk", option.ivAsk],
      ["ivMark", option.ivMark],
      ["impliedVolatility", option.impliedVolatility],
    ];
    for (const [identifier, raw] of fields) {
      if (raw === undefined) continue;
      const measurementTimestamps = timestamps(snapshot, option);
      result.push({
        kind: "IMPLIED",
        value: raw,
        unit: option.unit,
        reference: option.instrument,
        origin: "RAW",
        quality: qualityFor(snapshot, config, baseQuality, measurementTimestamps),
        timestamps: measurementTimestamps,
        provenance: provenance(snapshot, "RAW", identifier, option.provenance),
      });
    }
  }
  return result;
}

function aggregateMeasurements(
  snapshot: VolatilitySnapshotInput,
  config: VolatilityContextAdapterConfig,
): VolatilityMeasurement[] {
  return (snapshot.aggregates ?? []).map((aggregate) => {
    const measurementTimestamps = timestamps(snapshot, aggregate);
    const baseQuality = aggregate.quality ?? "VALID";
    return {
      kind: "IMPLIED" as const,
      value: aggregate.value,
      unit: aggregate.unit,
      reference: snapshot.referenceIdentity.referenceAsset,
      origin: aggregate.origin,
      quality: qualityFor(snapshot, config, baseQuality, measurementTimestamps),
      timestamps: measurementTimestamps,
      provenance: provenance(snapshot, "DERIVED", aggregate.identifier, aggregate.provenance),
    };
  });
}

export function adaptVolatilityContext(
  snapshot: VolatilitySnapshotInput | null,
  config: VolatilityContextAdapterConfig,
): VolatilityContext | null {
  if (!Number.isFinite(config.capturedAt)) throw new Error("Volatility adapter requires finite capturedAt");
  if (!snapshot) return null;
  if (!snapshot.referenceIdentity.referenceAsset.trim() || !snapshot.referenceIdentity.venue.trim() || !snapshot.referenceIdentity.referenceType) {
    throw new Error("Volatility requires complete options reference identity");
  }

  const measurements = [...optionMeasurements(snapshot, config), ...aggregateMeasurements(snapshot, config)];
  if (measurements.length === 0) return null;
  const quality = measurements.some((measurement) => measurement.quality === "PARTIAL")
    ? "PARTIAL"
    : measurements.some((measurement) => measurement.quality === "STALE")
      ? "STALE"
      : measurements.every((measurement) => measurement.quality === "UNAVAILABLE")
        ? "UNAVAILABLE"
        : "VALID";
  return {
    measurements,
    quality,
    timestamps: timestamps(snapshot),
    provenance: provenance(snapshot, measurements.some((measurement) => measurement.origin === "DERIVED") ? "DERIVED" : "RAW", "volatility"),
  };
}

export function unavailableFuturesOI(): null {
  return null;
}
