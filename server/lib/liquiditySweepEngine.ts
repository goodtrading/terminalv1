/**
 * Institutional Liquidity Sweep Engine.
 * Detects sweep setup/execution, classifies type, computes confidence and outcome.
 */

// ─── Output contract ───────────────────────────────────────────────────────

export type SweepStatus = "IDLE" | "SETUP" | "TRIGGERED" | "IN_PROGRESS" | "RESOLVED";
export type SweepDirection = "UP" | "DOWN" | "TWO_SIDED" | "NONE";
export type SweepType =
  | "CONTINUATION"   // Sweep then sustained move
  | "EXHAUSTION"     // Sweep then reversal
  | "FAILED"         // Attempt to sweep rejected
  | "ABSORPTION"     // Liquidity absorbed, no violent move
  | "TWO_SIDED"      // Liquidity both sides, break either way
  | "TRAP"           // False break then reverse
  | "SETUP_UP"       // Pre-sweep setup favouring upside
  | "SETUP_DOWN"     // Pre-sweep setup favouring downside
  | "SETUP_TWO_SIDED";

export type SweepOutcome =
  | "PENDING"
  | "CONTINUATION"
  | "RECLAIM"
  | "REJECTION"
  | "STRONG_FOLLOW_THROUGH"
  | "WEAK_FOLLOW_THROUGH"
  | "N/A";

export type SweepRisk = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface LiquiditySweepEngineOutput {
  status: SweepStatus;
  direction: SweepDirection;
  type: SweepType | "";  // "" when IDLE (no setup)
  confidence: number;
  risk: SweepRisk;
  trigger: string;
  target: string;
  invalidation: string;
  sweptZone: string;
  executionStats: {
    zoneSizeBTC?: number;
    aggressionScore?: number;
    displacementPct?: number;
    followThroughPct?: number;
  };
  confluence: {
    score: number;
    factors: string[];
  };
  outcome: SweepOutcome;
  summary: string[];
  // Legacy-compat (for overlays)
  sweepRisk: SweepRisk;
  sweepDirection: SweepDirection;
  sweepTrigger: string;
  sweepTargetZone: string;
  sweepSummary: string[];
}

export interface SweepEnginePreviousState {
  spot: number;
  timestamp: number;
  direction: SweepDirection;
  zoneMid: number;
  zoneSide: "BID" | "ASK";
  status: SweepStatus;
}

export interface LiquiditySweepEngineInput {
  spot: number;
  heatZones: Array<{ priceStart: number; priceEnd: number; side: string; intensity: number; totalQuantity: number }>;
  liquidityPressure: "BID_HEAVY" | "ASK_HEAVY" | "BALANCED";
  heatmapSummary?: {
    totalBidLiquidity: number;
    totalAskLiquidity: number;
    strongestBidZone: number | null;
    strongestAskZone: number | null;
    nearestVoid: number | null;
    voidSide: string | null;
    bidAskRatio: number;
  };
  vacuum?: { vacuumRisk?: string; nearestThinLiquidityZone?: number | null; nearestThinLiquidityDirection?: string | null };
  dealerPivot: number;
  callWall: number;
  putWall: number;
  marketMode?: string;
  marketModeConfidence?: number;
  dealerFlowDirection?: string;
  dealerFlowStrength?: string;
  dealerFlowAccel?: string;
  cascadeRisk?: string;
  cascadeDirection?: string;
  squeezeProbability?: number;
  squeezeDirection?: string;
  gammaRegimeBand?: string;
  institutionalBias?: string;
  tradeDirection?: string;
}

const NEAR_RANGE_PCT = 0.018;
const CROSS_BUFFER_PCT = 0.0003;   // min move past zone to count as cross (avoid wicks)
const RECENT_MS = 60000;           // cross valid for 60s
const IN_PROGRESS_AGE_MS = 120000; // exhaustion check window
const fmtK = (p: number) => (p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p)));

let previousSweepState: SweepEnginePreviousState | null = null;

