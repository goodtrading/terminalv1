import type {
  GammaContext,
  MarketLevel,
  MarketReferencePrice,
  MarketTruthComponentQuality,
  MarketTruthProvenance,
  MarketTruthTimestamps,
  OptionsOIContext,
  OptionsReferenceIdentity,
  FuturesOIContext,
} from "./marketTruth";

export type GammaOptionsSource = "LIVE_DERIBIT" | "BOOTSTRAP" | "LEGACY_ANALYTICS";
export type GammaOptionsSnapshotInput = {
  source: GammaOptionsSource;
  snapshotId?: string | number | null;
  referenceIdentity: OptionsReferenceIdentity;
  referencePrice?: MarketReferencePrice | null;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  totalGex?: number | null;
  gammaFlip?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  gammaMagnets?: readonly number[] | null;
  shortGammaZones?: readonly { start: number; end: number }[] | null;
  transitionZones?: readonly { start: number; end: number }[] | null;
  vanna?: number | null;
  charm?: number | null;
  dealerHedgeContext?: unknown;
  optionsOI?: {
    totalOptionsOI?: number | null;
    callOI?: number | null;
    putOI?: number | null;
    concentration?: number | null;
  } | null;
};

export type GammaOptionsAdapterConfig = {
  capturedAt: number;
  maxAgeMs?: number;
};

export type GammaOptionsAdapterResult = {
  referenceIdentity: Readonly<OptionsReferenceIdentity> | null;
  referencePrice: MarketReferencePrice | null;
  gamma: GammaContext | null;
  optionsOpenInterest: OptionsOIContext | null;
  futuresOpenInterest: FuturesOIContext | null;
  levels: MarketLevel[];
  quality: {
    gamma: MarketTruthComponentQuality;
    optionsOI: MarketTruthComponentQuality;
  };
};

function copy<T>(value: T): T {
  return structuredClone(value);
}
function timestampSet(input: GammaOptionsSnapshotInput): MarketTruthTimestamps {
  return {
    eventTime: input.eventTime ?? null,
    receiveTime: input.receiveTime ?? null,
    snapshotTime: input.snapshotTime ?? null,
    calculatedAt: input.calculatedAt ?? null,
  };
}
function provenance(input: GammaOptionsSnapshotInput, origin: "RAW" | "DERIVED" | "INFERRED", metric?: string): MarketTruthProvenance {
  return {
    origin,
    source: input.source,
    venue: input.referenceIdentity.venue,
    instrument: input.referenceIdentity.referenceAsset,
    referenceIdentity: copy(input.referenceIdentity),
    eventTime: input.eventTime ?? null,
    receiveTime: input.receiveTime ?? null,
    snapshotTime: input.snapshotTime ?? null,
    calculatedAt: input.calculatedAt ?? null,
    identifiers: {
      snapshotId: input.snapshotId ?? null,
      ...(metric ? { metric } : {}),
    },
  };
}
function freshness(input: GammaOptionsSnapshotInput, config: GammaOptionsAdapterConfig, base: MarketTruthComponentQuality): MarketTruthComponentQuality {
  if (base === "UNAVAILABLE" || base === "PARTIAL" || config.maxAgeMs == null || input.snapshotTime == null) return base;
  return config.capturedAt - input.snapshotTime > config.maxAgeMs ? "STALE" : base;
}
function value(input: GammaOptionsSnapshotInput, config: GammaOptionsAdapterConfig, metric: string, raw: number | null | undefined, quality: MarketTruthComponentQuality): { value: number | null; unit: string; quality: MarketTruthComponentQuality; timestamps: MarketTruthTimestamps; provenance: MarketTruthProvenance } | undefined {
  if (raw === undefined) return undefined;
  return {
    value: raw,
    unit: metric === "totalGex" ? "USD" : "price",
    quality: freshness(input, config, quality),
    timestamps: timestampSet(input),
    provenance: provenance(input, "DERIVED", metric),
  };
}
function sourceQuality(input: GammaOptionsSnapshotInput, groupPresent: boolean, config: GammaOptionsAdapterConfig): MarketTruthComponentQuality {
  if (!groupPresent) return "UNAVAILABLE";
  const completeMetadata = input.snapshotTime != null && input.receiveTime != null && input.calculatedAt != null;
  return freshness(input, config, completeMetadata ? "VALID" : "PARTIAL");
}
function level(input: GammaOptionsSnapshotInput, config: GammaOptionsAdapterConfig, type: MarketLevel["type"], price: number | null, identifiers: Record<string, string | number | null> = {}): MarketLevel {
  const quality = freshness(input, config, price != null && Number.isFinite(price) && price > 0 ? sourceQuality(input, true, config) : "UNAVAILABLE");
  return {
    type,
    price,
    referenceIdentity: copy(input.referenceIdentity),
    source: input.source,
    origin: "DERIVED",
    calculatedAt: input.calculatedAt ?? null,
    quality,
    provenance: { ...provenance(input, "DERIVED", type), identifiers: { ...provenance(input, "DERIVED", type).identifiers, ...identifiers } },
  };
}
function oiContext(input: GammaOptionsSnapshotInput, config: GammaOptionsAdapterConfig): OptionsOIContext | null {
  if (!input.optionsOI) return null;
  const quality = sourceQuality(input, true, config);
  const entries = Object.entries(input.optionsOI).filter(([, raw]) => raw !== undefined).map(([metric, raw]) => ({
    kind: metric === "concentration" ? "AGGREGATED" as const : "RAW" as const,
    value: raw ?? null,
    unit: metric === "concentration" ? "ratio" : "contracts",
    quality,
    timestamps: timestampSet(input),
    provenance: provenance(input, metric === "concentration" ? "DERIVED" : "RAW", metric),
  }));
  return { measurements: entries, quality, timestamps: timestampSet(input), provenance: provenance(input, "RAW", "optionsOI") };
}

