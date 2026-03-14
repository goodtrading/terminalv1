/**
 * Institutional Absorption Engine
 * Detects real absorption behavior: aggressive flow hits resting liquidity
 * but price fails to continue (sell absorption = buy flow absorbed at asks;
 * buy absorption = sell flow absorbed at bids).
 * Uses orderbook, heatmap zones, sweep detector, and structural confluence.
 */

export type AbsorptionStatus = "INACTIVE" | "SETUP" | "ACTIVE" | "CONFIRMED";
export type AbsorptionSide = "BUY_ABSORPTION" | "SELL_ABSORPTION" | "NONE";

export interface AbsorptionSignal {
  status: AbsorptionStatus;
  side: AbsorptionSide;
  confidence: number;
  intensity: number;
  zoneLow: number | null;
  zoneHigh: number | null;
  referencePrice: number | null;
  executedVolume: number;
  restingLiquidity: number;
  persistenceScore: number;
  rejectionScore: number;
  confluenceScore: number;
  trigger: string;
  invalidation: string;
  summary: string[];
  // Pre-trigger / candidate context (forward-looking)
  candidateSide?: AbsorptionSide;
  candidateZoneLow?: number | null;
  candidateZoneHigh?: number | null;
  candidateReferencePrice?: number | null;
  distanceToCandidatePct?: number | null;
  testReadiness?: number;
  preAbsorptionState?: "NONE" | "CANDIDATE" | "APPROACHING" | "UNDER_TEST";
  candidateReason?: string;
  candidateSummary?: string[];
}

export interface AbsorptionDebug {
  testedZones: Array<{ side: "BID" | "ASK"; low: number; high: number; restingQty: number; executionPressure: number }>;
  executionAtZone: number;
  liquidityBeforeAfter: { restingNow: number; inferredDepletion: number } | null;
  priceReactionMetrics: { outcome: string; followThroughPct: number | null };
  matchedConfluences: string[];
}

const DEFAULT_ABSORPTION_SIGNAL: AbsorptionSignal = {
  status: "INACTIVE",
  side: "NONE",
  confidence: 0,
  intensity: 0,
  zoneLow: null,
  zoneHigh: null,
  referencePrice: null,
  executedVolume: 0,
  restingLiquidity: 0,
  persistenceScore: 0,
  rejectionScore: 0,
  confluenceScore: 0,
  trigger: "No valid absorption setup",
  invalidation: "N/A",
  summary: ["No absorption setup detected"],
  candidateSide: "NONE",
  candidateZoneLow: null,
  candidateZoneHigh: null,
  candidateReferencePrice: null,
  distanceToCandidatePct: null,
  testReadiness: 0,
  preAbsorptionState: "NONE",
  candidateReason: "",
  candidateSummary: [],
};

/** Build a safe INACTIVE signal for fallback when engine is not run or fails. */
export function buildInactiveAbsorptionSignal(reason?: string): AbsorptionSignal {
  return {
    ...DEFAULT_ABSORPTION_SIGNAL,
    trigger: reason ?? DEFAULT_ABSORPTION_SIGNAL.trigger,
    summary: reason ? [reason] : [...DEFAULT_ABSORPTION_SIGNAL.summary],
  };
}

