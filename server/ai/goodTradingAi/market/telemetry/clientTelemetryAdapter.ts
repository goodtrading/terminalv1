/**
 * Maps compact client telemetry → ProviderLensInput for OF / footprint / lifecycle.
 * Preserves origin — never escalates INFERRED → OBSERVED.
 */
import type { CompactMarketTelemetry } from "@shared/goodTradingAiMarketTelemetry";
import type { MarketProviderBundle, ProviderLensInput } from "../snapshotContracts";
import type { ObservationOrigin } from "@shared/goodTradingAiMarket";
import { ageMs } from "../live/staleness";

function preserveOrigin(origin: ObservationOrigin): ObservationOrigin {
  return origin;
}

function ofLens(t: CompactMarketTelemetry, nowMs: number): ProviderLensInput {
  const o = t.orderFlow;
  const aggression =
    o.deltaBias === "buy" || o.deltaBias === "sell" ? "aggressive_dominant" : "balanced";
  return {
    provider: "orderFlow",
    direction: o.direction,
    strength: o.strength,
    quality: o.quality,
    confidence: o.confidence,
    summary: o.summary,
    tags: {
      absorption: "unknown",
      aggression: o.availability === "UNAVAILABLE" ? "unknown" : aggression,
      acceptance: "pending",
    },
    origin: preserveOrigin(o.origin),
    sourceId: "client_telemetry_order_flow",
    capturedAt: t.clientCapturedAt,
    ageMs: ageMs(t.clientCapturedAtMs, nowMs),
  };
}

function fpLens(t: CompactMarketTelemetry, nowMs: number): ProviderLensInput {
  const f = t.footprint;
  return {
    provider: "footprint",
    direction: f.direction,
    strength: f.strength,
    quality: f.quality,
    confidence: f.confidence,
    summary: f.summary,
    tags: {
      imbalance: f.imbalance,
      exhaustionHint: f.exhaustionHint,
    },
    origin: preserveOrigin(f.origin),
    sourceId: "client_telemetry_footprint",
    capturedAt: t.clientCapturedAt,
    ageMs: ageMs(t.clientCapturedAtMs, nowMs),
  };
}

function lifeToLiquidity(t: CompactMarketTelemetry, nowMs: number): ProviderLensInput {
  const l = t.lifecycle;
  return {
    provider: "liquidity",
    direction: "unknown",
    strength: l.spoofingHypothesis === "likely" ? "moderate" : "weak",
    quality: l.availability === "PARTIAL" ? "medium" : "low",
    confidence: l.availability === "PARTIAL" ? 0.4 : 0.15,
    summary: l.summary,
    tags: {
      wallIntegrity: l.wallIntegrityHint ?? "unknown",
      spoofingHypothesis: l.spoofingHypothesis,
      sweepContext: "none",
    },
    origin: preserveOrigin(l.origin),
    sourceId: "client_telemetry_lifecycle",
    capturedAt: t.clientCapturedAt,
    ageMs: ageMs(t.clientCapturedAtMs, nowMs),
  };
}

/**
 * Merge client telemetry into a provider bundle.
 * Preserves origin — never escalates INFERRED → OBSERVED.
 */
export function applyClientTelemetryToBundle(
  base: MarketProviderBundle,
  telemetry: CompactMarketTelemetry | undefined,
  nowMs = Date.now(),
): MarketProviderBundle {
  if (!telemetry) return base;
  const next: MarketProviderBundle = { ...base };
  next.orderFlow = ofLens(telemetry, nowMs);
  next.footprint = fpLens(telemetry, nowMs);
  const lifeLiq = lifeToLiquidity(telemetry, nowMs);
  if (!next.liquidity) {
    next.liquidity = lifeLiq;
  } else {
    next.liquidity = {
      ...next.liquidity,
      tags: {
        ...next.liquidity.tags,
        spoofingHypothesis: telemetry.lifecycle.spoofingHypothesis,
        wallIntegrity:
          telemetry.lifecycle.wallIntegrityHint ?? next.liquidity.tags?.wallIntegrity ?? "unknown",
      },
      origin: telemetry.lifecycle.origin,
      sourceId: "client_telemetry_lifecycle",
      summary: `${next.liquidity.summary} | ${lifeLiq.summary}`.slice(0, 280),
    };
  }
  return next;
}
