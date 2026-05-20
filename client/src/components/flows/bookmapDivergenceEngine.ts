import type { BookmapState } from "@/types/bookmapState";
import type { TradeAggressionSnapshot } from "@/hooks/useBookmapMarketTradeSummary";
import { WALL_IMPORTANT_BTC } from "@/lib/bookmapEngineConfig";
import { bucketPrice } from "./domLadderUtils";

export type SpotPerpDivergenceType =
  | "SPOT_CONFIRMS_PERP"
  | "PERP_LEADS_SPOT"
  | "SPOT_ABSORPTION_PERP_AGGRESSION"
  | "PERP_PRESSURE_NO_SPOT_CONFIRMATION"
  | "SPOT_WALL_ONLY"
  | "PERP_WALL_ONLY"
  | "BID_CONFLUENCE"
  | "ASK_CONFLUENCE";

export type SpotPerpDivergenceSide =
  | "bid"
  | "ask"
  | "bullish"
  | "bearish"
  | "neutral";

export type SpotPerpDivergenceSeverity = "low" | "medium" | "high";

export interface SpotPerpDivergenceSignal {
  id: string;
  type: SpotPerpDivergenceType;
  side: SpotPerpDivergenceSide;
  price: number;
  confidence: number;
  severity: SpotPerpDivergenceSeverity;
  explanation: string;
  timestamp: number;
}

export type DivergenceEngineDebug = {
  candidates: number;
  activeSignals: number;
  rejectedLowConfidence: number;
  strongestSignal: SpotPerpDivergenceSignal | null;
};

export type DetectSpotPerpDivergenceParams = {
  spotState: BookmapState | null;
  perpState: BookmapState | null;
  spotAggression: TradeAggressionSnapshot | null;
  perpAggression: TradeAggressionSnapshot | null;
  minPrice: number;
  maxPrice: number;
  spotPrice: number | null;
  perpPrice: number | null;
  domBucketSize: number;
  nowMs?: number;
};