/** Ensure all required keys exist with safe defaults; prevent frontend null/missing-field issues. */
export function normalizeAbsorptionSignal(input: Partial<AbsorptionSignal> | AbsorptionSignal | null | undefined): AbsorptionSignal {
  if (input == null || typeof input !== "object") {
    return buildInactiveAbsorptionSignal("Absorption engine returned no result");
  }
  const status = (input.status as AbsorptionStatus) ?? "INACTIVE";
  const side = (input.side as AbsorptionSide) ?? "NONE";
  return {
    status,
    side,
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    intensity: typeof input.intensity === "number" ? input.intensity : 0,
    zoneLow: input.zoneLow != null && typeof input.zoneLow === "number" ? input.zoneLow : null,
    zoneHigh: input.zoneHigh != null && typeof input.zoneHigh === "number" ? input.zoneHigh : null,
    referencePrice: input.referencePrice != null && typeof input.referencePrice === "number" ? input.referencePrice : null,
    executedVolume: typeof input.executedVolume === "number" ? input.executedVolume : 0,
    restingLiquidity: typeof input.restingLiquidity === "number" ? input.restingLiquidity : 0,
    persistenceScore: typeof input.persistenceScore === "number" ? input.persistenceScore : 0,
    rejectionScore: typeof input.rejectionScore === "number" ? input.rejectionScore : 0,
    confluenceScore: typeof input.confluenceScore === "number" ? input.confluenceScore : 0,
    trigger: typeof input.trigger === "string" ? input.trigger : "No valid absorption setup",
    invalidation: typeof input.invalidation === "string" ? input.invalidation : "N/A",
    summary: Array.isArray(input.summary) ? input.summary : [],
    candidateSide: (input.candidateSide as AbsorptionSide) ?? "NONE",
    candidateZoneLow:
      input.candidateZoneLow != null && typeof input.candidateZoneLow === "number"
        ? input.candidateZoneLow
        : null,
    candidateZoneHigh:
      input.candidateZoneHigh != null && typeof input.candidateZoneHigh === "number"
        ? input.candidateZoneHigh
        : null,
    candidateReferencePrice:
      input.candidateReferencePrice != null && typeof input.candidateReferencePrice === "number"
        ? input.candidateReferencePrice
        : null,
    distanceToCandidatePct:
      input.distanceToCandidatePct != null && typeof input.distanceToCandidatePct === "number"
        ? input.distanceToCandidatePct
        : null,
    testReadiness: typeof input.testReadiness === "number" ? input.testReadiness : 0,
    preAbsorptionState:
      (input.preAbsorptionState as
        | "NONE"
        | "CANDIDATE"
        | "APPROACHING"
        | "UNDER_TEST") ?? "NONE",
    candidateReason: typeof input.candidateReason === "string" ? input.candidateReason : "",
    candidateSummary: Array.isArray(input.candidateSummary) ? input.candidateSummary : [],
  };
}

const BAND_PCT = 0.012;
const NEAR_RANGE_PCT = 0.02;
// Pre-absorption / candidate thresholds (expressed as spot * pct distances)
const PRE_CANDIDATE_DIST_PCT = 0.012; // 1.2%
const PRE_APPROACH_DIST_PCT = 0.004; // 0.4%

const CONFIDENCE_INACTIVE = 35;
const CONFIDENCE_SETUP = 55;
const CONFIDENCE_ACTIVE = 75;

const WEIGHT_EXECUTION = 0.25;
const WEIGHT_PERSISTENCE = 0.3;
const WEIGHT_REJECTION = 0.25;
const WEIGHT_CONFLUENCE = 0.2;

export interface AbsorptionEngineInput {
  spotPrice: number;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  heatZones: Array<{ priceStart: number; priceEnd: number; side: string; intensity: number; totalQuantity: number }>;
  sweepDetector: {
    status?: string;
    direction?: string;
    type?: string;
    outcome?: string;
    confidence?: number;
    executionStats?: { zoneSizeBTC?: number; aggressionScore?: number; followThroughPct?: number };
    trigger?: string;
    invalidation?: string;
    summary?: string[];
  } | null;
  callWall: number | null;
  putWall: number | null;
  gammaMagnets: number[];
  gammaFlip: number | null;
  accelZones: Array<{ start: number; end: number; direction: string }>;
}

function aggregateInBand(
  levels: Array<{ price: number; size: number }>,
  low: number,
  high: number
): number {
  return levels
    .filter((l) => l.price >= low && l.price <= high)
    .reduce((s, l) => s + l.size, 0);
}

function buildZones(
  spot: number,
  heatZones: AbsorptionEngineInput["heatZones"],
  bandPct: number
): { side: "ASK"; low: number; high: number; qty: number; mid: number }[] {
  const range = spot * bandPct;
  const zones: { side: "ASK"; low: number; high: number; qty: number; mid: number }[] = [];
  const askZones = (heatZones || []).filter(
    (z) => z.side === "ASK" && (z.priceStart + z.priceEnd) / 2 > spot && (z.priceStart + z.priceEnd) / 2 - spot <= spot * NEAR_RANGE_PCT
  );
  for (const z of askZones) {
    const mid = (z.priceStart + z.priceEnd) / 2;
    const low = z.priceStart;
    const high = z.priceEnd;
    zones.push({ side: "ASK", low, high, qty: z.totalQuantity ?? 0, mid });
  }
  return zones;
}