export function adaptGammaOptionsSnapshot(snapshot: GammaOptionsSnapshotInput | null, config: GammaOptionsAdapterConfig): GammaOptionsAdapterResult {
  if (!Number.isFinite(config.capturedAt)) throw new Error("Gamma options adapter requires finite capturedAt");
  if (!snapshot) {
    return { referenceIdentity: null, referencePrice: null, gamma: null, optionsOpenInterest: null, futuresOpenInterest: null, levels: [], quality: { gamma: "UNAVAILABLE", optionsOI: "UNAVAILABLE" } };
  }
  if (!snapshot.referenceIdentity.referenceAsset.trim() || !snapshot.referenceIdentity.venue.trim() || !snapshot.referenceIdentity.referenceType) throw new Error("Gamma options reference identity is required");
  const gammaFields = [snapshot.totalGex, snapshot.gammaFlip, snapshot.callWall, snapshot.putWall, snapshot.gammaMagnets, snapshot.shortGammaZones, snapshot.transitionZones, snapshot.vanna, snapshot.charm];
  const gammaQuality = sourceQuality(snapshot, gammaFields.some((field) => field !== undefined), config);
  const gamma: GammaContext | null = gammaFields.some((field) => field !== undefined) ? {
    totalGex: value(snapshot, config, "totalGex", snapshot.totalGex, gammaQuality),
    gammaFlip: value(snapshot, config, "gammaFlip", snapshot.gammaFlip, gammaQuality),
    callWall: value(snapshot, config, "callWall", snapshot.callWall, gammaQuality),
    putWall: value(snapshot, config, "putWall", snapshot.putWall, gammaQuality),
    gammaMagnets: snapshot.gammaMagnets?.map((price) => value(snapshot, config, "gammaMagnet", price, gammaQuality)).filter((item): item is NonNullable<typeof item> => item != null),
    vanna: value(snapshot, config, "vanna", snapshot.vanna, gammaQuality),
    charm: value(snapshot, config, "charm", snapshot.charm, gammaQuality),
    dealerHedgeContext: snapshot.dealerHedgeContext == null ? undefined : { value: copy(snapshot.dealerHedgeContext), provenance: provenance(snapshot, "INFERRED", "dealerHedgeContext") },
    quality: gammaQuality,
    timestamps: timestampSet(snapshot),
    provenance: provenance(snapshot, "DERIVED", "gamma"),
  } : null;
  const levels: MarketLevel[] = [];
  if (snapshot.gammaFlip !== undefined && snapshot.gammaFlip !== null) levels.push(level(snapshot, config, "GAMMA_FLIP", snapshot.gammaFlip));
  if (snapshot.callWall !== undefined && snapshot.callWall !== null) levels.push(level(snapshot, config, "CALL_WALL", snapshot.callWall));
  if (snapshot.putWall !== undefined && snapshot.putWall !== null) levels.push(level(snapshot, config, "PUT_WALL", snapshot.putWall));
  for (const price of snapshot.gammaMagnets ?? []) levels.push(level(snapshot, config, "GAMMA_MAGNET", price));
  for (const zone of snapshot.shortGammaZones ?? []) levels.push(level(snapshot, config, "SHORT_GAMMA_ZONE", zone.start, { end: zone.end }));
  for (const zone of snapshot.transitionZones ?? []) levels.push(level(snapshot, config, "TRANSITION_ZONE", zone.start, { end: zone.end }));
  return {
    referenceIdentity: copy(snapshot.referenceIdentity),
    referencePrice: snapshot.referencePrice == null ? null : copy(snapshot.referencePrice),
    gamma,
    optionsOpenInterest: oiContext(snapshot, config),
    futuresOpenInterest: null,
    levels,
    quality: { gamma: gamma?.quality ?? "UNAVAILABLE", optionsOI: oiContext(snapshot, config)?.quality ?? "UNAVAILABLE" },
  };
}
