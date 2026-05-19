/**
 * Phase 2 Volatility Engine — candle / ATR / range / volume only.
 * Phase 3.5 gamma refinement: see volatilityGammaInterpretation.ts
 */

export {
  refineVolatilityWithGamma,
  buildGammaInterpretation,
  type GammaInterpretationBundle,
  type GammaRegimeClass,
} from "@/lib/volatilityGammaInterpretation";

export {
  refineVolatilityWithLiquidity,
  type LiquidityInterpretationBundle,
} from "@/lib/volatilityLiquidityInterpretation";

export { refineVolatilityWithConflictResolution } from "@/lib/volatilityConflictResolution";

export {
  refineVolatilityWithPlaybook,
  buildVolatilityPlaybook,
} from "@/lib/volatilityPlaybookEngine";

export type SignalAlignment =
  | "ALIGNED"
  | "PARTIALLY_ALIGNED"
  | "CONFLICTED"
  | "STRONGLY_CONFLICTED"
  | "UNKNOWN";

export type ResolutionState =
  | "CLEAN_CONTINUATION"
  | "CONFLICTED_CONTINUATION"
  | "FAKEOUT_RISK"
  | "ABSORPTION_REVERSAL_RISK"
  | "CHOP_NO_TRADE"
  | "WAIT_SWEEP_RESOLUTION"
  | "WAIT_ACCEPTANCE"
  | "UNKNOWN";

export type ExecutionBias =
  | "LONG"
  | "SHORT"
  | "TWO_SIDED"
  | "CONFLICTED"
  | "NO_TRADE";

export type PlaybookMode =
  | "NO_TRADE"
  | "WAIT_TRIGGER"
  | "WAIT_CONFIRMATION"
  | "CONTINUATION"
  | "REVERSAL_WATCH"
  | "RANGE_CHOP";

export type PlaybookScenarioStatus = "ACTIVE" | "WAITING" | "BLOCKED" | "DISABLED";

export type VolatilityPlaybookScenario = {
  enabled: boolean;
  scenarioStatus: PlaybookScenarioStatus;
  condition: string;
  activationTrigger: string;
  confirmation: OrderflowConfirmationLevel;
  blockingReasons: string[];
  targetPrimary?: string;
  targetSecondary?: string;
  targetExtended?: string;
  invalidation: string;
};

export type VolatilityOperationalPlaybook = {
  mode: PlaybookMode;
  headline: string;
  summary: string;
  currentAction: string;
  upsideScenario: VolatilityPlaybookScenario;
  downsideScenario: VolatilityPlaybookScenario;
  avoid: string[];
  nextCheckpoint: string;
};

export type LiquidityWall = {
  price: number;
  size: number;
  side?: "BID" | "ASK";
  strength?: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  distancePct?: number;
};

export type LiquidityVoid = {
  low: number;
  high: number;
  direction?: "UP" | "DOWN" | "BOTH";
  intensity?: number;
};

export type SweepContext = {
  status?: "IDLE" | "SETUP" | "TRIGGERED" | "IN_PROGRESS" | "RESOLVED";
  direction?: "UP" | "DOWN" | "TWO_SIDED" | "NONE";
  type?: string;
  confidence?: number;
  level?: number;
};

export type CascadeContext = {
  risk?: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  direction?: "UP" | "DOWN" | "TWO_SIDED" | "NONE";
  triggerLevel?: number;
  targetZone?: number;
};

export type AbsorptionContext = {
  detected?: boolean;
  side?: "BID" | "ASK" | "BOTH" | "NONE";
  level?: number;
  strength?: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
};

export type LiquidityContextInput = {
  majorWalls?: LiquidityWall[];
  nearestWall?: LiquidityWall;
  activeMagnet?: number;
  liquidityVoids?: LiquidityVoid[];
  nearestVoid?: LiquidityVoid;
  heatmapPressure?: "UPSIDE" | "DOWNSIDE" | "TWO_SIDED" | "NEUTRAL" | "UNKNOWN";
  sweep?: SweepContext;
  cascade?: CascadeContext;
  absorption?: AbsorptionContext;
};

export type LiquidityRegime =
  | "PINNED"
  | "THIN_LIQUIDITY"
  | "WALL_BLOCKED"
  | "BREAKOUT_PATH"
  | "SWEEP_ACTIVE"
  | "ABSORPTION_ACTIVE"
  | "NEUTRAL"
  | "UNKNOWN";

export type LiquidityBias = "UPSIDE" | "DOWNSIDE" | "TWO_SIDED" | "NEUTRAL" | "UNKNOWN";

export type LiquidityVolImpact =
  | "COMPRESSION"
  | "EXPANSION_PATH"
  | "FAKEOUT_RISK"
  | "CASCADE_RISK"
  | "REVERSAL_RISK"
  | "UNKNOWN";

export type OrderflowConfirmationLevel = "NONE" | "WEAK" | "MODERATE" | "STRONG";