function buildBidZones(
  spot: number,
  heatZones: AbsorptionEngineInput["heatZones"],
  bandPct: number
): { side: "BID"; low: number; high: number; qty: number; mid: number }[] {
  const zones: { side: "BID"; low: number; high: number; qty: number; mid: number }[] = [];
  const bidZones = (heatZones || []).filter(
    (z) => z.side === "BID" && spot - (z.priceStart + z.priceEnd) / 2 <= spot * NEAR_RANGE_PCT && (z.priceStart + z.priceEnd) / 2 < spot
  );
  for (const z of bidZones) {
    const mid = (z.priceStart + z.priceEnd) / 2;
    zones.push({ side: "BID", low: z.priceStart, high: z.priceEnd, qty: z.totalQuantity ?? 0, mid });
  }
  return zones;
}

function confluenceAtZone(
  zoneLow: number,
  zoneHigh: number,
  mid: number,
  input: AbsorptionEngineInput
): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  const tol = (zoneHigh - zoneLow) * 0.5;

  if (input.callWall != null && Math.abs(mid - input.callWall) <= tol) {
    score += 25;
    factors.push("Call wall");
  }
  if (input.putWall != null && Math.abs(mid - input.putWall) <= tol) {
    score += 25;
    factors.push("Put wall");
  }
  if (input.gammaFlip != null && Math.abs(mid - input.gammaFlip) <= tol) {
    score += 20;
    factors.push("Gamma flip");
  }
  if ((input.gammaMagnets || []).some((m) => Math.abs(mid - m) <= tol)) {
    score += 15;
    factors.push("Gamma magnet");
  }
  if ((input.accelZones || []).some((a) => mid >= a.start && mid <= a.end)) {
    score += 15;
    factors.push("Accel zone");
  }

  const strongAsk = (input.heatZones || [])
    .filter((z) => z.side === "ASK")
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0];
  const strongBid = (input.heatZones || [])
    .filter((z) => z.side === "BID")
    .sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0))[0];
  if (strongAsk && mid >= strongAsk.priceStart && mid <= strongAsk.priceEnd) {
    score += 10;
    factors.push("Strong ask zone");
  }
  if (strongBid && mid >= strongBid.priceStart && mid <= strongBid.priceEnd) {
    score += 10;
    factors.push("Strong bid zone");
  }

  return { score: Math.min(100, score), factors };
}

type PreAbsorptionState = "NONE" | "CANDIDATE" | "APPROACHING" | "UNDER_TEST";

interface CandidateZoneInfo {
  candidateSide: AbsorptionSide;
  candidateZoneLow: number | null;
  candidateZoneHigh: number | null;
  candidateReferencePrice: number | null;
  distanceToCandidatePct: number | null;
  testReadiness: number;
  preAbsorptionState: PreAbsorptionState;
  candidateReason: string;
  candidateSummary: string[];
}

