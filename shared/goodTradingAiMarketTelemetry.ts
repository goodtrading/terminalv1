/**
 * Compact Market Telemetry Bridge contracts (AI-6.2 / AI-6.3).
 * schemaVersion 1.0 — no raw books/trades/heatmap/footprint candles.
 * mentorEligible is always false in AI-6.3.
 */
import { z } from "zod";
import {
  observationOriginSchema,
  signalDirectionSchema,
  signalQualitySchema,
  signalStrengthSchema,
} from "./goodTradingAiMarket";

export const TELEMETRY_SCHEMA_VERSION = "1.0" as const;
export const TELEMETRY_MAX_BYTES = 16_384;
export const TELEMETRY_TYPICAL_BYTES = 8_192;
export const TELEMETRY_DEFAULT_INTERVAL_MS = 2_000;
export const TELEMETRY_MIN_INTERVAL_MS = 1_000;
export const TELEMETRY_TTL_MS = 12_000;

export const telemetryModeSchema = z.enum(["real", "synthetic_debug", "unavailable"]);
export type TelemetryMode = z.infer<typeof telemetryModeSchema>;

export const telemetryNamespaceSchema = z.enum(["real", "synthetic_debug"]);
export type TelemetryNamespace = z.infer<typeof telemetryNamespaceSchema>;

export const telemetryAvailabilitySchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type TelemetryAvailability = z.infer<typeof telemetryAvailabilitySchema>;

const compactScalar = z.number().finite();

/** Order-flow compact — CVD/delta summaries only (no trade arrays). */
export const telemetryOrderFlowCompactSchema = z
  .object({
    availability: telemetryAvailabilitySchema,
    origin: observationOriginSchema,
    direction: signalDirectionSchema,
    strength: signalStrengthSchema,
    quality: signalQualitySchema,
    confidence: z.number().min(0).max(1),
    /** Normalized imbalance -100..100 */
    imbalancePct: compactScalar.optional(),
    /** Qualitative CVD bias only — never raw cumulative series */
    cvdBias: z.enum(["rising", "falling", "flat", "unknown"]).optional(),
    deltaBias: z.enum(["buy", "sell", "balanced", "unknown"]).optional(),
    tradeCount: z.number().int().nonnegative().max(50_000).optional(),
    windowMs: z.number().int().positive().max(3_600_000).optional(),
    summary: z.string().min(1).max(200),
  })
  .strict();
export type TelemetryOrderFlowCompact = z.infer<typeof telemetryOrderFlowCompactSchema>;

/** Footprint compact — POC/stacked flags only; absorption/exhaustion stay UNAVAILABLE if unset. */
export const telemetryFootprintCompactSchema = z
  .object({
    availability: telemetryAvailabilitySchema,
    origin: observationOriginSchema,
    direction: signalDirectionSchema,
    strength: signalStrengthSchema,
    quality: signalQualitySchema,
    confidence: z.number().min(0).max(1),
    imbalance: z.enum(["none", "buy_imbalance", "sell_imbalance", "mixed", "unknown"]),
    exhaustionHint: z.enum(["none", "possible", "likely", "unknown"]),
    stackedBuy: z.boolean().optional(),
    stackedSell: z.boolean().optional(),
    hasPoc: z.boolean().optional(),
    summary: z.string().min(1).max(200),
  })
  .strict();
export type TelemetryFootprintCompact = z.infer<typeof telemetryFootprintCompactSchema>;

/** Lifecycle compact — counts → hypothesis only (DERIVED). */
export const telemetryLifecycleCompactSchema = z
  .object({
    availability: telemetryAvailabilitySchema,
    origin: observationOriginSchema,
    pullingCandidateCount: z.number().int().nonnegative().max(10_000).optional(),
    spoofingCandidateCount: z.number().int().nonnegative().max(10_000).optional(),
    refilledLevelCount: z.number().int().nonnegative().max(10_000).optional(),
    spoofingHypothesis: z.enum(["unlikely", "possible", "likely", "unknown"]),
    wallIntegrityHint: z.enum(["persistent", "pulling", "mixed", "unknown"]).optional(),
    summary: z.string().min(1).max(200),
  })
  .strict();
export type TelemetryLifecycleCompact = z.infer<typeof telemetryLifecycleCompactSchema>;

