import type { BookmapState } from "@/types/bookmapState";
import type { TradeAggressionSnapshot } from "@/hooks/useBookmapMarketTradeSummary";
import { WALL_IMPORTANT_BTC } from "@/lib/bookmapEngineConfig";
import { bucketPrice } from "./domLadderUtils";
import {
  applyDivergenceCooldown,
  passesTypeFilter,
  suppressDuplicatePriceSignals,
} from "./bookmapDivergenceQuality";
import type {
  DivergenceFilterPrefs,
  DivergenceQualityDebug,
  DivergenceSignalBias,
  DivergenceSignalContext,
  SpotPerpDivergenceSeverity,
  SpotPerpDivergenceSide,
  SpotPerpDivergenceSignal,
  SpotPerpDivergenceType,
} from "./bookmapDivergenceTypes";

export type {
  DivergenceFilterPrefs,
  DivergenceQualityDebug,
  DivergenceSignalBias,
  DivergenceSignalContext,
  SpotPerpDivergenceSeverity,
  SpotPerpDivergenceSide,
  SpotPerpDivergenceSignal,
  SpotPerpDivergenceType,
} from "./bookmapDivergenceTypes";

export {
  formatDivergenceBiasLabel,
  formatDivergenceContextLabel,
  resetDivergenceCooldown,
} from "./bookmapDivergenceQuality";

/** @deprecated Use DivergenceQualityDebug */
export type DivergenceEngineDebug = DivergenceQualityDebug;

const MIN_WALL_PERSISTENCE_MS = 45_000;
const MAX_PASSIVE_DISTANCE_FRAC = 0.35;
const MIN_RELATIVE_WALL_STRENGTH = 0.55;

type WallCandidate = {
  market: "spot" | "perp";
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  persistenceMs: number;
};