function preSweepContext(
  spot: number,
  heatZones: LiquiditySweepEngineInput["heatZones"]
): {
  bidZonesNear: typeof heatZones;
  askZonesNear: typeof heatZones;
  bidIntensity: number;
  askIntensity: number;
  bidConcentration: number;
  askConcentration: number;
  totalBid: number;
  totalAsk: number;
  hasBidNear: boolean;
  hasAskNear: boolean;
} {
  const nearRange = spot * NEAR_RANGE_PCT;
  const bidZonesNear = heatZones.filter(
    (z) => z.side === "BID" && spot - (z.priceStart + z.priceEnd) / 2 <= nearRange && spot > (z.priceStart + z.priceEnd) / 2
  );
  const askZonesNear = heatZones.filter(
    (z) => z.side === "ASK" && (z.priceStart + z.priceEnd) / 2 - spot <= nearRange && spot < (z.priceStart + z.priceEnd) / 2
  );
  const bidIntensity = bidZonesNear.reduce((s, z) => s + z.intensity, 0);
  const askIntensity = askZonesNear.reduce((s, z) => s + z.intensity, 0);
  const totalBid = heatZones.filter((z) => z.side === "BID").reduce((s, z) => s + z.totalQuantity, 0);
  const totalAsk = heatZones.filter((z) => z.side === "ASK").reduce((s, z) => s + z.totalQuantity, 0);
  const bidConcentration = totalBid > 0 ? bidIntensity / totalBid : 0;
  const askConcentration = totalAsk > 0 ? askIntensity / totalAsk : 0;
  return {
    bidZonesNear,
    askZonesNear,
    bidIntensity,
    askIntensity,
    bidConcentration,
    askConcentration,
    totalBid,
    totalAsk,
    hasBidNear: bidZonesNear.length > 0,
    hasAskNear: askZonesNear.length > 0,
  };
}

function confluenceScore(input: LiquiditySweepEngineInput, direction: SweepDirection): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  const up = direction === "UP";
  const down = direction === "DOWN";

  if (input.dealerFlowDirection === "BUYING" && (up || direction === "TWO_SIDED")) {
    score += 15;
    factors.push("Dealer flow buying");
  }
  if (input.dealerFlowDirection === "SELLING" && (down || direction === "TWO_SIDED")) {
    score += 15;
    factors.push("Dealer flow selling");
  }
  if ((input.cascadeRisk === "HIGH" || input.cascadeRisk === "EXTREME") && (input.cascadeDirection === "UP" && up || input.cascadeDirection === "DOWN" && down)) {
    score += 20;
    factors.push("Cascade alignment");
  }
  if ((input.squeezeProbability ?? 0) > 40 && ((input.squeezeDirection === "UP" && up) || (input.squeezeDirection === "DOWN" && down))) {
    score += 15;
    factors.push(`Squeeze prob ${input.squeezeProbability}%`);
  }
  if (input.liquidityPressure === "ASK_HEAVY" && up) {
    score += 10;
    factors.push("Ask-heavy book");
  }
  if (input.liquidityPressure === "BID_HEAVY" && down) {
    score += 10;
    factors.push("Bid-heavy book");
  }
  if (input.gammaRegimeBand === "LONG_GAMMA_SUPPORT" || input.gammaRegimeBand === "DEEP_LONG_GAMMA") {
    score -= 10;
    factors.push("Long gamma dampens");
  }
  if (input.institutionalBias === "BULLISH_ACCUMULATION" && up) {
    score += 10;
    factors.push("Institutional bias up");
  }
  if (input.institutionalBias === "BEARISH_DISTRIBUTION" && down) {
    score += 10;
    factors.push("Institutional bias down");
  }
  if (input.tradeDirection === "LONG" && up) score += 5;
  if (input.tradeDirection === "SHORT" && down) score += 5;

  return { score: Math.min(100, Math.max(0, score)), factors };
}