function pickCandidateZone(
  spot: number,
  askZones: { side: "ASK"; low: number; high: number; qty: number; mid: number }[],
  bidZones: { side: "BID"; low: number; high: number; qty: number; mid: number }[],
  input: AbsorptionEngineInput
): CandidateZoneInfo {
  if (!spot || spot <= 0) {
    return {
      candidateSide: "NONE",
      candidateZoneLow: null,
      candidateZoneHigh: null,
      candidateReferencePrice: null,
      distanceToCandidatePct: null,
      testReadiness: 0,
      preAbsorptionState: "NONE",
      candidateReason: "",
      candidateSummary: [],
    };
  }

  const normDistance = (mid: number) => Math.abs(mid - spot) / spot; // fraction of spot

  const scoreZone = (zone: { low: number; high: number; qty: number; mid: number; side: "ASK" | "BID" }) => {
    const dist = normDistance(zone.mid);
    const distScore = Math.max(0, 100 - (dist * 100) * 3); // penalize distance
    const liqScore = Math.min(100, Math.log10(Math.max(zone.qty, 1)) * 25); // 0-100-ish
    const conf = confluenceAtZone(zone.low, zone.high, zone.mid, input);
    const confScore = conf.score; // already 0-100

    // crude directional pressure proxy: use sweep direction when aligned with zone side
    const sweepDir = input.sweepDetector?.direction ?? "NONE";
    let dirScore = 0;
    if (zone.side === "ASK" && sweepDir === "UP") dirScore = 70;
    if (zone.side === "BID" && sweepDir === "DOWN") dirScore = 70;

    // simple probing flag: if spot has already tagged the band
    const probed =
      (spot >= zone.low && spot <= zone.high) ||
      (zone.side === "ASK" && spot > zone.low && spot < zone.high * 1.01) ||
      (zone.side === "BID" && spot < zone.high && spot > zone.low * 0.99);
    const probeScore = probed ? 80 : 20;

    const readiness =
      distScore * 0.3 + liqScore * 0.2 + confScore * 0.2 + dirScore * 0.15 + probeScore * 0.15;

    return {
      dist,
      distScore,
      liqScore,
      conf,
      dirScore,
      probeScore,
      readiness: Math.max(0, Math.min(100, Math.round(readiness))),
    };
  };

  const scoredAsk = askZones.map((z) => ({ z, s: scoreZone(z) }));
  const scoredBid = bidZones.map((z) => ({ z, s: scoreZone(z) }));

  const bestAsk = scoredAsk.sort((a, b) => b.s.readiness - a.s.readiness || a.s.dist - b.s.dist)[0];
  const bestBid = scoredBid.sort((a, b) => b.s.readiness - a.s.readiness || a.s.dist - b.s.dist)[0];

  const candidates: { side: AbsorptionSide; z: any; s: ReturnType<typeof scoreZone> }[] = [];
  if (bestAsk) candidates.push({ side: "SELL_ABSORPTION", z: bestAsk.z, s: bestAsk.s });
  if (bestBid) candidates.push({ side: "BUY_ABSORPTION", z: bestBid.z, s: bestBid.s });

  if (!candidates.length) {
    return {
      candidateSide: "NONE",
      candidateZoneLow: null,
      candidateZoneHigh: null,
      candidateReferencePrice: spot,
      distanceToCandidatePct: null,
      testReadiness: 0,
      preAbsorptionState: "NONE",
      candidateReason: "",
      candidateSummary: [],
    };
  }

  const chosen = candidates.sort(
    (a, b) => b.s.readiness - a.s.readiness || a.s.dist - b.s.dist
  )[0];
  const zone = chosen.z as { low: number; high: number; mid: number; qty: number; side: "ASK" | "BID" };
  const score = chosen.s;
  const distPct = score.dist * 100;

  let preState: PreAbsorptionState = "CANDIDATE";
  if (score.dist > PRE_CANDIDATE_DIST_PCT) {
    preState = "CANDIDATE";
  } else if (score.dist > PRE_APPROACH_DIST_PCT) {
    preState = "APPROACHING";
  } else {
    preState = "UNDER_TEST";
  }

  let reason = "";
  const bullets: string[] = [];
  const sideLabel = chosen.side === "SELL_ABSORPTION" ? "ask" : "bid";

  if (zone.qty > 0) {
    reason = `Stacked ${sideLabel} liquidity near ${Math.round(zone.mid)}`;
  }
  if (score.conf.factors.includes("Call wall") || score.conf.factors.includes("Put wall")) {
    bullets.push("Aligns with options wall");
  }
  if (score.conf.factors.includes("Gamma flip") || score.conf.factors.includes("Gamma magnet")) {
    bullets.push("Gamma structure confluence");
  }
  if (score.conf.factors.includes("Accel zone")) {
    bullets.push("Within acceleration zone");
  }
  if (!bullets.length) {
    bullets.push("Local liquidity is the nearest meaningful defense");
  }

  if (!reason) {
    reason =
      chosen.side === "SELL_ABSORPTION"
        ? "Nearest ask-side defense above spot"
        : "Nearest bid-side defense below spot";
  }

  if (preState === "APPROACHING") {
    bullets.unshift("Price is approaching the candidate zone");
  } else if (preState === "UNDER_TEST") {
    bullets.unshift("Price is currently testing the candidate zone");
  }

  return {
    candidateSide: chosen.side,
    candidateZoneLow: zone.low,
    candidateZoneHigh: zone.high,
    candidateReferencePrice: spot,
    distanceToCandidatePct: Math.round(distPct * 100) / 100,
    testReadiness: score.readiness,
    preAbsorptionState: preState,
    candidateReason: reason,
    candidateSummary: bullets.slice(0, 4),
  };
}