type SignalDraft = {
  type: SpotPerpDivergenceType;
  side: SpotPerpDivergenceSide;
  price: number;
  confidence: number;
  wall?: WallCandidate;
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

function invalidationPriceFor(
  price: number,
  side: SpotPerpDivergenceSide,
  step: number,
  bullishInvalidBelow: boolean,
): number {
  const bucket = bucketPrice(price, step);
  const offset = Math.max(step, price * 0.00015);
  if (side === "bid" || (side === "bullish" && bullishInvalidBelow)) {
    return bucket - offset;
  }
  if (side === "ask" || side === "bearish") {
    return bucket + offset;
  }
  return bucket;
}

function buildSignalMeta(draft: SignalDraft, step: number): {
  context: DivergenceSignalContext;
  bias: DivergenceSignalBias;
  explanation: string;
  invalidation: string;
  invalidationPrice?: number;
} {
  const price = draft.price;
  const invBid = invalidationPriceFor(price, "bid", step, true);
  const invAsk = invalidationPriceFor(price, "ask", step, false);

  switch (draft.type) {
    case "PERP_PRESSURE_NO_SPOT_CONFIRMATION": {
      const perpBuy = draft.side === "bullish";
      return {
        context: "trap",
        bias: "wait",
        explanation:
          "Perp aggression is leading, but spot is not confirming. This often warns of derivative-led pressure or trap risk.",
        invalidation: perpBuy
          ? "Invalidated if spot starts confirming buy aggression above the level"
          : "Invalidated if spot starts confirming sell aggression below the level",
        invalidationPrice: perpBuy ? invAsk : invBid,
      };
    }
    case "SPOT_ABSORPTION_PERP_AGGRESSION":
      return {
        context: "absorption",
        bias: draft.side === "bid" ? "bullish" : "bearish",
        explanation:
          "Perp aggression is hitting the level, but spot liquidity is absorbing. Watch for exhaustion or failed continuation.",
        invalidation:
          draft.side === "bid"
            ? "Invalidated if spot bid liquidity pulls or price accepts below the wall"
            : "Invalidated if spot ask liquidity pulls or price accepts above the wall",
        invalidationPrice: draft.side === "bid" ? invBid : invAsk,
      };
    case "SPOT_CONFIRMS_PERP":
      return {
        context: "continuation",
        bias: draft.side === "bullish" ? "bullish" : "bearish",
        explanation:
          "Spot and perp aggression are aligned. Flow confirmation improves continuation quality.",
        invalidation:
          draft.side === "bullish"
            ? "Invalidated if perp or spot aggression flips bearish through the level"
            : "Invalidated if perp or spot aggression flips bullish through the level",
        invalidationPrice: draft.side === "bullish" ? invBid : invAsk,
      };
    case "PERP_LEADS_SPOT":
      return {
        context: "neutral",
        bias: "wait",
        explanation:
          "Perp flow is leading while spot disagrees. Treat as unresolved until spot confirms or fades the move.",
        invalidation:
          draft.side === "bullish"
            ? "Invalidated if spot confirms buying or perp aggression fades below the level"
            : "Invalidated if spot confirms selling or perp aggression fades above the level",
        invalidationPrice: draft.side === "bullish" ? invAsk : invBid,
      };
    case "SPOT_WALL_ONLY":
      return {
        context: "liquidity_warning",
        bias: draft.side === "bid" ? "bullish" : "bearish",
        explanation:
          "Important passive liquidity is present on spot without perp confirmation. This level may represent more organic liquidity.",
        invalidation:
          draft.side === "bid"
            ? "Invalidated if spot bid liquidity pulls or price accepts below the wall"
            : "Invalidated if spot ask liquidity pulls or price accepts above the wall",
        invalidationPrice: draft.side === "bid" ? invBid : invAsk,
      };
    case "PERP_WALL_ONLY":
      return {
        context: "liquidity_warning",
        bias: "wait",
        explanation:
          "Important passive liquidity is present on perp without spot confirmation. Treat as lower-quality or derivative-driven liquidity until spot confirms.",
        invalidation:
          draft.side === "bid"
            ? "Invalidated if perp bid liquidity pulls or price trades below the wall"
            : "Invalidated if perp ask liquidity pulls or price trades above the wall",
        invalidationPrice: draft.side === "bid" ? invBid : invAsk,
      };
    case "BID_CONFLUENCE":
      return {
        context: "confluence",
        bias: "bullish",
        explanation:
          "Spot and perp both show meaningful bid liquidity near this level. This creates a stronger passive support zone.",
        invalidation:
          "Invalidated if both spot and perp bid liquidity pulls or price accepts below the zone",
        invalidationPrice: invBid,
      };
    case "ASK_CONFLUENCE":
      return {
        context: "confluence",
        bias: "bearish",
        explanation:
          "Spot and perp both show meaningful ask liquidity near this level. This creates a stronger passive resistance zone.",
        invalidation:
          "Invalidated if both spot and perp ask liquidity pulls or price accepts above the zone",
        invalidationPrice: invAsk,
      };
    default:
      return {
        context: "neutral",
        bias: "wait",
        explanation: "Spot/perp context divergence detected.",
        invalidation: "Invalidated if market structure shifts through the level",
      };
  }
}

function finalizeSignal(
  draft: SignalDraft,
  step: number,
  nowMs: number,
): SpotPerpDivergenceSignal {
  const confidence = clamp01(draft.confidence);
  const meta = buildSignalMeta(draft, step);
  const priceBucket = Math.round(draft.price / Math.max(1, step));
  return {
    id: `${draft.type}:${draft.side}:${priceBucket}`,
    type: draft.type,
    side: draft.side,
    price: draft.price,
    confidence,
    severity: severityFromConfidence(confidence),
    explanation: meta.explanation,
    timestamp: nowMs,
    context: meta.context,
    invalidation: meta.invalidation,
    invalidationPrice: meta.invalidationPrice,
    bias: meta.bias,
  };
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

function wallStrengthPercentile(walls: WallCandidate[]): number {
  if (walls.length === 0) return WALL_IMPORTANT_BTC;
  const sizes = walls.map((w) => w.sizeBtc).sort((a, b) => a - b);
  const idx = Math.floor(sizes.length * 0.55);
  return sizes[Math.min(idx, sizes.length - 1)] ?? WALL_IMPORTANT_BTC;
}

function passesPassiveQuality(
  wall: WallCandidate,
  refPrice: number | null,
  range: number,
  strengthFloor: number,
  debug: Pick<
    DivergenceQualityDebug,
    "filteredByDistance" | "filteredByPersistence" | "filteredByStrength"
  >,
): boolean {
  const isMajor = wall.sizeBtc >= WALL_IMPORTANT_BTC * 2;
  if (refPrice != null && range > 0) {
    const distFrac = Math.abs(wall.price - refPrice) / range;
    if (distFrac > MAX_PASSIVE_DISTANCE_FRAC && !isMajor) {
      debug.filteredByDistance += 1;
      return false;
    }
  }
  if (wall.persistenceMs < MIN_WALL_PERSISTENCE_MS && !isMajor) {
    debug.filteredByPersistence += 1;
    return false;
  }
  if (wall.sizeBtc < strengthFloor * MIN_RELATIVE_WALL_STRENGTH && !isMajor) {
    debug.filteredByStrength += 1;
    return false;
  }
  return true;
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
  filterPrefs?: DivergenceFilterPrefs;
  nowMs?: number;
};

export type DetectSpotPerpDivergenceResult = {
  signals: SpotPerpDivergenceSignal[];
  debug: DivergenceQualityDebug;
};

function detectPassiveSignals(
  spotWalls: WallCandidate[],
  perpWalls: WallCandidate[],
  params: DetectSpotPerpDivergenceParams,
  refPrice: number | null,
  range: number,
  strengthFloor: number,
  debug: DivergenceQualityDebug,
  nowMs: number,
): SpotPerpDivergenceSignal[] {
  const step = Math.max(1, params.domBucketSize);
  const out: SpotPerpDivergenceSignal[] = [];
  const allWalls = [...spotWalls, ...perpWalls];

  for (const sw of spotWalls.slice(0, 12)) {
    if (!passesPassiveQuality(sw, refPrice, range, strengthFloor, debug)) continue;

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
      out.push(
        finalizeSignal(
          {
            type: "SPOT_WALL_ONLY",
            side: sw.side,
            price: sw.price,
            confidence,
            wall: sw,
          },
          step,
          nowMs,
        ),
      );
    }

    if (
      pw &&
      pw.sizeBtc >= WALL_IMPORTANT_BTC * 0.5 &&
      sw.sizeBtc >= WALL_IMPORTANT_BTC * 0.5 &&
      passesPassiveQuality(pw, refPrice, range, strengthFloor, debug)
    ) {
      const matchRatio = Math.min(sw.sizeBtc, pw.sizeBtc) / Math.max(sw.sizeBtc, pw.sizeBtc);
      const confidence =
        liquidityScore * 0.35 +
        matchRatio * 0.3 +
        prox * 0.2 +
        persist * 0.15;
      out.push(
        finalizeSignal(
          {
            type: sw.side === "bid" ? "BID_CONFLUENCE" : "ASK_CONFLUENCE",
            side: sw.side,
            price: (sw.price + pw.price) / 2,
            confidence,
            wall: sw,
          },
          step,
          nowMs,
        ),
      );
    }
  }

  for (const pw of perpWalls.slice(0, 12)) {
    if (!passesPassiveQuality(pw, refPrice, range, strengthFloor, debug)) continue;
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
    out.push(
      finalizeSignal(
        {
          type: "PERP_WALL_ONLY",
          side: pw.side,
          price: pw.price,
          confidence,
          wall: pw,
        },
        step,
        nowMs,
      ),
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
  const step = Math.max(1, params.domBucketSize);
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
      spotAggScore * 0.3 + aggressionScore * 0.3 + prox * 0.2 + 0.2;
    out.push(
      finalizeSignal(
        {
          type: "SPOT_CONFIRMS_PERP",
          side: perpImb > 0 ? "bullish" : "bearish",
          price,
          confidence,
        },
        step,
        nowMs,
      ),
    );
  }

  if (perpAbs >= 18 && spotAbs < 8) {
    const confidence =
      aggressionScore * 0.3 +
      (1 - spotAggScore) * 0.35 +
      prox * 0.2 +
      0.15;
    out.push(
      finalizeSignal(
        {
          type: "PERP_PRESSURE_NO_SPOT_CONFIRMATION",
          side: perpImb > 0 ? "bullish" : "bearish",
          price,
          confidence,
        },
        step,
        nowMs,
      ),
    );
  }

  if (perpImb <= -18 && spot.delta >= -spot.volume * 0.05) {
    const confidence =
      aggressionScore * 0.3 +
      clamp01(spot.buyVolume / Math.max(perp.sellVolume, 0.1)) * 0.25 +
      prox * 0.2 +
      0.15;
    out.push(
      finalizeSignal(
        {
          type: "SPOT_ABSORPTION_PERP_AGGRESSION",
          side: "bid",
          price,
          confidence,
        },
        step,
        nowMs,
      ),
    );
  } else if (perpImb >= 18 && spot.delta <= spot.volume * 0.05) {
    const confidence =
      aggressionScore * 0.3 +
      clamp01(spot.sellVolume / Math.max(perp.buyVolume, 0.1)) * 0.25 +
      prox * 0.2 +
      0.15;
    out.push(
      finalizeSignal(
        {
          type: "SPOT_ABSORPTION_PERP_AGGRESSION",
          side: "ask",
          price,
          confidence,
        },
        step,
        nowMs,
      ),
    );
  }

  if (perpAbs >= 15 && spotAbs >= 8 && !sameSign) {
    const confidence =
      aggressionScore * 0.35 + spotAggScore * 0.2 + prox * 0.2 + 0.15;
    out.push(
      finalizeSignal(
        {
          type: "PERP_LEADS_SPOT",
          side: perpImb > 0 ? "bullish" : "bearish",
          price,
          confidence,
        },
        step,
        nowMs,
      ),
    );
  }

  return out;
}

const DEFAULT_FILTER_PREFS: DivergenceFilterPrefs = {
  passiveLiquidity: true,
  aggressionDivergence: true,
  confluenceSignals: true,
};

export function detectSpotPerpDivergence(
  params: DetectSpotPerpDivergenceParams,
): DetectSpotPerpDivergenceResult {
  const nowMs = params.nowMs ?? Date.now();
  const range = Math.max(1, params.maxPrice - params.minPrice);
  const step = Math.max(1, params.domBucketSize);
  const filterPrefs = params.filterPrefs ?? DEFAULT_FILTER_PREFS;

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
  const strengthFloor = wallStrengthPercentile([...spotWalls, ...perpWalls]);

  const debug: DivergenceQualityDebug = {
    candidates: 0,
    filteredByDistance: 0,
    filteredByPersistence: 0,
    filteredByStrength: 0,
    filteredByType: 0,
    duplicateSuppressed: 0,
    filteredByCooldown: 0,
    filtered: 0,
    activeSignals: 0,
    rejectedLowConfidence: 0,
    strongestSignal: null,
  };

  const rawCandidates: SpotPerpDivergenceSignal[] = [
    ...detectPassiveSignals(
      spotWalls,
      perpWalls,
      params,
      refPrice,
      range,
      strengthFloor,
      debug,
      nowMs,
    ),
  ];

  if (params.spotAggression && params.perpAggression) {
    rawCandidates.push(
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

  debug.candidates = rawCandidates.length;

  const afterType = rawCandidates.filter((s) => {
    if (passesTypeFilter(s.type, filterPrefs)) return true;
    debug.filteredByType += 1;
    return false;
  });

  const { signals: afterDup, suppressed } = suppressDuplicatePriceSignals(
    afterType,
    step,
  );
  debug.duplicateSuppressed = suppressed;

  const byConfidence = [...afterDup].sort((a, b) => b.confidence - a.confidence);
  const deduped: SpotPerpDivergenceSignal[] = [];
  const seenTypes = new Set<string>();
  for (const s of byConfidence) {
    const key = `${s.type}:${s.side}`;
    if (seenTypes.has(key)) continue;
    seenTypes.add(key);
    deduped.push(s);
  }

  const { signals: afterCooldown, filtered: cooldownFiltered } =
    applyDivergenceCooldown(deduped, step, nowMs);
  debug.filteredByCooldown = cooldownFiltered;

  const active = afterCooldown.filter((s) => s.severity !== "low").slice(0, 8);
  debug.rejectedLowConfidence = afterCooldown.length - active.length;
  debug.activeSignals = active.length;
  debug.filtered =
    debug.filteredByDistance +
    debug.filteredByPersistence +
    debug.filteredByStrength +
    debug.filteredByType +
    debug.duplicateSuppressed +
    debug.filteredByCooldown +
    debug.rejectedLowConfidence;
  debug.strongestSignal = active[0] ?? null;

  return { signals: active, debug };
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