function classifyAndOutcome(
  input: LiquiditySweepEngineInput,
  direction: SweepDirection,
  ctx: ReturnType<typeof preSweepContext>,
  prev: SweepEnginePreviousState | null
): { type: SweepType; outcome: SweepOutcome; status: SweepStatus } {
  const spot = input.spot;
  if (!prev || direction === "NONE") {
    if (direction === "TWO_SIDED" && ctx.hasBidNear && ctx.hasAskNear) return { type: "SETUP_TWO_SIDED", outcome: "N/A", status: "SETUP" };
    if (direction === "UP") return { type: "SETUP_UP", outcome: "PENDING", status: "SETUP" };
    if (direction === "DOWN") return { type: "SETUP_DOWN", outcome: "PENDING", status: "SETUP" };
    return { type: "SETUP_UP", outcome: "N/A", status: "IDLE" };
  }

  const zoneMid = prev.zoneMid;
  const aboveThreshold = zoneMid * (1 + CROSS_BUFFER_PCT);
  const belowThreshold = zoneMid * (1 - CROSS_BUFFER_PCT);
  const crossedAbove = prev.zoneSide === "ASK" && spot > aboveThreshold && prev.spot <= zoneMid;
  const crossedBelow = prev.zoneSide === "BID" && spot < belowThreshold && prev.spot >= zoneMid;
  const ageMs = Date.now() - prev.timestamp;
  const recent = ageMs < RECENT_MS;

  if (crossedAbove && recent) {
    const holdAbove = spot > zoneMid * 1.002;
    const reclaim = spot < zoneMid * 0.998;
    if (reclaim) return { type: "FAILED", outcome: "RECLAIM", status: "RESOLVED" };
    if (holdAbove && spot > prev.spot * 1.003) return { type: "CONTINUATION", outcome: "STRONG_FOLLOW_THROUGH", status: "IN_PROGRESS" };
    if (holdAbove) return { type: "ABSORPTION", outcome: "WEAK_FOLLOW_THROUGH", status: "IN_PROGRESS" };
  }
  if (crossedBelow && recent) {
    const holdBelow = spot < zoneMid * 0.998;
    const reclaim = spot > zoneMid * 1.002;
    if (reclaim) return { type: "FAILED", outcome: "RECLAIM", status: "RESOLVED" };
    if (holdBelow && spot < prev.spot * 0.997) return { type: "CONTINUATION", outcome: "STRONG_FOLLOW_THROUGH", status: "IN_PROGRESS" };
    if (holdBelow) return { type: "ABSORPTION", outcome: "WEAK_FOLLOW_THROUGH", status: "IN_PROGRESS" };
  }

  if (prev.status === "IN_PROGRESS" && ageMs < IN_PROGRESS_AGE_MS) {
    if (prev.zoneSide === "ASK" && spot < zoneMid * 0.995) return { type: "EXHAUSTION", outcome: "REJECTION", status: "RESOLVED" };
    if (prev.zoneSide === "BID" && spot > zoneMid * 1.005) return { type: "EXHAUSTION", outcome: "REJECTION", status: "RESOLVED" };
  }

  if (direction === "TWO_SIDED") return { type: "SETUP_TWO_SIDED", outcome: "PENDING", status: "SETUP" };
  if (direction === "UP") return { type: "SETUP_UP", outcome: "PENDING", status: "SETUP" };
  if (direction === "DOWN") return { type: "SETUP_DOWN", outcome: "PENDING", status: "SETUP" };
  return { type: "SETUP_UP", outcome: "N/A", status: "IDLE" };
}

