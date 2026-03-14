/**
 * Gravity Map Engine
 * Ranks price zones by attraction/repulsion strength using OI + gamma + liquidity confluence.
 * Outputs primary/secondary magnets, repulsion zones, acceleration zones.
 */

export interface GravityZone {
  price: number;
  zoneLow: number;
  zoneHigh: number;
  gravityScore: number;
  type: "MAGNET" | "TRANSITION" | "REPULSION" | "ACCELERATION" | "NEUTRAL";
  strength: "WEAK" | "MODERATE" | "HIGH" | "EXTREME";
  directionBias: "UP" | "DOWN" | "NEUTRAL";
  oiUsd: number;
  gammaConfluence: number;
  liquidityConfluence: number;
  distanceScore: number;
  pressureAlignmentScore: number;
  shortGammaBoost: number;
  summary: string;
  reasons: string[];
}

export interface GravityMapSignal {
  status: "INACTIVE" | "ACTIVE";
  primaryMagnet: GravityZone | null;
  secondaryMagnet: GravityZone | null;
  repulsionZones: GravityZone[];
  accelerationZones: GravityZone[];
  bias: "UPWARD_PULL" | "DOWNWARD_PULL" | "BALANCED" | "NEUTRAL";
  summary: string;
  debug?: Record<string, unknown>;
}

/** Configurable weights (0–1). Must sum to 1. */
const WEIGHTS = {
  oiConcentration: 0.3,
  gammaConfluence: 0.25,
  distanceToSpot: 0.15,
  liquiditySupport: 0.15,
  dealerPressureAlignment: 0.1,
  shortGammaBoost: 0.05,
} as const;

function strengthFromScore(score: number): GravityZone["strength"] {
  if (score >= 80) return "EXTREME";
  if (score >= 65) return "HIGH";
  if (score >= 50) return "MODERATE";
  return "WEAK";
}

export interface GravityMapInput {
  spotPrice: number;
  gammaFlip: number | null;
  transitionZoneStart: number | null;
  transitionZoneEnd: number | null;
  gammaMagnets: number[];
  shortGammaPocketStart: number | null;
  shortGammaPocketEnd: number | null;
  callWall: number | null;
  putWall: number | null;
  dealerPivot: number | null;
  /** Strikes with OI/GEX. oiUsd computed if spot provided. */
  strikes: Array<{
    strike: number;
    totalGex: number;
    callGex?: number;
    putGex?: number;
    totalOiContracts?: number;
    callOiContracts?: number;
    putOiContracts?: number;
    oiUsd?: number;
  }>;
  /** Heatmap liquidity zones */
  liquidityHeatZones?: Array<{
    priceStart: number;
    priceEnd: number;
    side: string;
    totalQuantity?: number;
    intensity?: number;
  }>;
  /** Dealer hedging direction if available */
  dealerFlowDirection?: "BUYING" | "SELLING" | "NEUTRAL";
  /** Pressure alignment from heatmap */
  liquidityPressure?: "BID_HEAVY" | "ASK_HEAVY" | "BALANCED";
  /** Gamma acceleration zones from heatmap */
  gammaAccelerationZones?: Array<{ start: number; end: number; direction: "UP" | "DOWN" }>;
  /** Top magnets from options snapshot (alternative source) */
  topMagnets?: Array<{ strike: number; totalGex: number }>;
}

/** Build INACTIVE fallback when input is insufficient. */
function buildInactiveSignal(reason: string): GravityMapSignal {
  return {
    status: "INACTIVE",
    primaryMagnet: null,
    secondaryMagnet: null,
    repulsionZones: [],
    accelerationZones: [],
    bias: "NEUTRAL",
    summary: reason,
  };
}

