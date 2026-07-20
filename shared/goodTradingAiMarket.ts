/**
 * GoodTrading AI Market Snapshot — shared contracts (AI-6).
 * Normalized lenses only. Never raw ticks/trades/delta as primary AI context.
 */
import { z } from "zod";

export const signalDirectionSchema = z.enum([
  "bullish",
  "bearish",
  "neutral",
  "mixed",
  "unknown",
]);
export type SignalDirection = z.infer<typeof signalDirectionSchema>;

export const signalStrengthSchema = z.enum(["none", "weak", "moderate", "strong"]);
export type SignalStrength = z.infer<typeof signalStrengthSchema>;

export const signalQualitySchema = z.enum(["low", "medium", "high"]);
export type SignalQuality = z.infer<typeof signalQualitySchema>;

export const normalizedLensSchema = z.object({
  direction: signalDirectionSchema,
  strength: signalStrengthSchema,
  quality: signalQualitySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(280),
});
export type NormalizedLens = z.infer<typeof normalizedLensSchema>;

export const marketProviderIdSchema = z.enum([
  "gamma",
  "orderFlow",
  "dom",
  "liquidity",
  "footprint",
  "openInterest",
  "marketStructure",
  "simulate",
]);
export type MarketProviderId = z.infer<typeof marketProviderIdSchema>;

export const marketRegimeSchema = z.object({
  label: z.enum([
    "positive_gamma",
    "negative_gamma",
    "transition",
    "unclear",
    "range",
    "trend_attempt",
  ]),
  direction: signalDirectionSchema,
  strength: signalStrengthSchema,
  quality: signalQualitySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(280),
});
export type MarketRegime = z.infer<typeof marketRegimeSchema>;

export const gammaSnapshotSchema = normalizedLensSchema.extend({
  globalFlipBias: z.enum(["above", "below", "at", "unknown"]),
  localFlipBias: z.enum(["above", "below", "at", "unknown"]),
  wallContext: z.enum(["call_heavy", "put_heavy", "balanced", "unknown"]),
  hypothesisOnly: z.literal(true),
});
export type GammaSnapshot = z.infer<typeof gammaSnapshotSchema>;

export const orderFlowSnapshotSchema = normalizedLensSchema.extend({
  absorption: z.enum(["none", "buy_side", "sell_side", "mixed", "unknown"]),
  aggression: z.enum(["passive_dominant", "aggressive_dominant", "balanced", "unknown"]),
  acceptance: z.enum(["accepted", "rejected", "pending", "unknown"]),
});
export type OrderFlowSnapshot = z.infer<typeof orderFlowSnapshotSchema>;

export const liquiditySnapshotSchema = normalizedLensSchema.extend({
  wallIntegrity: z.enum(["persistent", "pulling", "mixed", "unknown"]),
  spoofingHypothesis: z.enum(["unlikely", "possible", "likely", "unknown"]),
  sweepContext: z.enum(["none", "sweep_reclaim", "sweep_fail", "unknown"]),
});
export type LiquiditySnapshot = z.infer<typeof liquiditySnapshotSchema>;

export const openInterestSnapshotSchema = normalizedLensSchema.extend({
  oiTrend: z.enum(["rising", "falling", "flat", "unknown"]),
  withPrice: z.enum(["aligned", "divergent", "unclear", "unknown"]),
});
export type OpenInterestSnapshot = z.infer<typeof openInterestSnapshotSchema>;

export const footprintSnapshotSchema = normalizedLensSchema.extend({
  imbalance: z.enum(["none", "buy_imbalance", "sell_imbalance", "mixed", "unknown"]),
  exhaustionHint: z.enum(["none", "possible", "likely", "unknown"]),
});
export type FootprintSnapshot = z.infer<typeof footprintSnapshotSchema>;

export const marketStructureSnapshotSchema = normalizedLensSchema.extend({
  structure: z.enum([
    "higher_highs",
    "lower_lows",
    "range",
    "break_retest",
    "unclear",
  ]),
  keyLevelRelation: z.enum(["above", "below", "at", "unknown"]),
});
export type MarketStructureSnapshot = z.infer<typeof marketStructureSnapshotSchema>;

export const priceContextSchema = z.object({
  /** Normalized context — not a raw tick feed. Optional display ref for admin only. */
  displayRef: z.number().finite().optional(),
  context: z.enum(["near_level", "mid_range", "extension", "unclear"]),
  relativeToKeyLevels: z.enum(["above", "below", "at", "unknown"]),
  quality: signalQualitySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(200),
});
export type PriceContext = z.infer<typeof priceContextSchema>;

export const observationOriginSchema = z.enum(["OBSERVED", "DERIVED", "INFERRED"]);
export type ObservationOrigin = z.infer<typeof observationOriginSchema>;

export const liveAvailabilitySchema = z.enum([
  "Available",
  "Partial",
  "Unavailable",
  "Ambiguous",
]);
export type LiveAvailability = z.infer<typeof liveAvailabilitySchema>;

export const liveCompletenessSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "DEGRADED",
  "UNAVAILABLE",
]);
export type LiveCompleteness = z.infer<typeof liveCompletenessSchema>;

export const marketSourceIdSchema = z.enum([
  "storage_gamma",
  "storage_oi_options",
  "storage_order_flow",
  "storage_liquidity_compact",
  "ticker_price",
  "orderbook_health",
  "footprint_bridge_needed",
  "structure_unavailable",
  "client_telemetry_order_flow",
  "client_telemetry_footprint",
  "client_telemetry_lifecycle",
  "simulate",
  "stub",
]);
export type MarketSourceId = z.infer<typeof marketSourceIdSchema>;