export function runLiquiditySweepEngine(
  input: LiquiditySweepEngineInput,
  prevState?: SweepEnginePreviousState | null
): { output: LiquiditySweepEngineOutput; nextState: SweepEnginePreviousState | null } {
  const prev = prevState ?? previousSweepState;
  const ctx = preSweepContext(input.spot, input.heatZones);

  let riskScore = 0;
  if (ctx.hasBidNear || ctx.hasAskNear) riskScore += 1;
  if (ctx.bidIntensity > 0.5 || ctx.askIntensity > 0.5) riskScore += 1;
  if (input.cascadeRisk === "HIGH" || input.cascadeRisk === "EXTREME") riskScore += 2;
  else if (input.cascadeRisk === "MEDIUM") riskScore += 1;
  if ((input.squeezeProbability ?? 0) > 50) riskScore += 2;
  else if ((input.squeezeProbability ?? 0) > 25) riskScore += 1;
  if (input.dealerFlowAccel === "HIGH") riskScore += 2;
  else if (input.dealerFlowAccel === "MEDIUM") riskScore += 1;
  if (["VOL_EXPANSION", "CASCADE_RISK", "SQUEEZE_RISK"].includes(input.marketMode || "")) riskScore += 1;
  if (input.dealerFlowStrength === "EXTREME" || input.dealerFlowStrength === "HIGH") riskScore += 1;
  const isLongGamma = ["DEEP_LONG_GAMMA", "LONG_GAMMA_SUPPORT"].includes(input.gammaRegimeBand || "");
  if (isLongGamma && input.marketMode === "GAMMA_PIN") riskScore = Math.max(0, riskScore - 2);

  const risk: SweepRisk = riskScore >= 9 ? "EXTREME" : riskScore >= 6 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW";

  let direction: SweepDirection = "NONE";
  if (risk !== "LOW") {
    let upScore = 0, downScore = 0;
    if (ctx.hasAskNear) upScore += 1;
    if (ctx.hasBidNear) downScore += 1;
    if (input.dealerFlowDirection === "BUYING") upScore += 1;
    if (input.dealerFlowDirection === "SELLING") downScore += 1;
    if (input.tradeDirection === "LONG") upScore += 1;
    if (input.tradeDirection === "SHORT") downScore += 1;
    if (input.squeezeDirection === "UP") upScore += 1;
    if (input.squeezeDirection === "DOWN") downScore += 1;
    if (["UP", "UPSIDE"].includes(input.cascadeDirection || "")) upScore += 1;
    if (["DOWN", "DOWNSIDE"].includes(input.cascadeDirection || "")) downScore += 1;
    if (input.liquidityPressure === "ASK_HEAVY") upScore += 1;
    if (input.liquidityPressure === "BID_HEAVY") downScore += 1;

    if (upScore >= 3 && upScore > downScore + 1) direction = "UP";
    else if (downScore >= 3 && downScore > upScore + 1) direction = "DOWN";
    else if (upScore >= 2 && downScore >= 2) direction = "TWO_SIDED";
    else if (upScore > downScore) direction = "UP";
    else if (downScore > upScore) direction = "DOWN";
    else direction = "TWO_SIDED";
  }

  const confluence = confluenceScore(input, direction);
  const { type, outcome, status } = classifyAndOutcome(input, direction, ctx, prev);

  let trigger = "--";
  let target = "--";
  let invalidation = "--";
  let sweptZone = "--";
  let zoneMid = 0;
  let zoneSide: "BID" | "ASK" = "BID";

  if (direction === "UP" && ctx.askZonesNear.length > 0) {
    const sorted = [...ctx.askZonesNear].sort((a, b) => b.intensity - a.intensity);
    const z = sorted[0];
    zoneMid = (z.priceStart + z.priceEnd) / 2;
    zoneSide = "ASK";
    trigger = `Break above ${fmtK(zoneMid)} (ask liquidity)`;
    target = `${fmtK(z.priceStart)} – ${fmtK(z.priceEnd)}`;
    invalidation = `Rejection back below ${fmtK(zoneMid * 0.998)}`;
    sweptZone = input.spot >= zoneMid ? target : "--";
  } else if (direction === "DOWN" && ctx.bidZonesNear.length > 0) {
    const sorted = [...ctx.bidZonesNear].sort((a, b) => b.intensity - a.intensity);
    const z = sorted[0];
    zoneMid = (z.priceStart + z.priceEnd) / 2;
    zoneSide = "BID";
    trigger = `Loss of ${fmtK(zoneMid)} (bid support)`;
    target = `${fmtK(z.priceStart)} – ${fmtK(z.priceEnd)}`;
    invalidation = `Reclaim above ${fmtK(zoneMid * 1.002)}`;
    sweptZone = input.spot <= zoneMid ? target : "--";
  } else if (direction === "UP") {
    zoneMid = input.callWall || input.spot * 1.01;
    trigger = `Break above ${fmtK(zoneMid)}`;
    target = `${fmtK(input.spot)} – ${fmtK(input.spot * 1.015)}`;
    invalidation = `Hold below ${fmtK(zoneMid)}`;
  } else if (direction === "DOWN") {
    zoneMid = input.putWall || input.spot * 0.99;
    trigger = `Break below ${fmtK(zoneMid)}`;
    target = `${fmtK(input.spot * 0.985)} – ${fmtK(input.spot)}`;
    invalidation = `Hold above ${fmtK(zoneMid)}`;
  } else if (direction === "TWO_SIDED") {
    trigger = "Directional break of stacked liquidity";
    target = `${fmtK(input.spot * 0.985)} – ${fmtK(input.spot * 1.015)}`;
    invalidation = "No clean break either way";
  }

  const baseConfidence = Math.min(100, riskScore * 8 + confluence.score * 0.5);
  const typeBoost = ["CONTINUATION", "EXHAUSTION", "FAILED", "ABSORPTION", "TRAP"].includes(type) ? 15 : 0;
  let confidence = Math.min(100, Math.round(baseConfidence + typeBoost));
  if (status === "IDLE") confidence = Math.min(confidence, 50);
  else if (status === "SETUP") {
    confidence = Math.min(confidence, 55);
    if (direction === "UP" && !ctx.hasAskNear) confidence = Math.min(confidence, 45);
    if (direction === "DOWN" && !ctx.hasBidNear) confidence = Math.min(confidence, 45);
  }

  const summary: string[] = [];
  if (status === "IDLE") {
    summary.push("No sweep setup; low liquidity risk or balanced context");
  } else {
    if (ctx.hasAskNear) summary.push("Ask liquidity stacked above spot");
    if (ctx.hasBidNear) summary.push("Bid liquidity visible below spot");
    if (confluence.factors.length) summary.push(...confluence.factors.slice(0, 2));
    const isEventType = ["CONTINUATION", "EXHAUSTION", "FAILED", "ABSORPTION", "TWO_SIDED", "TRAP"].includes(type);
    if (isEventType) summary.push(`Type: ${type} | Outcome: ${outcome}`);
    if (status === "SETUP" && direction !== "NONE") {
      summary.push(direction === "UP" ? "Sweep likely if price breaks above trigger" : direction === "DOWN" ? "Sweep likely if price loses support" : "Monitor for directional break");
    }
    if (summary.length < 3) summary.push("Awaiting catalyst or clear break");
  }
  if (summary.length > 6) summary.length = 6;

  const zoneSizeBTC = direction === "UP" && ctx.askZonesNear[0]
    ? ctx.askZonesNear.sort((a, b) => b.intensity - a.intensity)[0].totalQuantity
    : direction === "DOWN" && ctx.bidZonesNear[0]
    ? ctx.bidZonesNear.sort((a, b) => b.intensity - a.intensity)[0].totalQuantity
    : undefined;

  const nextState: SweepEnginePreviousState | null =
    direction === "NONE"
      ? null
      : direction === "TWO_SIDED"
        ? prev
        : {
            spot: input.spot,
            timestamp: Date.now(),
            direction,
            zoneMid: zoneMid || input.spot,
            zoneSide,
            status,
          };

  const output: LiquiditySweepEngineOutput = {
    status,
    direction,
    type: status === "IDLE" ? "" : type,
    confidence,
    risk,
    trigger,
    target,
    invalidation,
    sweptZone,
    executionStats: {
      zoneSizeBTC,
      aggressionScore: riskScore >= 6 ? 70 + riskScore * 3 : riskScore * 10,
      displacementPct: prev ? Math.abs((input.spot - prev.spot) / prev.spot) * 100 : undefined,
      followThroughPct: outcome === "STRONG_FOLLOW_THROUGH" ? (direction === "UP" ? 0.3 : -0.3) : undefined,
    },
    confluence: { score: confluence.score, factors: confluence.factors },
    outcome,
    summary,
    sweepRisk: risk,
    sweepDirection: direction,
    sweepTrigger: trigger,
    sweepTargetZone: target,
    sweepSummary: summary,
  };

  previousSweepState = nextState ?? prev ?? null;
  return { output, nextState: previousSweepState };
}

export function getSweepEnginePreviousState(): SweepEnginePreviousState | null {
  return previousSweepState;
}

export function setSweepEnginePreviousState(s: SweepEnginePreviousState | null): void {
  previousSweepState = s;
}