export const compactMarketTelemetrySchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    symbol: z.string().trim().min(1).max(32),
    sessionId: z.string().trim().min(8).max(80),
    sequence: z.number().int().nonnegative().max(1_000_000_000),
    clientCapturedAt: z.string().datetime(),
    clientCapturedAtMs: z.number().int().positive(),
    buildMs: z.number().nonnegative().max(100),
    /** AI-6.3 — real vs synthetic isolation */
    telemetryMode: telemetryModeSchema,
    telemetrySource: z.string().trim().min(1).max(120),
    namespace: telemetryNamespaceSchema,
    /** Always false in AI-6.3 — Mentor must stay disconnected */
    mentorEligible: z.literal(false),
    orderFlow: telemetryOrderFlowCompactSchema,
    footprint: telemetryFootprintCompactSchema,
    lifecycle: telemetryLifecycleCompactSchema,
    materialChange: z.boolean(),
    heartbeat: z.boolean().optional(),
  })
  .strict();
export type CompactMarketTelemetry = z.infer<typeof compactMarketTelemetrySchema>;

export const telemetryIngestRequestSchema = z
  .object({
    telemetry: compactMarketTelemetrySchema,
  })
  .strict();
export type TelemetryIngestRequest = z.infer<typeof telemetryIngestRequestSchema>;

/** Selector inputs for pure builder (no React, no renderer). */
export type CompactTelemetrySelectorInput = {
  symbol: string;
  sessionId: string;
  sequence: number;
  nowMs?: number;
  /** AI-6.3 — omit → synthetic_debug if summaries present, else unavailable */
  telemetryMode?: TelemetryMode;
  telemetrySource?: string;
  orderFlowSummary?: {
    tradeCount: number;
    buyVolume: number;
    sellVolume: number;
    delta: number;
    cvd: number;
    imbalancePct: number;
    windowMs?: number;
  } | null;
  footprintSummary?: {
    totalBars: number;
    totalDelta: number;
    stackedBuy?: boolean;
    stackedSell?: boolean;
    hasPoc?: boolean;
  } | null;
  lifecycleAudit?: {
    pullingCandidateCount?: number;
    spoofingCandidateCount?: number;
    refilledLevelCount?: number;
  } | null;
  forceHeartbeat?: boolean;
  previousFingerprint?: string | null;
};

/** AI-6.3 — Mentor must never consume telemetry. */
export function canUseTelemetryForMentor(_telemetry?: CompactMarketTelemetry | null): false {
  return false;
}

export function resolveTelemetryMode(
  input: Pick<CompactTelemetrySelectorInput, "telemetryMode" | "orderFlowSummary" | "footprintSummary" | "lifecycleAudit">,
): TelemetryMode {
  if (input.telemetryMode) return input.telemetryMode;
  const hasAny =
    !!input.orderFlowSummary || !!input.footprintSummary || !!input.lifecycleAudit;
  return hasAny ? "synthetic_debug" : "unavailable";
}