export const marketSourceCapabilitySchema = z.object({
  sourceId: marketSourceIdSchema,
  lens: marketProviderIdSchema,
  availability: liveAvailabilitySchema,
  serverSide: z.boolean(),
  readOnly: z.literal(true),
  notes: z.string().max(400),
  bridgeNeeded: z.boolean().optional(),
  /** AI-6.3 capability matrix */
  implementationStatus: z.enum(["ready", "partial", "unavailable"]).optional(),
  sessionStatus: z.enum(["fresh", "stale", "absent", "unknown"]).optional(),
  repositorySafety: z
    .enum(["SAFE_SINGLE_INSTANCE", "UNSAFE_FOR_MULTI_INSTANCE", "UNKNOWN"])
    .optional(),
  mentorEligible: z.literal(false).optional(),
});
export type MarketSourceCapability = z.infer<typeof marketSourceCapabilitySchema>;

export const evidenceItemSchema = z.object({
  id: z.string().min(1).max(80),
  provider: marketProviderIdSchema,
  claim: z.string().min(1).max(240),
  weight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  supportsDirection: signalDirectionSchema.optional(),
  /** AI-6.1 provenance — never present INFERRED as OBSERVED */
  origin: observationOriginSchema,
  capturedAt: z.string().datetime(),
  ageMs: z.number().int().nonnegative(),
  sourceId: marketSourceIdSchema,
  quality: signalQualitySchema,
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const riskItemSchema = z.object({
  code: z.string().min(1).max(60),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1).max(280),
  relatedProviders: z.array(marketProviderIdSchema).max(8),
});
export type RiskItem = z.infer<typeof riskItemSchema>;

export const confluenceSnapshotSchema = z.object({
  score: z.number().min(0).max(100),
  alignedProviders: z.array(marketProviderIdSchema).max(12),
  conflictingProviders: z.array(marketProviderIdSchema).max(12),
  summary: z.string().min(1).max(320),
  direction: signalDirectionSchema,
});
export type ConfluenceSnapshot = z.infer<typeof confluenceSnapshotSchema>;

export const snapshotScoresSchema = z.object({
  marketConfidence: z.number().min(0).max(100),
  confluence: z.number().min(0).max(100),
  risk: z.number().min(0).max(100),
  snapshotQuality: z.number().min(0).max(100),
});
export type SnapshotScores = z.infer<typeof snapshotScoresSchema>;

export const snapshotStalenessSchema = z.object({
  sourceId: marketSourceIdSchema,
  ageMs: z.number().int().nonnegative(),
  stale: z.boolean(),
  thresholdMs: z.number().int().positive(),
});
export type SnapshotStaleness = z.infer<typeof snapshotStalenessSchema>;

export const symbolProvenanceSchema = z.object({
  requested: z.string().min(1).max(32),
  normalized: z.string().min(1).max(32),
  base: z.string().min(1).max(16).optional(),
  quote: z.string().min(1).max(16).optional(),
  sourceId: marketSourceIdSchema,
});
export type SymbolProvenance = z.infer<typeof symbolProvenanceSchema>;

export const marketSnapshotSchema = z.object({
  id: z.string().min(1).max(80),
  timestamp: z.string().datetime(),
  symbol: z.string().min(1).max(32),
  price: priceContextSchema,
  marketRegime: marketRegimeSchema,
  gamma: gammaSnapshotSchema,
  orderFlow: orderFlowSnapshotSchema,
  liquidity: liquiditySnapshotSchema,
  openInterest: openInterestSnapshotSchema,
  footprint: footprintSnapshotSchema,
  marketStructure: marketStructureSnapshotSchema,
  risks: z.array(riskItemSchema).max(20),
  confluence: confluenceSnapshotSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceItemSchema).max(40),
  scores: snapshotScoresSchema,
  providersUsed: z.array(marketProviderIdSchema).max(12),
  source: z.enum(["simulate", "stub", "partial", "live_internal"]),
  buildMs: z.number().nonnegative(),
  /** AI-6.1 live metadata */
  live: z.boolean().optional(),
  completeness: liveCompletenessSchema.optional(),
  staleness: z.array(snapshotStalenessSchema).max(20).optional(),
  symbolProvenance: symbolProvenanceSchema.optional(),
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

/** Compact admin payload — same shape, already normalized (no raw books). */
export const marketSnapshotCompactSchema = marketSnapshotSchema;
export type MarketSnapshotCompact = MarketSnapshot;

export const simulateMarketInputSchema = z
  .object({
    symbol: z.string().trim().min(1).max(32).optional(),
    timestamp: z.string().datetime().optional(),
    displayRef: z.number().finite().optional(),
    scenario: z
      .enum([
        "neutral",
        "bullish_confluence",
        "bearish_confluence",
        "conflicted",
        "high_risk",
        "thin_data",
      ])
      .optional(),
    gammaDirection: signalDirectionSchema.optional(),
    orderFlowDirection: signalDirectionSchema.optional(),
    liquidityDirection: signalDirectionSchema.optional(),
    oiDirection: signalDirectionSchema.optional(),
    structureDirection: signalDirectionSchema.optional(),
    footprintDirection: signalDirectionSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type SimulateMarketInput = z.infer<typeof simulateMarketInputSchema>;