export function computeGravityMap(input: GravityMapInput): GravityMapSignal {
  const {
    spotPrice,
    gammaFlip,
    transitionZoneStart,
    transitionZoneEnd,
    gammaMagnets,
    shortGammaPocketStart,
    shortGammaPocketEnd,
    callWall,
    putWall,
    dealerPivot,
    strikes,
    liquidityHeatZones = [],
    dealerFlowDirection = "NEUTRAL",
    liquidityPressure = "BALANCED",
    gammaAccelerationZones = [],
  } = input;

  if (!spotPrice || spotPrice <= 0) return buildInactiveSignal("Missing spot price");
  if (!strikes?.length) return buildInactiveSignal("No strike data");

  const topMagnets = input.topMagnets ?? [];
  const hasGammaFlip = gammaFlip != null && Number.isFinite(gammaFlip);
  const hasMagnets = (gammaMagnets?.length ?? 0) > 0 || topMagnets.length > 0;
  const hasLiquidity = (liquidityHeatZones?.length ?? 0) > 0;
  const strikesWithOi = strikes.filter((s) => (s.totalOiContracts ?? 0) > 0 || (s.oiUsd ?? 0) > 0);
  if (strikesWithOi.length === 0) return buildInactiveSignal("No strikes with OI");
  if (!hasGammaFlip && !hasMagnets && !hasLiquidity) return buildInactiveSignal("Need gamma flip, magnets, or heatmap");

  const threshold = spotPrice * 0.12;
  const candidateStrikes = strikes
    .filter((s) => Math.abs(s.strike - spotPrice) <= threshold * 2)
    .slice(0, 50);

  if (candidateStrikes.length === 0) return buildInactiveSignal("No strikes in range");

  const maxOiUsd = Math.max(
    ...candidateStrikes.map((s) => s.oiUsd ?? (s.totalOiContracts ?? 0) * spotPrice),
    1
  );
  const maxAbsGex = Math.max(
    ...candidateStrikes.map((s) => Math.abs(s.totalGex ?? 0)),
    1
  );

  const zones: GravityZone[] = [];

  for (const s of candidateStrikes) {
    const strike = s.strike;
    const oiUsd = s.oiUsd ?? (s.totalOiContracts ?? 0) * spotPrice;
    const distPct = Math.abs(strike - spotPrice) / spotPrice;
    const distanceScore = Math.max(0, 100 - distPct * 1000);

    const oiScore = maxOiUsd > 0 ? (oiUsd / maxOiUsd) * 100 : 0;
    const gammaScore =
      maxAbsGex > 0 ? (Math.abs(s.totalGex ?? 0) / maxAbsGex) * 100 : 0;
    const gammaConfluence = gammaScore;

    let liquidityConfluence = 50;
    for (const z of liquidityHeatZones) {
      const mid = (z.priceStart + z.priceEnd) / 2;
      const width = Math.abs(z.priceEnd - z.priceStart) || 1;
      if (Math.abs(mid - strike) < width) {
        const qty = z.totalQuantity ?? (z.intensity ?? 0) * 100;
        liquidityConfluence = Math.min(100, 50 + qty * 2);
        break;
      }
    }

    let pressureAlignmentScore = 50;
    if (strike > spotPrice && (dealerFlowDirection === "BUYING" || liquidityPressure === "BID_HEAVY")) {
      pressureAlignmentScore = 75;
    } else if (strike < spotPrice && (dealerFlowDirection === "SELLING" || liquidityPressure === "ASK_HEAVY")) {
      pressureAlignmentScore = 75;
    } else if (dealerFlowDirection === "NEUTRAL" && liquidityPressure === "BALANCED") {
      pressureAlignmentScore = 60;
    }

    let shortGammaBoost = 0;
    if (shortGammaPocketStart != null && shortGammaPocketEnd != null) {
      const inPocket =
        strike >= shortGammaPocketStart && strike <= shortGammaPocketEnd;
      if (inPocket) shortGammaBoost = 80;
    }
    for (const acc of gammaAccelerationZones) {
      const mid = (acc.start + acc.end) / 2;
      if (Math.abs(mid - strike) < (acc.end - acc.start) * 0.6) {
        shortGammaBoost = Math.max(shortGammaBoost, 60);
        break;
      }
    }

    const rawScore =
      oiScore * WEIGHTS.oiConcentration +
      gammaConfluence * WEIGHTS.gammaConfluence +
      distanceScore * WEIGHTS.distanceToSpot +
      liquidityConfluence * WEIGHTS.liquiditySupport +
      pressureAlignmentScore * WEIGHTS.dealerPressureAlignment +
      shortGammaBoost * WEIGHTS.shortGammaBoost;

    const gravityScore = Math.min(100, Math.max(0, Math.round(rawScore)));
    const strength = strengthFromScore(gravityScore);

    const isCallWall = callWall != null && Math.abs(strike - callWall) < spotPrice * 0.001;
    const isPutWall = putWall != null && Math.abs(strike - putWall) < spotPrice * 0.001;
    const isMagnet = (gammaMagnets ?? []).some((m) => Math.abs(m - strike) < spotPrice * 0.001);
    const inTransition =
      transitionZoneStart != null &&
      transitionZoneEnd != null &&
      strike >= transitionZoneStart &&
      strike <= transitionZoneEnd;
    const nearFlip = gammaFlip != null && Math.abs(strike - gammaFlip) < spotPrice * 0.005;

    let type: GravityZone["type"] = "NEUTRAL";
    let directionBias: GravityZone["directionBias"] = "NEUTRAL";
    const reasons: string[] = [];

    if (isCallWall) {
      type = "REPULSION";
      directionBias = "DOWN";
      reasons.push("Call wall");
    } else if (isPutWall) {
      type = "REPULSION";
      directionBias = "UP";
      reasons.push("Put wall");
    } else if (inTransition) {
      type = "TRANSITION";
      reasons.push("In transition zone");
    } else if (isMagnet) {
      type = "MAGNET";
      directionBias = strike > spotPrice ? "UP" : strike < spotPrice ? "DOWN" : "NEUTRAL";
      reasons.push("Gamma magnet");
    } else if (nearFlip) {
      type = "MAGNET";
      reasons.push("Near gamma flip");
    } else if (shortGammaBoost > 40) {
      type = "ACCELERATION";
      directionBias = strike > spotPrice ? "UP" : "DOWN";
      reasons.push("Short gamma pocket / accel zone");
    }

    if (oiUsd > 0) reasons.push(`OI $${(oiUsd / 1e6).toFixed(1)}M`);
    if (gravityScore >= 50) reasons.push(`Score ${gravityScore}`);

    zones.push({
      price: strike,
      zoneLow: strike - spotPrice * 0.002,
      zoneHigh: strike + spotPrice * 0.002,
      gravityScore,
      type,
      strength,
      directionBias,
      oiUsd,
      gammaConfluence,
      liquidityConfluence,
      distanceScore,
      pressureAlignmentScore,
      shortGammaBoost,
      summary: `${reasons.slice(0, 2).join(", ")}`,
      reasons,
    });
  }

  const sorted = [...zones].sort((a, b) => b.gravityScore - a.gravityScore);

  const magnets = sorted.filter((z) => z.type === "MAGNET" && z.strength !== "WEAK");
  const repulsions = sorted.filter((z) => z.type === "REPULSION");
  const accelerations = sorted.filter((z) => z.type === "ACCELERATION" && z.strength !== "WEAK");

  let primaryMagnet = magnets[0] ?? null;
  let secondaryMagnet = magnets[1] ?? null;
  if (!primaryMagnet && sorted.length > 0 && sorted[0].gravityScore >= 30) {
    primaryMagnet = sorted[0];
    secondaryMagnet = sorted[1] ?? null;
  }

  let bias: GravityMapSignal["bias"] = "NEUTRAL";
  if (primaryMagnet || secondaryMagnet) {
    const upMagnets = [primaryMagnet, secondaryMagnet].filter(
      (m) => m && m.price > spotPrice
    ).length;
    const downMagnets = [primaryMagnet, secondaryMagnet].filter(
      (m) => m && m.price < spotPrice
    ).length;
    if (upMagnets > downMagnets) bias = "UPWARD_PULL";
    else if (downMagnets > upMagnets) bias = "DOWNWARD_PULL";
    else bias = "BALANCED";
  }

  const activeCount = magnets.length + repulsions.length + accelerations.length;
  const hasAnyZone = primaryMagnet != null || activeCount > 0;
  const summary =
    !hasAnyZone
      ? "No significant gravity zones in range."
      : `${primaryMagnet ? `Primary magnet ${primaryMagnet.price.toLocaleString()}` : ""}${primaryMagnet && secondaryMagnet ? ", " : ""}${secondaryMagnet ? `secondary ${secondaryMagnet.price.toLocaleString()}` : ""}. ${repulsions.length} repulsion, ${accelerations.length} acceleration zones.`.trim() || "Gravity zones computed.";

  return {
    status: hasAnyZone ? "ACTIVE" : "INACTIVE",
    primaryMagnet,
    secondaryMagnet,
    repulsionZones: repulsions.slice(0, 5),
    accelerationZones: accelerations.slice(0, 5),
    bias,
    summary: summary.trim() || "No significant gravity zones.",
    debug: {
      zonesCount: zones.length,
      topScores: sorted.slice(0, 5).map((z) => ({ price: z.price, score: z.gravityScore, type: z.type })),
    },
  };
}
