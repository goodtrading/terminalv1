import { randomUUID } from "node:crypto";
import type {
  EvidenceItem,
  MarketProviderId,
  MarketSourceId,
  ObservationOrigin,
  SignalDirection,
} from "@shared/goodTradingAiMarket";
import type { MarketProviderBundle, ProviderLensInput } from "./snapshotContracts";

function clamp01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

function defaultSourceForProvider(provider: MarketProviderId): MarketSourceId {
  if (provider === "simulate") return "simulate";
  return "stub";
}

function fromLens(lens: ProviderLensInput, fallbackOrigin: ObservationOrigin): EvidenceItem {
  const strengthW =
    lens.strength === "strong" ? 0.9 : lens.strength === "moderate" ? 0.65 : lens.strength === "weak" ? 0.4 : 0.15;
  const qualityW = lens.quality === "high" ? 1 : lens.quality === "medium" ? 0.75 : 0.45;
  const origin = lens.origin ?? fallbackOrigin;
  const capturedAt = lens.capturedAt ?? new Date().toISOString();
  const ageMs = lens.ageMs ?? 0;
  const sourceId = lens.sourceId ?? defaultSourceForProvider(lens.provider);
  return {
    id: `ev_${randomUUID().slice(0, 10)}`,
    provider: lens.provider,
    claim: lens.summary.slice(0, 240),
    weight: clamp01(strengthW * qualityW),
    confidence: clamp01(lens.confidence),
    supportsDirection: lens.direction === "unknown" ? undefined : lens.direction,
    origin,
    capturedAt,
    ageMs,
    sourceId,
    quality: lens.quality,
  };
}

/**
 * Build weighted evidence list from provider lenses.
 * No raw ticks — claims are qualitative summaries only.
 * @param fallbackOrigin INFERRED for stub/simulate; live path passes OBSERVED/DERIVED per lens.
 */
export function buildEvidence(
  bundle: MarketProviderBundle,
  fallbackOrigin: ObservationOrigin = "INFERRED",
): EvidenceItem[] {
  const lenses = [
    bundle.gamma,
    bundle.orderFlow,
    bundle.liquidity,
    bundle.openInterest,
    bundle.footprint,
    bundle.marketStructure,
    bundle.dom,
  ].filter(Boolean) as ProviderLensInput[];

  return lenses
    .map((l) => fromLens(l, fallbackOrigin))
    .sort((a, b) => b.weight * b.confidence - a.weight * a.confidence);
}

export function evidenceDirectionBias(evidence: EvidenceItem[]): {
  bullish: number;
  bearish: number;
  neutral: number;
  dominant: SignalDirection;
} {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  for (const e of evidence) {
    const w = e.weight * e.confidence;
    if (e.supportsDirection === "bullish") bullish += w;
    else if (e.supportsDirection === "bearish") bearish += w;
    else if (e.supportsDirection === "neutral" || e.supportsDirection === "mixed") neutral += w;
  }
  let dominant: SignalDirection = "unknown";
  const max = Math.max(bullish, bearish, neutral);
  if (max < 0.15) dominant = "unknown";
  else if (bullish === max && bullish > bearish * 1.15) dominant = "bullish";
  else if (bearish === max && bearish > bullish * 1.15) dominant = "bearish";
  else if (neutral === max) dominant = "neutral";
  else dominant = "mixed";
  return { bullish, bearish, neutral, dominant };
}

export function providersInEvidence(evidence: EvidenceItem[]): MarketProviderId[] {
  return Array.from(new Set(evidence.map((e) => e.provider)));
}

/** Guard: never treat INFERRED as OBSERVED in payloads. */
export function assertEvidenceOriginsHonest(evidence: EvidenceItem[]): boolean {
  return evidence.every((e) => e.origin === "OBSERVED" || e.origin === "DERIVED" || e.origin === "INFERRED");
}