export type NearestLiquidityLevelType =
  | "WALL"
  | "VOID"
  | "MAGNET"
  | "SWEEP_LEVEL"
  | "CASCADE_TRIGGER"
  | "ABSORPTION_LEVEL"
  | "NONE";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type VolatilityEngineInput = {
  candles: Candle[];
  spot?: number;
  symbol?: string;
  timeframe?: string;
};

export type VolMarketEnergyState =
  | "COMPRESSED"
  | "LOADED"
  | "EXPANDING"
  | "EXHAUSTED";

export type VolExpansionRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export type VolTradeQuality = "EXCELLENT" | "GOOD" | "LOW" | "NO TRADE";

export type VolReversalWatch = "INACTIVE" | "ACTIVE" | "HIGH";

export type VolDirectionalPressure = "UPSIDE" | "DOWNSIDE" | "TWO-SIDED" | "NEUTRAL";

export type VolEngineAction =
  | "NO TRADE"
  | "WAIT TRIGGER"
  | "WAIT CONFIRMATION"
  | "TRAIL / DO NOT FADE"
  | "WAIT ABSORPTION";

export type VolatilityEngineOutput = {
  volState: VolMarketEnergyState;
  expansionRisk: number;
  riskLabel: VolExpansionRiskLevel;
  directionalPressure: VolDirectionalPressure;
  action: VolEngineAction;
  triggerZones: {
    upsideExpansionTrigger: number;
    downsideExpansionTrigger: number;
    compressionMagnet: number;
  };
  expectedMove: {
    m15: number;
    h1: number;
    h4: number;
    daily: number;
  };
  moveUsed: number;
  explanations: {
    executiveDecision: string;
    executiveSubtext: string;
    marketEnergyExplanation: string;
    directionalExplanation: string;
    directionalWarning: string;
    expectedMoveInterpretation: string;
    bestPlay: string;
    avoid: string;
    invalidation: string;
    executionRule: string;
  };
  marketEnergyTags: string[];
  directionalTags: string[];
  tradeQuality: VolTradeQuality;
  tradeQualityScore: number;
  lateChaseRisk: VolExpansionRiskLevel;
  reversalWatch: VolReversalWatch;
  cleanExpansionRiskLabel: VolExpansionRiskLevel;
  tradeRiskLabel: VolExpansionRiskLevel;
  riskSummary: string;
  qualityReasons: string[];
  /** True when calculation used sufficient normalized candles */
  computedFromCandles: boolean;
  /** Phase 3.5 gamma layer (optional) */
  gammaIntegrated?: boolean;
  gammaRegimeClass?: string;
  gammaInterpretation?: string;
  gammaPrimaryRisk?: string;
  gammaSecondaryRisk?: string;
  gammaActionHint?: string;
  gammaVolImpact?: string;
  gammaDealerBehavior?: string;
  gammaStripTag?: string;
  /** Phase 4 liquidity / orderflow layer */
  liquidityIntegrated?: boolean;
  liquidityRegime?: LiquidityRegime;
  liquidityBias?: LiquidityBias;
  liquidityVolImpact?: LiquidityVolImpact;
  liquidityReasons?: string[];
  nearestLiquidityLevel?: {
    type: NearestLiquidityLevelType;
    price?: number;
    distancePct?: number;
    description: string;
  };
  orderflowConfirmation?: OrderflowConfirmationLevel;
  triggerConfirmation?: {
    upside: OrderflowConfirmationLevel;
    downside: OrderflowConfirmationLevel;
  };
  liquidityStripTag?: string;
  /** Phase 4.5 conflict resolution */
  signalAlignment?: SignalAlignment;
  resolutionState?: ResolutionState;
  primaryConflict?: string;
  conflictReasons?: string[];
  resolutionHint?: string;
  executionBias?: ExecutionBias;
  conflictStripTag?: string;
  /** Phase 5 operational playbook */
  playbook?: VolatilityOperationalPlaybook;
};

const MIN_CANDLES = 20;
const ATR_PERIOD = 14;
const RANGE_WINDOW = 12;
const RECENT_RANGE_LOOKBACK = 24;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundPrice(n: number, spot: number): number {
  if (!Number.isFinite(n)) return n;
  const step = spot >= 10_000 ? 10 : spot >= 1_000 ? 5 : 1;
  return Math.round(n / step) * step;
}