export function estimateTelemetryBytes(payload: unknown): number {
  const s = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") return Buffer.byteLength(s, "utf8");
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return s.length;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function directionFromImbalance(imbalancePct: number): import("./goodTradingAiMarket").SignalDirection {
  if (!Number.isFinite(imbalancePct)) return "unknown";
  if (imbalancePct > 12) return "bullish";
  if (imbalancePct < -12) return "bearish";
  if (Math.abs(imbalancePct) < 4) return "neutral";
  return "mixed";
}

function strengthFromAbs(imbalancePct: number): import("./goodTradingAiMarket").SignalStrength {
  const a = Math.abs(imbalancePct);
  if (a >= 35) return "strong";
  if (a >= 15) return "moderate";
  if (a >= 5) return "weak";
  return "none";
}

function spoofingHypothesisFromCount(
  n: number | undefined,
): "unlikely" | "possible" | "likely" | "unknown" {
  if (n == null || !Number.isFinite(n)) return "unknown";
  if (n <= 0) return "unlikely";
  if (n <= 2) return "possible";
  return "likely";
}

export function computeMaterialFingerprint(parts: {
  orderFlow: TelemetryOrderFlowCompact;
  footprint: TelemetryFootprintCompact;
  lifecycle: TelemetryLifecycleCompact;
}): string {
  const o = parts.orderFlow;
  const f = parts.footprint;
  const l = parts.lifecycle;
  return [
    o.availability,
    o.direction,
    o.strength,
    o.cvdBias ?? "",
    o.deltaBias ?? "",
    Math.round((o.imbalancePct ?? 0) * 10) / 10,
    f.availability,
    f.imbalance,
    f.stackedBuy ? 1 : 0,
    f.stackedSell ? 1 : 0,
    l.availability,
    l.spoofingHypothesis,
    l.pullingCandidateCount ?? 0,
    l.spoofingCandidateCount ?? 0,
  ].join("|");
}

export function hasMaterialChange(
  previousFingerprint: string | null | undefined,
  nextFingerprint: string,
): boolean {
  if (!previousFingerprint) return true;
  return previousFingerprint !== nextFingerprint;
}

export function fingerprintFromTelemetry(t: CompactMarketTelemetry): string {
  return computeMaterialFingerprint({
    orderFlow: t.orderFlow,
    footprint: t.footprint,
    lifecycle: t.lifecycle,
  });
}

/**
 * Pure compact telemetry builder — immutable, no renderer.
 * Target p95 &lt; 3ms; payload &lt; 16KB.
 * Real mode: never invent demo numbers; UNAVAILABLE if selectors missing/unstable.
 */
export function buildCompactMarketTelemetry(
  input: CompactTelemetrySelectorInput,
): { telemetry: CompactMarketTelemetry; bytes: number; unavailableReason?: string } {
  const started =
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const nowMs = input.nowMs ?? Date.now();
  const symbol = (input.symbol || "BTCUSDT").trim().toUpperCase().slice(0, 32) || "BTCUSDT";
  const telemetryMode = resolveTelemetryMode(input);
  const namespace: TelemetryNamespace =
    telemetryMode === "real" ? "real" : "synthetic_debug";
  const telemetrySource =
    (input.telemetrySource?.trim().slice(0, 120) ||
      (telemetryMode === "real"
        ? "realMarketTelemetrySource"
        : telemetryMode === "synthetic_debug"
          ? "synthetic_debug"
          : "unavailable")).slice(0, 120);

  // Real mode: reject empty/invalid summaries (no demo fill)
  let ofSummary = input.orderFlowSummary ?? null;
  let fpSummary = input.footprintSummary ?? null;
  let lifeAudit = input.lifecycleAudit ?? null;
  if (telemetryMode === "real") {
    if (
      ofSummary &&
      (!Number.isFinite(ofSummary.tradeCount) ||
        ofSummary.tradeCount < 1 ||
        !Number.isFinite(ofSummary.delta) ||
        !Number.isFinite(ofSummary.cvd) ||
        !Number.isFinite(ofSummary.imbalancePct))
    ) {
      ofSummary = null;
    }
    if (fpSummary && (!Number.isFinite(fpSummary.totalBars) || fpSummary.totalBars < 1)) {
      fpSummary = null;
    }
  }
  if (telemetryMode === "unavailable") {
    ofSummary = null;
    fpSummary = null;
    lifeAudit = null;
  }

  let orderFlow: CompactMarketTelemetry["orderFlow"];
  if (!ofSummary) {
    orderFlow = {
      availability: "UNAVAILABLE",
      origin: "INFERRED",
      direction: "unknown",
      strength: "none",
      quality: "low",
      confidence: 0.15,
      summary:
        telemetryMode === "real"
          ? "UNAVAILABLE: real CVD/delta selector missing or unstable"
          : "UNAVAILABLE: no stable CVD/delta selector",
    };
  } else {
    const s = ofSummary;
    const imbalancePct = Number.isFinite(s.imbalancePct) ? s.imbalancePct : 0;
    const direction = directionFromImbalance(imbalancePct);
    const cvdBias =
      s.cvd > 0 && s.delta >= 0 ? "rising" : s.cvd < 0 && s.delta <= 0 ? "falling" : "flat";
    const deltaBias = s.delta > 0 ? "buy" : s.delta < 0 ? "sell" : "balanced";
    orderFlow = {
      availability: "AVAILABLE",
      origin: "DERIVED",
      direction,
      strength: strengthFromAbs(imbalancePct),
      quality: s.tradeCount >= 20 ? "medium" : "low",
      confidence: clamp01(0.35 + Math.min(0.45, Math.abs(imbalancePct) / 100)),
      imbalancePct,
      cvdBias,
      deltaBias,
      tradeCount: Math.min(50_000, Math.max(0, Math.floor(s.tradeCount))),
      windowMs: s.windowMs,
      summary: `CVD/delta DERIVED (${telemetryMode}): imb=${imbalancePct.toFixed(1)}% deltaBias=${deltaBias}`.slice(
        0,
        200,
      ),
    };
  }

  let footprint: CompactMarketTelemetry["footprint"];
  if (!fpSummary || fpSummary.totalBars <= 0) {
    footprint = {
      availability: "UNAVAILABLE",
      origin: "INFERRED",
      direction: "unknown",
      strength: "none",
      quality: "low",
      confidence: 0.1,
      imbalance: "unknown",
      exhaustionHint: "unknown",
      summary: "UNAVAILABLE: footprint selector absent (absorption/exhaustion not implemented)",
    };
  } else {
    const f = fpSummary;
    const stackedBuy = !!f.stackedBuy;
    const stackedSell = !!f.stackedSell;
    let imbalance: CompactMarketTelemetry["footprint"]["imbalance"] = "none";
    let direction: CompactMarketTelemetry["footprint"]["direction"] = "neutral";
    if (stackedBuy && !stackedSell) {
      imbalance = "buy_imbalance";
      direction = "bullish";
    } else if (stackedSell && !stackedBuy) {
      imbalance = "sell_imbalance";
      direction = "bearish";
    } else if (stackedBuy && stackedSell) {
      imbalance = "mixed";
      direction = "mixed";
    } else if (f.totalDelta > 0) {
      imbalance = "buy_imbalance";
      direction = "bullish";
    } else if (f.totalDelta < 0) {
      imbalance = "sell_imbalance";
      direction = "bearish";
    }
    footprint = {
      availability: "PARTIAL",
      origin: "DERIVED",
      direction,
      strength: stackedBuy || stackedSell ? "moderate" : "weak",
      quality: "low",
      confidence: 0.35,
      imbalance,
      exhaustionHint: "unknown",
      stackedBuy,
      stackedSell,
      hasPoc: !!f.hasPoc,
      summary: `Footprint PARTIAL DERIVED (${telemetryMode}): imbalance=${imbalance}; exhaustion UNAVAILABLE`.slice(
        0,
        200,
      ),
    };
  }

  let lifecycle: CompactMarketTelemetry["lifecycle"];
  if (!lifeAudit) {
    lifecycle = {
      availability: "UNAVAILABLE",
      origin: "INFERRED",
      spoofingHypothesis: "unknown",
      summary: "UNAVAILABLE: lifecycle audit not running (Bookmap panel)",
    };
  } else {
    const a = lifeAudit;
    const spoofN = a.spoofingCandidateCount ?? 0;
    const pullN = a.pullingCandidateCount ?? 0;
    lifecycle = {
      availability: "PARTIAL",
      origin: "DERIVED",
      pullingCandidateCount: pullN,
      spoofingCandidateCount: spoofN,
      refilledLevelCount: a.refilledLevelCount ?? 0,
      spoofingHypothesis: spoofingHypothesisFromCount(spoofN),
      wallIntegrityHint: pullN > 0 ? "pulling" : spoofN > 0 ? "mixed" : "unknown",
      summary: `Lifecycle DERIVED (${telemetryMode}): pull=${pullN} spoofCand=${spoofN} (hypothesis only)`.slice(
        0,
        200,
      ),
    };
  }

  const fingerprint = computeMaterialFingerprint({ orderFlow, footprint, lifecycle });
  const changed = hasMaterialChange(input.previousFingerprint, fingerprint);
  const heartbeat = !!input.forceHeartbeat || !changed;
  const ended =
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const buildMs = Math.min(100, Math.round((ended - started) * 1000) / 1000);

  const telemetry: CompactMarketTelemetry = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    symbol,
    sessionId: input.sessionId.slice(0, 80),
    sequence: Math.max(0, Math.floor(input.sequence)),
    clientCapturedAt: new Date(nowMs).toISOString(),
    clientCapturedAtMs: nowMs,
    buildMs,
    telemetryMode,
    telemetrySource,
    namespace,
    mentorEligible: false,
    orderFlow,
    footprint,
    lifecycle,
    materialChange: changed,
    heartbeat,
  };

  const bytes = estimateTelemetryBytes({ telemetry });
  if (bytes > TELEMETRY_MAX_BYTES) {
    return {
      telemetry,
      bytes,
      unavailableReason: `payload ${bytes}B exceeds ${TELEMETRY_MAX_BYTES}B hard limit`,
    };
  }
  return { telemetry, bytes };
}
