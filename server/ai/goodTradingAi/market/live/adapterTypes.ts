import type {
  LiveCompleteness,
  MarketProviderId,
  MarketSourceCapability,
  MarketSourceId,
  ObservationOrigin,
  SignalDirection,
  SignalQuality,
  SignalStrength,
} from "@shared/goodTradingAiMarket";
import type { ProviderLensInput } from "../snapshotContracts";
import type { LiveMarketReadModel } from "./sourceBoundary";

export type AdapterObservation = {
  status: LiveCompleteness;
  lens?: ProviderLensInput;
  origin: ObservationOrigin;
  sourceId: MarketSourceId;
  capturedAtMs?: number;
  notes?: string;
};

export interface LiveMarketSourceAdapter {
  readonly sourceId: MarketSourceId;
  readonly lens: MarketProviderId;
  readonly capability: MarketSourceCapability;
  /** Read-only. No sockets, polling, retries, or mutations. */
  read(model: LiveMarketReadModel): AdapterObservation;
}

export function isoFromMs(ms?: number): string {
  return new Date(ms && Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

export function lensFromParts(params: {
  provider: MarketProviderId;
  direction: SignalDirection;
  strength: SignalStrength;
  quality: SignalQuality;
  confidence: number;
  summary: string;
  tags?: Record<string, string>;
  origin: ObservationOrigin;
  sourceId: MarketSourceId;
  capturedAtMs?: number;
  ageMs?: number;
}): ProviderLensInput {
  return {
    provider: params.provider,
    direction: params.direction,
    strength: params.strength,
    quality: params.quality,
    confidence: Math.min(1, Math.max(0, params.confidence)),
    summary: params.summary.slice(0, 280),
    tags: params.tags,
    origin: params.origin,
    sourceId: params.sourceId,
    capturedAt: isoFromMs(params.capturedAtMs),
    ageMs: params.ageMs ?? 0,
  };
}

export function unavailableObs(
  sourceId: MarketSourceId,
  lens: MarketProviderId,
  reason: string,
): AdapterObservation {
  return {
    status: "UNAVAILABLE",
    origin: "INFERRED",
    sourceId,
    notes: reason,
    lens: lensFromParts({
      provider: lens,
      direction: "unknown",
      strength: "none",
      quality: "low",
      confidence: 0.15,
      summary: `UNAVAILABLE: ${reason}`.slice(0, 280),
      origin: "INFERRED",
      sourceId,
      ageMs: 0,
    }),
  };
}