function roundMove(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function extractTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Defensive normalization for /api/market/candles responses. */
export function normalizeVolatilityCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    let time = extractTime(obj.time ?? obj.timestamp ?? obj.openTime);
    if (time === null) continue;
    if (time > 1e10) time = Math.floor(time / 1000);

    const num = (k: string): number | null => {
      const v = obj[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const open = num("open");
    const high = num("high");
    const low = num("low");
    const close = num("close");
    if (open === null || high === null || low === null || close === null) continue;
    const vol = num("volume");
    out.push({
      time,
      open,
      high,
      low,
      close,
      volume: vol ?? undefined,
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function trueRange(candles: Candle[], i: number): number {
  const c = candles[i]!;
  const hl = c.high - c.low;
  if (i === 0) return hl;
  const prev = candles[i - 1]!.close;
  return Math.max(hl, Math.abs(c.high - prev), Math.abs(c.low - prev));
}

function computeAtr(candles: Candle[], endIndex: number, period: number): number {
  if (endIndex < period) return NaN;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += trueRange(candles, i);
  }
  return sum / period;
}

function windowRange(candles: Candle[], endIndex: number, window: number): number {
  const start = Math.max(0, endIndex - window + 1);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = start; i <= endIndex; i++) {
    hi = Math.max(hi, candles[i]!.high);
    lo = Math.min(lo, candles[i]!.low);
  }
  return hi - lo;
}

function averageRollingRange(candles: Candle[], window: number, sampleEnd: number, sampleCount: number): number {
  const ranges: number[] = [];
  for (let end = sampleEnd; end >= window && ranges.length < sampleCount; end--) {
    ranges.push(windowRange(candles, end, window));
  }
  if (ranges.length === 0) return NaN;
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

function hasVolumeData(candles: Candle[]): boolean {
  return candles.some((c) => c.volume != null && c.volume > 0);
}

function recentVolumeRatio(candles: Candle[]): number {
  if (!hasVolumeData(candles)) return 1;
  const n = candles.length;
  const recentN = Math.min(6, Math.floor(n / 4));
  const avgN = Math.min(50, n - recentN);
  if (recentN < 2 || avgN < 4) return 1;

  const recent = candles.slice(-recentN);
  const prior = candles.slice(-(recentN + avgN), -recentN);
  const recentAvg = recent.reduce((s, c) => s + (c.volume ?? 0), 0) / recent.length;
  const priorAvg = prior.reduce((s, c) => s + (c.volume ?? 0), 0) / prior.length;
  if (priorAvg <= 0) return 1;
  return recentAvg / priorAvg;
}

function spotNearMid(spot: number, mid: number, range: number): boolean {
  if (range <= 0) return true;
  return Math.abs(spot - mid) / range <= 0.15;
}

function riskLabelFromScore(score: number): VolExpansionRiskLevel {
  if (score <= 25) return "LOW";
  if (score <= 50) return "MEDIUM";
  if (score <= 75) return "HIGH";
  return "EXTREME";
}

const RISK_RANK: Record<VolExpansionRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EXTREME: 3,
};

function maxRisk(
  a: VolExpansionRiskLevel,
  b: VolExpansionRiskLevel,
): VolExpansionRiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function lateChaseFromMoveUsed(
  moveUsed: number,
  volState: VolMarketEnergyState,
): VolExpansionRiskLevel {
  let level: VolExpansionRiskLevel;
  if (moveUsed < 40) level = "LOW";
  else if (moveUsed < 70) level = "MEDIUM";
  else if (moveUsed < 90) level = "HIGH";
  else level = "EXTREME";

  if (volState === "EXHAUSTED") level = maxRisk(level, "HIGH");
  if (volState === "EXPANDING" && moveUsed > 80) level = maxRisk(level, "HIGH");
  return level;
}

function reversalWatchFrom(
  moveUsed: number,
  volState: VolMarketEnergyState,
): VolReversalWatch {
  if (volState === "EXHAUSTED" && moveUsed > 85) return "HIGH";
  if (volState === "EXHAUSTED") return "ACTIVE";
  if (volState === "EXPANDING" && moveUsed > 80) return "ACTIVE";
  return "INACTIVE";
}

function resolveCleanExpansionRiskLabel(
  volState: VolMarketEnergyState,
  expansionRisk: number,
): VolExpansionRiskLevel {
  if (volState === "EXHAUSTED") return "LOW";
  if (volState === "EXPANDING") {
    if (expansionRisk >= 60) return "EXTREME";
    return expansionRisk >= 40 ? "HIGH" : "MEDIUM";
  }
  if (volState === "LOADED") {
    return expansionRisk >= 60 ? "HIGH" : expansionRisk >= 40 ? "MEDIUM" : "LOW";
  }
  if (volState === "COMPRESSED") {
    return expansionRisk >= 50 ? "MEDIUM" : "LOW";
  }
  return riskLabelFromScore(expansionRisk);
}

function tradeRiskLabelFrom(
  volState: VolMarketEnergyState,
  moveUsed: number,
  lateChaseRisk: VolExpansionRiskLevel,
): VolExpansionRiskLevel {
  if (volState === "EXHAUSTED") {
    return moveUsed > 90 ? "EXTREME" : "HIGH";
  }
  if (volState === "EXPANDING") {
    if (moveUsed > 80) return maxRisk(lateChaseRisk, "HIGH");
    if (moveUsed > 60) return "MEDIUM";
    return "MEDIUM";
  }
  if (volState === "LOADED") return "MEDIUM";
  if (volState === "COMPRESSED") return "LOW";
  return lateChaseRisk;
}

function riskSummaryFrom(
  volState: VolMarketEnergyState,
  moveUsed: number,
  lateChaseRisk: VolExpansionRiskLevel,
): string {
  if (volState === "EXHAUSTED") {
    return moveUsed > 85 || lateChaseRisk === "EXTREME"
      ? "EXTENSION RISK HIGH"
      : "LATE CHASE HIGH";
  }
  if (volState === "EXPANDING") return "EXPANSION ACTIVE";
  if (volState === "LOADED") return "EXPANSION BUILDING";
  return "WAIT TRIGGER";
}

function tradeQualityFromScore(score: number): VolTradeQuality {
  if (score >= 80) return "EXCELLENT";
  if (score >= 60) return "GOOD";
  if (score >= 35) return "LOW";
  return "NO TRADE";
}

function computeTradeQualityScore(params: {
  volState: VolMarketEnergyState;
  moveUsed: number;
  directionalPressure: VolDirectionalPressure;
  spot: number;
  upsideTrigger: number;
  downsideTrigger: number;
  lateExtension: boolean;
  expectedDaily: number;
}): number {
  let score = 50;

  if (params.volState === "LOADED") score += 20;
  if (params.volState === "EXPANDING" && params.moveUsed < 60) score += 15;
  if (params.directionalPressure !== "NEUTRAL") score += 10;

  const distUp = Math.abs(params.spot - params.upsideTrigger);
  const distDown = Math.abs(params.spot - params.downsideTrigger);
  const nearTrigger =
    Math.min(distUp, distDown) < params.expectedDaily * 0.15 && params.moveUsed < 80;
  if (nearTrigger) score += 10;

  if (params.volState === "EXHAUSTED") score -= 30;
  if (params.moveUsed > 85) score -= 25;
  if (
    params.directionalPressure === "TWO-SIDED" &&
    (params.volState === "COMPRESSED" || params.volState === "LOADED")
  ) {
    score -= 15;
  }
  if (params.moveUsed > 70) score -= 10;
  if (params.lateExtension) score -= 10;

  return clamp(Math.round(score), 0, 100);
}

function buildQualityReasons(params: {
  volState: VolMarketEnergyState;
  moveUsed: number;
  tradeQuality: VolTradeQuality;
  lateChaseRisk: VolExpansionRiskLevel;
  directionalPressure: VolDirectionalPressure;
  lateExtension: boolean;
}): string[] {
  const reasons: string[] = [];

  if (params.moveUsed > 85) reasons.push("Daily move mostly consumed");
  else if (params.moveUsed > 70) reasons.push("Move largely developed");

  if (params.volState === "EXHAUSTED") {
    reasons.push("Late entries have poor R/R");
    reasons.push("Wait for absorption or reclaim");
  } else if (params.lateChaseRisk === "HIGH" || params.lateChaseRisk === "EXTREME") {
    reasons.push("Late chase risk elevated");
  }

  if (params.volState === "COMPRESSED" || params.volState === "LOADED") {
    if (params.directionalPressure === "TWO-SIDED") {
      reasons.push("No trigger acceptance yet");
    } else if (params.tradeQuality === "GOOD" || params.tradeQuality === "EXCELLENT") {
      reasons.push("Triggers defined; wait for confirmation");
    }
  }

  if (params.volState === "EXPANDING" && params.moveUsed > 80) {
    reasons.push("Continuation only on pullback");
  }

  if (params.lateExtension) reasons.push("Candle extension looks mature");

  if (params.tradeQuality === "NO TRADE" && reasons.length < 3) {
    reasons.push("Stand aside until structure improves");
  }

  return reasons.slice(0, 3);
}

function resolveTradeQuality(
  score: number,
  volState: VolMarketEnergyState,
  moveUsed: number,
): VolTradeQuality {
  let quality = tradeQualityFromScore(score);

  if (volState === "EXHAUSTED") {
    quality = moveUsed > 75 ? "NO TRADE" : "LOW";
  } else if (volState === "EXPANDING") {
    if (moveUsed > 80) quality = "LOW";
    else if (moveUsed >= 60 && quality === "EXCELLENT") quality = "GOOD";
    else if (moveUsed < 60 && quality === "GOOD") quality = "EXCELLENT";
  } else if (volState === "LOADED") {
    if (quality === "NO TRADE") quality = "LOW";
    else if (score >= 55 && quality === "LOW") quality = "GOOD";
  } else if (volState === "COMPRESSED") {
    if (quality === "EXCELLENT" || quality === "GOOD") quality = "LOW";
    if (score < 35) quality = "NO TRADE";
  }

  return quality;
}

function wickReversalSign(candles: Candle[]): boolean {
  const last = candles[candles.length - 1];
  if (!last) return false;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const range = last.high - last.low;
  if (range <= 0) return false;
  return upperWick > body * 1.2 && upperWick > range * 0.35 ||
    lowerWick > body * 1.2 && lowerWick > range * 0.35;
}

function buildExpansionRiskScore(params: {
  compressionActive: boolean;
  strongCompression: boolean;
  atrRatio: number;
  compressionRatio: number;
  volumeRatio: number;
  spotNearMagnet: boolean;
  coilingNearMid: boolean;
  narrowRangeVsSpot: boolean;
}): number {
  let score = 0;
  if (params.compressionActive) score += 30;
  if (params.strongCompression) score += 15;
  if (params.compressionActive && params.atrRatio >= 0.75 && params.atrRatio <= 1.15) score += 10;
  if (params.compressionActive && params.atrRatio > 1.15) score += 20;
  if (params.volumeRatio > 1.15) score += 10;
  if (params.spotNearMagnet) score += 10;
  if (params.coilingNearMid) score += 10;
  if (params.narrowRangeVsSpot) score += 8;
  if (params.compressionRatio < 0.55) score += 5;
  return clamp(score, 0, 100);
}

function executiveCopy(volState: VolMarketEnergyState): { headline: string; subtext: string } {
  switch (volState) {
    case "COMPRESSED":
      return {
        headline: "MARKET IS COMPRESSED. DO NOT CHASE.",
        subtext:
          "Volatility is contracted. Wait for displacement away from the compression magnet.",
      };
    case "LOADED":
      return {
        headline: "MARKET IS LOADED. EXPANSION RISK IS BUILDING.",
        subtext:
          "Compression is active. Wait for acceptance or sweep confirmation through trigger zones.",
      };
    case "EXPANDING":
      return {
        headline: "MARKET IS EXPANDING. FOLLOW PULLBACKS, DO NOT FADE BLINDLY.",
        subtext:
          "Expansion is active. Continuation is possible, but late entries degrade as move used increases.",
      };
    case "EXHAUSTED":
      return {
        headline: "MARKET IS EXTENDED. LATE CHASE RISK IS HIGH.",
        subtext:
          "Most of the expected move is already consumed. Wait for absorption, reclaim, or range reset.",
      };
    default:
      return {
        headline: "VOLATILITY REGIME UNCLEAR. STAND ASIDE UNTIL STRUCTURE CLEARS.",
        subtext: "Use trigger zones and confirmation before execution.",
      };
  }
}

function playbookCopy(volState: VolMarketEnergyState): {
  bestPlay: string;
  avoid: string;
  invalidation: string;
} {
  switch (volState) {
    case "EXPANDING":
      return {
        bestPlay: "Look for continuation on pullback. Do not fade unless absorption appears.",
        avoid: "Do not fade expansion without absorption.",
        invalidation: "Failed continuation with acceptance back inside the prior range.",
      };
    case "EXHAUSTED":
      return {
        bestPlay:
          "Wait for absorption, failed continuation, or reclaim before considering entry.",
        avoid:
          "Do not chase lows/highs after most of the expected move is consumed.",
        invalidation:
          "Fresh acceptance beyond the trigger with renewed range expansion.",
      };
    case "LOADED":
      return {
        bestPlay: "Wait for sweep + reclaim or clean acceptance through a trigger zone.",
        avoid: "Do not chase inside compression.",
        invalidation: "Failed acceptance back into the compression magnet.",
      };
    case "COMPRESSED":
    default:
      return {
        bestPlay: "Wait for sweep + reclaim or clean acceptance through a trigger zone.",
        avoid: "Do not chase inside compression.",
        invalidation: "Failed acceptance back into the compression magnet.",
      };
  }
}

function buildOperationalFields(params: {
  volState: VolMarketEnergyState;
  expansionRisk: number;
  moveUsed: number;
  directionalPressure: VolDirectionalPressure;
  spot: number;
  upsideTrigger: number;
  downsideTrigger: number;
  expectedDaily: number;
  lateExtension: boolean;
}): Pick<
  VolatilityEngineOutput,
  | "tradeQuality"
  | "tradeQualityScore"
  | "lateChaseRisk"
  | "reversalWatch"
  | "cleanExpansionRiskLabel"
  | "tradeRiskLabel"
  | "riskSummary"
  | "qualityReasons"
> {
  const lateChaseRisk = lateChaseFromMoveUsed(params.moveUsed, params.volState);
  const reversalWatch = reversalWatchFrom(params.moveUsed, params.volState);
  const cleanExpansionRiskLabel = resolveCleanExpansionRiskLabel(
    params.volState,
    params.expansionRisk,
  );
  const tradeRiskLabel = tradeRiskLabelFrom(
    params.volState,
    params.moveUsed,
    lateChaseRisk,
  );
  const riskSummary = riskSummaryFrom(params.volState, params.moveUsed, lateChaseRisk);

  const tradeQualityScore = computeTradeQualityScore({
    volState: params.volState,
    moveUsed: params.moveUsed,
    directionalPressure: params.directionalPressure,
    spot: params.spot,
    upsideTrigger: params.upsideTrigger,
    downsideTrigger: params.downsideTrigger,
    lateExtension: params.lateExtension,
    expectedDaily: params.expectedDaily,
  });
  const tradeQuality = resolveTradeQuality(
    tradeQualityScore,
    params.volState,
    params.moveUsed,
  );
  const qualityReasons = buildQualityReasons({
    volState: params.volState,
    moveUsed: params.moveUsed,
    tradeQuality,
    lateChaseRisk,
    directionalPressure: params.directionalPressure,
    lateExtension: params.lateExtension,
  });

  return {
    tradeQuality,
    tradeQualityScore,
    lateChaseRisk,
    reversalWatch,
    cleanExpansionRiskLabel,
    tradeRiskLabel,
    riskSummary,
    qualityReasons,
  };
}

function resolveAction(
  volState: VolMarketEnergyState,
  directionalPressure: VolDirectionalPressure,
  expansionRisk: number,
): VolEngineAction {
  if (volState === "EXPANDING") return "TRAIL / DO NOT FADE";
  if (volState === "EXHAUSTED") return "WAIT ABSORPTION";
  if (volState === "LOADED") return "WAIT TRIGGER";
  if (volState === "COMPRESSED" && expansionRisk < 35) return "NO TRADE";
  if (volState === "COMPRESSED" && directionalPressure === "NEUTRAL") return "WAIT CONFIRMATION";
  return "WAIT TRIGGER";
}

function directionalDisplay(pressure: VolDirectionalPressure, compressionActive: boolean): string {
  if (pressure === "TWO-SIDED" && compressionActive) return "TWO-SIDED / UNSTABLE";
  return pressure;
}

function marketEnergyTags(params: {
  compressionActive: boolean;
  strongCompression: boolean;
  atrRatio: number;
  volumeRatio: number;
}): string[] {
  const tags: string[] = [];
  if (params.compressionActive) tags.push("Compression active");
  if (params.strongCompression) tags.push("Strong compression");
  if (params.atrRatio < 0.85) tags.push("ATR depressed");
  if (params.atrRatio > 1.05 && params.compressionActive) tags.push("ATR waking up");
  if (params.volumeRatio > 1.15) tags.push("Volume rising");
  if (params.volumeRatio < 0.85) tags.push("Volume fading");
  if (tags.length === 0) tags.push("Range contracting");
  return tags.slice(0, 4);
}

function directionalTags(
  pressure: VolDirectionalPressure,
  compressionActive: boolean,
): string[] {
  const tags: string[] = [];
  if (compressionActive) tags.push("Compression active");
  if (pressure === "TWO-SIDED") tags.push("Mid-range balance");
  if (pressure === "UPSIDE") tags.push("Upper range pressure");
  if (pressure === "DOWNSIDE") tags.push("Lower range pressure");
  if (pressure === "NEUTRAL") tags.push("No clear edge");
  return tags.slice(0, 3);
}

function moveUsedInterpretation(moveUsed: number, volState: VolMarketEnergyState): string {
  if (moveUsed >= 80) {
    return "Most of the expected daily move is consumed. Expansion potential is limited until reset or absorption.";
  }
  if (moveUsed >= 55) {
    return "Move is partially developed. Selective continuation only with confirmation.";
  }
  if (volState === "LOADED" || volState === "COMPRESSED") {
    return "Move is still underdeveloped. Expansion potential remains available if triggers clear.";
  }
  return "Move usage is moderate relative to the ATR-based daily estimate.";
}

/** Static fallback when candles are missing or insufficient. */
export function getFallbackVolatilityOutput(spot?: number): VolatilityEngineOutput {
  const s = spot != null && Number.isFinite(spot) && spot > 0 ? spot : 80_000;
  const buf = Math.max(40, s * 0.0005);
  return {
    volState: "LOADED",
    expansionRisk: 72,
    riskLabel: "HIGH",
    directionalPressure: "TWO-SIDED",
    action: "WAIT TRIGGER",
    triggerZones: {
      upsideExpansionTrigger: roundPrice(s + 450, s),
      downsideExpansionTrigger: roundPrice(s - 450, s),
      compressionMagnet: roundPrice(s, s),
    },
    expectedMove: { m15: 120, h1: 390, h4: 820, daily: 1450 },
    moveUsed: 42,
    explanations: {
      executiveDecision: "MARKET IS LOADED. EXPANSION RISK IS BUILDING.",
      executiveSubtext:
        "Compression is active. Wait for acceptance or sweep confirmation through trigger zones.",
      marketEnergyExplanation:
        "Compression detected. Expansion risk is building near key trigger zones.",
      directionalExplanation:
        "Price is near a regime transition zone. Fakeout risk is elevated. Wait for acceptance.",
      directionalWarning: "First breakout can fail near regime transition zones.",
      expectedMoveInterpretation:
        "Move is still underdeveloped. Expansion potential remains available.",
      bestPlay: "Wait for sweep + reclaim or clean acceptance through a trigger zone.",
      avoid: "Do not chase inside compression. Do not fade expansion without absorption.",
      invalidation: "Acceptance beyond the opposite trigger with rising aggressive flow.",
      executionRule: "Trigger first, confirmation second, entry third.",
    },
    marketEnergyTags: ["Compression active", "Range contracting", "Trigger zones nearby"],
    directionalTags: ["Mid-range balance", "Compression active"],
    tradeQuality: "GOOD",
    tradeQualityScore: 62,
    lateChaseRisk: "LOW",
    reversalWatch: "INACTIVE",
    cleanExpansionRiskLabel: "HIGH",
    tradeRiskLabel: "MEDIUM",
    riskSummary: "EXPANSION BUILDING",
    qualityReasons: ["Triggers defined; wait for confirmation", "Compression active"],
    computedFromCandles: false,
  };
}

export function calculateVolatilityEngine(input: VolatilityEngineInput): VolatilityEngineOutput {
  const candles = normalizeVolatilityCandles(input.candles);
  const spotFromInput = input.spot;
  const lastClose = candles.length > 0 ? candles[candles.length - 1]!.close : NaN;
  const spot =
    spotFromInput != null && Number.isFinite(spotFromInput) && spotFromInput > 0
      ? spotFromInput
      : lastClose;

  if (candles.length < MIN_CANDLES || !Number.isFinite(spot) || spot <= 0) {
    return getFallbackVolatilityOutput(Number.isFinite(spot) ? spot : undefined);
  }

  const n = candles.length;
  const end = n - 1;

  const currentAtr = computeAtr(candles, end, ATR_PERIOD);
  if (!Number.isFinite(currentAtr) || currentAtr <= 0) {
    return getFallbackVolatilityOutput(spot);
  }

  const atrSamples: number[] = [];
  const sampleCount = Math.min(50, n - ATR_PERIOD);
  for (let i = 0; i < sampleCount; i++) {
    const idx = end - i;
    if (idx < ATR_PERIOD) break;
    const v = computeAtr(candles, idx, ATR_PERIOD);
    if (Number.isFinite(v)) atrSamples.push(v);
  }
  const averageAtr =
    atrSamples.length > 0 ? atrSamples.reduce((a, b) => a + b, 0) / atrSamples.length : currentAtr;
  const atrRatio = currentAtr / (averageAtr > 0 ? averageAtr : currentAtr);

  const currentRange = windowRange(candles, end, RANGE_WINDOW);
  const averageRange = averageRollingRange(candles, RANGE_WINDOW, end - RANGE_WINDOW, 40);
  const compressionRatio =
    averageRange > 0 && Number.isFinite(averageRange) ? currentRange / averageRange : 1;

  const compressionActive = compressionRatio < 0.65;
  const strongCompression = compressionRatio < 0.45;

  const lastTr = trueRange(candles, end);
  const last3Range = windowRange(candles, end, 3);
  const volumeRatio = recentVolumeRatio(candles);
  const volumeNotCollapsing = volumeRatio >= 0.85;

  const lookback = Math.min(RECENT_RANGE_LOOKBACK, n);
  const rangeStart = n - lookback;
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = rangeStart; i < n; i++) {
    rangeHigh = Math.max(rangeHigh, candles[i]!.high);
    rangeLow = Math.min(rangeLow, candles[i]!.low);
  }
  const rangeMid = (rangeHigh + rangeLow) / 2;
  const rangeSpan = rangeHigh - rangeLow;

  const buffer = Math.max(currentAtr * 0.15, spot * 0.0005);
  const upsideExpansionTrigger = roundPrice(rangeHigh + buffer, spot);
  const downsideExpansionTrigger = roundPrice(rangeLow - buffer, spot);
  const compressionMagnet = roundPrice(rangeMid, spot);

  const expectedDaily = currentAtr * Math.sqrt(96);
  const dailyBars = Math.min(96, n);
  const dailyRangeSoFar = windowRange(candles, end, dailyBars);
  const moveUsed = clamp((dailyRangeSoFar / Math.max(expectedDaily, 1)) * 100, 0, 100);

  const coilingNearMid = spotNearMid(spot, rangeMid, rangeSpan);
  const spotNearMagnet = spotNearMid(spot, compressionMagnet, Math.max(rangeSpan, currentAtr));
  const narrowRangeVsSpot = currentRange / spot < 0.004;

  const expansionRisk = buildExpansionRiskScore({
    compressionActive,
    strongCompression,
    atrRatio,
    compressionRatio,
    volumeRatio,
    spotNearMagnet,
    coilingNearMid,
    narrowRangeVsSpot,
  });

  const strongExpansion =
    last3Range > currentAtr * 2.2 && volumeNotCollapsing && atrRatio > 1.05;
  const exhausted =
    moveUsed >= 80 && (wickReversalSign(candles) || lastTr > currentAtr * 1.5);

  let volState: VolMarketEnergyState;
  if (strongExpansion && moveUsed < 80) {
    volState = "EXPANDING";
  } else if (exhausted || (moveUsed >= 80 && last3Range > currentAtr * 2)) {
    volState = "EXHAUSTED";
  } else if (compressionActive && expansionRisk >= 60) {
    volState = "LOADED";
  } else if (compressionActive && expansionRisk < 60) {
    volState = "COMPRESSED";
  } else if (expansionRisk >= 50) {
    volState = "LOADED";
  } else {
    volState = "COMPRESSED";
  }

  const close = candles[end]!.close;
  const upperThird = rangeLow + rangeSpan * 0.66;
  const lowerThird = rangeLow + rangeSpan * 0.34;

  let directionalPressure: VolDirectionalPressure;
  if (compressionActive && coilingNearMid) {
    directionalPressure = "TWO-SIDED";
  } else if (close >= upperThird && close > rangeMid) {
    directionalPressure = "UPSIDE";
  } else if (close <= lowerThird && close < rangeMid) {
    directionalPressure = "DOWNSIDE";
  } else if (coilingNearMid) {
    directionalPressure = "TWO-SIDED";
  } else {
    directionalPressure = "NEUTRAL";
  }

  const riskLabel = riskLabelFromScore(expansionRisk);
  const action = resolveAction(volState, directionalPressure, expansionRisk);
  const exec = executiveCopy(volState);
  const playbook = playbookCopy(volState);

  const lateExtension =
    moveUsed > 70 ||
    wickReversalSign(candles) ||
    volState === "EXHAUSTED" ||
    last3Range > currentAtr * 2;

  const operational = buildOperationalFields({
    volState,
    expansionRisk,
    moveUsed,
    directionalPressure,
    spot,
    upsideTrigger: upsideExpansionTrigger,
    downsideTrigger: downsideExpansionTrigger,
    expectedDaily,
    lateExtension,
  });

  const m15 = roundMove(currentAtr);
  const h1 = roundMove(currentAtr * 2);
  const h4 = roundMove(currentAtr * 4);
  const daily = roundMove(expectedDaily);

  let marketEnergyExplanation: string;
  switch (volState) {
    case "EXPANDING":
      marketEnergyExplanation =
        "Range is extending beyond baseline ATR. Momentum can continue until absorption appears.";
      break;
    case "EXHAUSTED":
      marketEnergyExplanation =
        "Extension is mature relative to the expected daily move. Mean-reversion risk is rising.";
      break;
    case "LOADED":
      marketEnergyExplanation =
        "Compression detected. Expansion risk is building near key trigger zones.";
      break;
    default:
      marketEnergyExplanation =
        "Range is compressed versus recent history. Breakouts need acceptance, not first touch.";
  }

  let directionalExplanation: string;
  switch (directionalPressure) {
    case "UPSIDE":
      directionalExplanation =
        "Price is holding the upper portion of the recent range. Upside acceptance can accelerate expansion.";
      break;
    case "DOWNSIDE":
      directionalExplanation =
        "Price is pressing the lower portion of the recent range. Downside acceptance can accelerate expansion.";
      break;
    case "TWO-SIDED":
      directionalExplanation =
        "Price is near range equilibrium with compression active. Fakeout risk is elevated; wait for acceptance.";
      break;
    default:
      directionalExplanation =
        "Directional edge is unclear. Let the market choose a side through a trigger zone.";
  }

  return {
    volState,
    expansionRisk,
    riskLabel,
    directionalPressure,
    action,
    triggerZones: {
      upsideExpansionTrigger,
      downsideExpansionTrigger,
      compressionMagnet,
    },
    expectedMove: { m15, h1, h4, daily },
    moveUsed: Math.round(moveUsed),
    explanations: {
      executiveDecision: exec.headline,
      executiveSubtext: exec.subtext,
      marketEnergyExplanation,
      directionalExplanation,
      directionalWarning: "First breakout can fail near regime transition zones.",
      expectedMoveInterpretation: moveUsedInterpretation(moveUsed, volState),
      bestPlay: playbook.bestPlay,
      avoid: playbook.avoid,
      invalidation: playbook.invalidation,
      executionRule: "Trigger first, confirmation second, entry third.",
    },
    marketEnergyTags: marketEnergyTags({
      compressionActive,
      strongCompression,
      atrRatio,
      volumeRatio,
    }),
    directionalTags: directionalTags(directionalPressure, compressionActive),
    ...operational,
    computedFromCandles: true,
  };
}

/** Candle-derived vol context — no gamma integration until Phase 3. */
export function volContextFromEngine(output: VolatilityEngineOutput): {
  volRegime: string;
  candleStructure: string;
  gammaLayer: string;
  expectedBehavior: string;
  interpretation: string;
} {
  const volRegime =
    output.volState === "EXHAUSTED"
      ? "Exhausted"
      : output.volState === "EXPANDING"
        ? "Expanding"
        : output.volState === "LOADED"
          ? "Loaded"
          : "Compressed";

  const candleStructure =
    output.volState === "EXHAUSTED"
      ? "Extension mature"
      : output.volState === "EXPANDING"
        ? "Range extending"
        : output.volState === "LOADED"
          ? "Coiling / compressed"
          : "Tight range";

  const expected =
    output.volState === "EXPANDING"
      ? "Continuation / extension risk"
      : output.volState === "EXHAUSTED"
        ? "Mean-reversion / fade risk"
        : output.volState === "LOADED"
          ? "Breakout / fakeout risk"
          : "Range / compression";

  return {
    volRegime,
    candleStructure,
    gammaLayer: "Not integrated yet",
    expectedBehavior: expected,
    interpretation:
      output.volState === "EXPANDING"
        ? "ATR expansion favors acceleration. Trail structure; do not fade without absorption."
        : output.volState === "EXHAUSTED"
          ? "Daily move largely consumed. Late chase and reversal risk dominate over fresh expansion."
          : "Compressed ranges favor patience. Triggers and acceptance matter more than mid-range trades.",
  };
}

export function directionalPressureLabel(
  output: VolatilityEngineOutput,
  compressionActive: boolean,
): string {
  return directionalDisplay(output.directionalPressure, compressionActive);
}