type WallCandidate = {
  market: "spot" | "perp";
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  persistenceMs: number;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function severityFromConfidence(c: number): SpotPerpDivergenceSeverity {
  if (c >= 0.75) return "high";
  if (c >= 0.6) return "medium";
  if (c >= 0.45) return "low";
  return "low";
}

function proximityScore(price: number, ref: number | null, range: number): number {
  if (ref == null || !Number.isFinite(ref) || range <= 0) return 0.5;
  const d = Math.abs(price - ref) / range;
  return clamp01(1 - d * 2.5);
}

function collectWalls(
  state: BookmapState | null,
  market: "spot" | "perp",
  minPrice: number,
  maxPrice: number,
  nowMs: number,
): WallCandidate[] {
  if (!state) return [];
  const out: WallCandidate[] = [];
  const sources = [
    ...state.majorWalls,
    ...state.structuralWalls,
    ...state.importantWalls,
  ];
  const seen = new Set<string>();
  for (const w of sources) {
    if (w.stale || w.price < minPrice || w.price > maxPrice) continue;
    const size = Math.max(w.size, w.maxSeenSize);
    if (size < WALL_IMPORTANT_BTC * 0.5) continue;
    const key = `${w.side}:${w.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      market,
      side: w.side,
      price: w.price,
      sizeBtc: size,
      persistenceMs: Math.max(0, nowMs - w.firstSeenTs),
    });
  }
  return out.sort((a, b) => b.sizeBtc - a.sizeBtc);
}

function findComparableWall(
  walls: WallCandidate[],
  side: "bid" | "ask",
  price: number,
  step: number,
  maxBucketDist = 2,
): WallCandidate | null {
  const bucket = bucketPrice(price, step);
  let best: WallCandidate | null = null;
  for (const w of walls) {
    if (w.side !== side) continue;
    const dist = Math.abs(bucketPrice(w.price, step) - bucket);
    if (dist > maxBucketDist) continue;
    if (!best || w.sizeBtc > best.sizeBtc) best = w;
  }
  return best;
}

function pushSignal(
  out: SpotPerpDivergenceSignal[],
  partial: Omit<
    SpotPerpDivergenceSignal,
    "id" | "severity" | "confidence" | "timestamp"
  > & {
    confidence: number;
  },
  nowMs: number,
) {
  const confidence = clamp01(partial.confidence);
  out.push({
    ...partial,
    id: `${partial.type}:${partial.side}:${Math.round(partial.price)}:${nowMs}`,
    confidence,
    severity: severityFromConfidence(confidence),
    timestamp: nowMs,
  });
}

function detectPassiveSignals(
  spotWalls: WallCandidate[],
  perpWalls: WallCandidate[],
  params: DetectSpotPerpDivergenceParams,
  refPrice: number | null,
  range: number,
  nowMs: number,
): SpotPerpDivergenceSignal[] {
  const step = Math.max(1, params.domBucketSize);
  const out: SpotPerpDivergenceSignal[] = [];

  for (const sw of spotWalls.slice(0, 12)) {
    const pw = findComparableWall(perpWalls, sw.side, sw.price, step);
    const liquidityScore = clamp01(sw.sizeBtc / (WALL_IMPORTANT_BTC * 3));
    const prox = proximityScore(sw.price, refPrice, range);
    const persist = clamp01(sw.persistenceMs / 120_000);

    if (!pw || pw.sizeBtc < sw.sizeBtc * 0.35) {
      const ratio = pw ? pw.sizeBtc / sw.sizeBtc : 0;
      const confidence =
        liquidityScore * 0.35 +
        (1 - ratio) * 0.3 +
        prox * 0.2 +
        persist * 0.15;
      pushSignal(
        out,
        {
          type: "SPOT_WALL_ONLY",
          side: sw.side,
          price: sw.price,
          confidence,
          explanation: `Spot ${sw.side} wall ~${Math.round(sw.sizeBtc)} BTC with weak perp confirmation nearby.`,
        },
        nowMs,
      );
    }

    if (pw && pw.sizeBtc >= WALL_IMPORTANT_BTC * 0.5 && sw.sizeBtc >= WALL_IMPORTANT_BTC * 0.5) {
      const matchRatio = Math.min(sw.sizeBtc, pw.sizeBtc) / Math.max(sw.sizeBtc, pw.sizeBtc);
      const confidence =
        liquidityScore * 0.35 +
        matchRatio * 0.3 +
        prox * 0.2 +
        persist * 0.15;
      pushSignal(
        out,
        {
          type: sw.side === "bid" ? "BID_CONFLUENCE" : "ASK_CONFLUENCE",
          side: sw.side,
          price: (sw.price + pw.price) / 2,
          confidence,
          explanation: `Spot + perp ${sw.side} liquidity confluence near ${Math.round(sw.price)}.`,
        },
        nowMs,
      );
    }
  }

  for (const pw of perpWalls.slice(0, 12)) {
    const sw = findComparableWall(spotWalls, pw.side, pw.price, step);
    if (sw && sw.sizeBtc >= pw.sizeBtc * 0.35) continue;
    const liquidityScore = clamp01(pw.sizeBtc / (WALL_IMPORTANT_BTC * 3));
    const prox = proximityScore(pw.price, refPrice, range);
    const persist = clamp01(pw.persistenceMs / 120_000);
    const confidence =
      liquidityScore * 0.35 +
      0.28 +
      prox * 0.2 +
      persist * 0.15;
    pushSignal(
      out,
      {
        type: "PERP_WALL_ONLY",
        side: pw.side,
        price: pw.price,
        confidence,
        explanation: `Perp ${pw.side} wall without comparable spot liquidity — derivative-led risk.`,
      },
      nowMs,
    );
  }

  return out;
}

function detectAggressionSignals(
  spot: TradeAggressionSnapshot,
  perp: TradeAggressionSnapshot,
  params: DetectSpotPerpDivergenceParams,
  refPrice: number | null,
  range: number,
  nowMs: number,
): SpotPerpDivergenceSignal[] {
  const out: SpotPerpDivergenceSignal[] = [];
  if (spot.volume < 0.5 && perp.volume < 0.5) return out;

  const spotImb = spot.imbalancePct;
  const perpImb = perp.imbalancePct;
  const spotAbs = Math.abs(spotImb);
  const perpAbs = Math.abs(perpImb);
  const aggressionScore = clamp01(perpAbs / 35);
  const spotAggScore = clamp01(spotAbs / 25);
  const price = refPrice ?? params.spotPrice ?? params.perpPrice ?? 0;
  const prox = proximityScore(price, refPrice, range);

  const sameSign =
    (spotImb > 5 && perpImb > 5) || (spotImb < -5 && perpImb < -5);

  if (sameSign && spotAbs >= 10 && perpAbs >= 12) {
    const confidence =
      spotAggScore * 0.3 +
      aggressionScore * 0.3 +
      prox * 0.2 +
      0.2;
    pushSignal(
      out,
      {
        type: "SPOT_CONFIRMS_PERP",
        side: perpImb > 0 ? "bullish" : "bearish",
        price,
        confidence,
        explanation: "Spot and perp aggression align — cleaner continuation context.",
      },
      nowMs,
    );
  }

  if (perpAbs >= 18 && spotAbs < 8) {
    const confidence =
      aggressionScore * 0.3 +
      (1 - spotAggScore) * 0.35 +
      prox * 0.2 +
      0.15;
    pushSignal(
      out,
      {
        type: "PERP_PRESSURE_NO_SPOT_CONFIRMATION",
        side: perpImb > 0 ? "bullish" : "bearish",
        price,
        confidence,
        explanation: "Perp pressure without spot confirmation — possible trap or derivative-led move.",
      },
      nowMs,
    );
  }

  if (perpImb <= -18 && spot.delta >= -spot.volume * 0.05) {
    const confidence =
      aggressionScore * 0.3 +
      clamp01(spot.buyVolume / Math.max(perp.sellVolume, 0.1)) * 0.25 +
      prox * 0.2 +
      0.15;
    pushSignal(
      out,
      {
        type: "SPOT_ABSORPTION_PERP_AGGRESSION",
        side: "bid",
        price,
        confidence,
        explanation: "Perp selling into spot bid absorption — potential reversal zone.",
      },
      nowMs,
    );
  } else if (perpImb >= 18 && spot.delta <= spot.volume * 0.05) {
    const confidence =
      aggressionScore * 0.3 +
      clamp01(spot.sellVolume / Math.max(perp.buyVolume, 0.1)) * 0.25 +
      prox * 0.2 +
      0.15;
    pushSignal(
      out,
      {
        type: "SPOT_ABSORPTION_PERP_AGGRESSION",
        side: "ask",
        price,
        confidence,
        explanation: "Perp buying into spot ask absorption — potential stall or fade area.",
      },
      nowMs,
    );
  }

  if (perpAbs >= 15 && spotAbs >= 8 && !sameSign) {
    const confidence =
      aggressionScore * 0.35 +
      spotAggScore * 0.2 +
      prox * 0.2 +
      0.15;
    pushSignal(
      out,
      {
        type: "PERP_LEADS_SPOT",
        side: perpImb > 0 ? "bullish" : "bearish",
        price,
        confidence,
        explanation: "Perp aggression leads while spot disagrees — watch for spot catch-up or fade.",
      },
      nowMs,
    );
  }

  return out;
}

export type DetectSpotPerpDivergenceResult = {
  signals: SpotPerpDivergenceSignal[];
  debug: DivergenceEngineDebug;
};

export function detectSpotPerpDivergence(
  params: DetectSpotPerpDivergenceParams,
): DetectSpotPerpDivergenceResult {
  const nowMs = params.nowMs ?? Date.now();
  const range = Math.max(1, params.maxPrice - params.minPrice);
  const refPrice =
    params.spotPrice != null && params.perpPrice != null
      ? (params.spotPrice + params.perpPrice) / 2
      : params.spotPrice ?? params.perpPrice;

  const spotWalls = collectWalls(
    params.spotState,
    "spot",
    params.minPrice,
    params.maxPrice,
    nowMs,
  );
  const perpWalls = collectWalls(
    params.perpState,
    "perp",
    params.minPrice,
    params.maxPrice,
    nowMs,
  );

  const candidates: SpotPerpDivergenceSignal[] = [
    ...detectPassiveSignals(spotWalls, perpWalls, params, refPrice, range, nowMs),
  ];

  if (params.spotAggression && params.perpAggression) {
    candidates.push(
      ...detectAggressionSignals(
        params.spotAggression,
        params.perpAggression,
        params,
        refPrice,
        range,
        nowMs,
      ),
    );
  }

  const byConfidence = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const deduped: SpotPerpDivergenceSignal[] = [];
  const seenTypes = new Set<string>();
  for (const s of byConfidence) {
    const key = `${s.type}:${s.side}`;
    if (seenTypes.has(key)) continue;
    seenTypes.add(key);
    deduped.push(s);
  }

  const active = deduped.filter((s) => s.severity !== "low").slice(0, 8);
  const rejectedLowConfidence = deduped.length - active.length;

  return {
    signals: active,
    debug: {
      candidates: candidates.length,
      activeSignals: active.length,
      rejectedLowConfidence,
      strongestSignal: active[0] ?? null,
    },
  };
}

export function filterDivergenceSignals(
  signals: SpotPerpDivergenceSignal[],
  minSeverity: "medium" | "high",
): SpotPerpDivergenceSignal[] {
  const minConf = minSeverity === "high" ? 0.75 : 0.6;
  return signals.filter((s) => s.confidence >= minConf).slice(0, 3);
}

export function formatDivergenceHeadline(signal: SpotPerpDivergenceSignal): string {
  switch (signal.type) {
    case "PERP_PRESSURE_NO_SPOT_CONFIRMATION":
      return "Perp pressure no spot confirmation";
    case "SPOT_ABSORPTION_PERP_AGGRESSION":
      return "Spot absorption vs perp aggression";
    case "SPOT_CONFIRMS_PERP":
      return "Spot confirms perp aggression";
    case "PERP_LEADS_SPOT":
      return "Perp leads spot";
    case "SPOT_WALL_ONLY":
      return "Spot wall only";
    case "PERP_WALL_ONLY":
      return "Perp wall only";
    case "BID_CONFLUENCE":
      return "Bid-side S+P confluence";
    case "ASK_CONFLUENCE":
      return "Ask-side S+P confluence";
    default:
      return signal.type;
  }
}