export function runAbsorptionEngine(input: AbsorptionEngineInput): {
  signal: AbsorptionSignal;
  debug: AbsorptionDebug;
} {
  const defaultSignal: AbsorptionSignal = {
    status: "INACTIVE",
    side: "NONE",
    confidence: 0,
    intensity: 0,
    zoneLow: null,
    zoneHigh: null,
    referencePrice: input.spotPrice,
    executedVolume: 0,
    restingLiquidity: 0,
    persistenceScore: 0,
    rejectionScore: 0,
    confluenceScore: 0,
    trigger: "No absorption setup",
    invalidation: "N/A",
    summary: ["Insufficient data or no absorption detected"],
  };

  const defaultDebug: AbsorptionDebug = {
    testedZones: [],
    executionAtZone: 0,
    liquidityBeforeAfter: null,
    priceReactionMetrics: { outcome: "N/A", followThroughPct: null },
    matchedConfluences: [],
  };

  const spot = input.spotPrice;
  if (!spot || spot <= 0) {
    return { signal: defaultSignal, debug: defaultDebug };
  }
  const sweep = input.sweepDetector;
  const bandPct = BAND_PCT;

  const askZones = buildZones(spot, input.heatZones || [], bandPct);
  const bidZones = buildBidZones(spot, input.heatZones || [], bandPct);

  const testedZones: AbsorptionDebug["testedZones"] = [];
  let bestSide: AbsorptionSide = "NONE";
  let bestZone: { low: number; high: number; mid: number; qty: number; side: "ASK" | "BID" } | null = null;
  let bestConfidence = 0;
  let bestExecutionScore = 0;
  let bestPersistenceScore = 0;
  let bestRejectionScore = 0;
  let bestConfluence = { score: 0, factors: [] as string[] };
  let bestResting = 0;
  let bestExecutedVolume = 0;

  const status = sweep?.status ?? "";
  const direction = sweep?.direction ?? "NONE";
  const type = sweep?.type ?? "";
  const outcome = sweep?.outcome ?? "";
  const executionStats = sweep?.executionStats ?? {};
  const zoneSizeBTC = executionStats.zoneSizeBTC ?? 0;
  const aggressionScore = Math.min(100, executionStats.aggressionScore ?? 0);
  const followThroughPct = executionStats.followThroughPct ?? null;

  const isAbsorptionType = type === "ABSORPTION" || type === "EXHAUSTION";
  const isRejectionOutcome = outcome === "REJECTION" || outcome === "WEAK_FOLLOW_THROUGH";

  for (const z of askZones) {
    const resting = aggregateInBand(input.asks, z.low, z.high) || z.qty;
    testedZones.push({
      side: "ASK",
      low: z.low,
      high: z.high,
      restingQty: resting,
      executionPressure: direction === "UP" ? aggressionScore : 0,
    });

    if (direction !== "UP") continue;

    const executionPressureScore = direction === "UP" ? Math.min(100, (aggressionScore / 100) * 100) : 0;
    const executedVolume = direction === "UP" ? zoneSizeBTC || resting * 0.3 : 0;
    const persistenceScore = resting > 0 ? Math.min(100, (resting / (resting + executedVolume || 1)) * 100) : 50;
    const rejectionScore = isRejectionOutcome ? (outcome === "REJECTION" ? 90 : 65) : isAbsorptionType ? 55 : 20;
    const conf = confluenceAtZone(z.low, z.high, z.mid, input);
    const rawConf = conf.score;

    const weighted =
      executionPressureScore * WEIGHT_EXECUTION +
      persistenceScore * WEIGHT_PERSISTENCE +
      rejectionScore * WEIGHT_REJECTION +
      rawConf * WEIGHT_CONFLUENCE;
    const confidence = Math.round(Math.min(100, weighted));

    if (confidence > bestConfidence && (direction === "UP" || confidence >= CONFIDENCE_SETUP)) {
      bestConfidence = confidence;
      bestSide = "SELL_ABSORPTION";
      bestZone = { low: z.low, high: z.high, mid: z.mid, qty: z.qty, side: "ASK" };
      bestExecutionScore = executionPressureScore;
      bestPersistenceScore = persistenceScore;
      bestRejectionScore = rejectionScore;
      bestConfluence = conf;
      bestResting = resting;
      bestExecutedVolume = executedVolume;
    }
  }

  for (const z of bidZones) {
    const resting = aggregateInBand(input.bids, z.low, z.high) || z.qty;
    testedZones.push({
      side: "BID",
      low: z.low,
      high: z.high,
      restingQty: resting,
      executionPressure: direction === "DOWN" ? aggressionScore : 0,
    });

    if (direction !== "DOWN") continue;

    const executionPressureScore = direction === "DOWN" ? Math.min(100, (aggressionScore / 100) * 100) : 0;
    const executedVolume = direction === "DOWN" ? zoneSizeBTC || resting * 0.3 : 0;
    const persistenceScore = resting > 0 ? Math.min(100, (resting / (resting + executedVolume || 1)) * 100) : 50;
    const rejectionScore = isRejectionOutcome ? (outcome === "REJECTION" ? 90 : 65) : isAbsorptionType ? 55 : 20;
    const conf = confluenceAtZone(z.low, z.high, z.mid, input);

    const weighted =
      executionPressureScore * WEIGHT_EXECUTION +
      persistenceScore * WEIGHT_PERSISTENCE +
      rejectionScore * WEIGHT_REJECTION +
      conf.score * WEIGHT_CONFLUENCE;
    const confidence = Math.round(Math.min(100, weighted));

    if (confidence > bestConfidence && (direction === "DOWN" || confidence >= CONFIDENCE_SETUP)) {
      bestConfidence = confidence;
      bestSide = "BUY_ABSORPTION";
      bestZone = { low: z.low, high: z.high, mid: z.mid, qty: z.qty, side: "BID" };
      bestExecutionScore = executionPressureScore;
      bestPersistenceScore = persistenceScore;
      bestRejectionScore = rejectionScore;
      bestConfluence = conf;
      bestResting = resting;
      bestExecutedVolume = executedVolume;
    }
  }

  const candidate = pickCandidateZone(spot, askZones, bidZones, input);

  if (bestSide === "NONE" || bestZone === null) {
    const summary = [];
    if (askZones.length === 0 && bidZones.length === 0) summary.push("No liquidity zones near spot");
    else if (direction === "NONE") summary.push("No directional sweep; absorption requires flow into a level");
    else summary.push("Insufficient execution or rejection evidence");
    return {
      signal: {
        ...defaultSignal,
        ...candidate,
        summary,
      },
      debug: { ...defaultDebug, testedZones },
    };
  }

  let statusOut: AbsorptionStatus = "INACTIVE";
  const confScore = Math.round(
    bestExecutionScore * WEIGHT_EXECUTION +
      bestPersistenceScore * WEIGHT_PERSISTENCE +
      bestRejectionScore * WEIGHT_REJECTION +
      bestConfluence.score * WEIGHT_CONFLUENCE
  );
  const confidence = Math.min(100, confScore);
  if (confidence < CONFIDENCE_INACTIVE) statusOut = "INACTIVE";
  else if (confidence <= CONFIDENCE_SETUP) statusOut = "SETUP";
  else if (confidence <= CONFIDENCE_ACTIVE) statusOut = "ACTIVE";
  else statusOut = "CONFIRMED";

  const intensity = Math.min(
    100,
    Math.round((bestExecutedVolume / (bestResting + bestExecutedVolume || 1)) * 100 + bestRejectionScore * 0.3)
  );

  const trigger =
    sweep?.trigger ??
    (bestSide === "SELL_ABSORPTION"
      ? `Buy flow into asks ${(bestZone.mid / 1000).toFixed(1)}k`
      : `Sell flow into bids ${(bestZone.mid / 1000).toFixed(1)}k`);
  const invalidation =
    sweep?.invalidation ??
    (bestSide === "SELL_ABSORPTION"
      ? `Clean break above ${(bestZone.high / 1000).toFixed(1)}k`
      : `Clean break below ${(bestZone.low / 1000).toFixed(1)}k`);

  const summary: string[] = [];
  summary.push(
    bestSide === "SELL_ABSORPTION"
      ? "Aggressive buying into ask liquidity; price failed to sustain"
      : "Aggressive selling into bid liquidity; price failed to break down"
  );
  if (bestConfluence.factors.length) summary.push(`Confluence: ${bestConfluence.factors.join(", ")}`);
  summary.push(`Persistence ${Math.round(bestPersistenceScore)}% | Rejection ${Math.round(bestRejectionScore)}%`);
  if (sweep?.summary?.length) summary.push(...sweep.summary.slice(0, 2));

  const signal: AbsorptionSignal = {
    status: statusOut,
    side: bestSide,
    confidence,
    intensity: Math.min(100, intensity),
    zoneLow: bestZone.low,
    zoneHigh: bestZone.high,
    referencePrice: spot,
    executedVolume: bestExecutedVolume,
    restingLiquidity: bestResting,
    persistenceScore: Math.round(bestPersistenceScore),
    rejectionScore: Math.round(bestRejectionScore),
    confluenceScore: bestConfluence.score,
    trigger,
    invalidation,
    summary: summary.slice(0, 6),
    ...candidate,
  };

  const debug: AbsorptionDebug = {
    testedZones,
    executionAtZone: bestExecutedVolume,
    liquidityBeforeAfter: { restingNow: bestResting, inferredDepletion: bestExecutedVolume },
    priceReactionMetrics: { outcome: outcome || "N/A", followThroughPct },
    matchedConfluences: bestConfluence.factors,
  };

  return { signal, debug };
}
