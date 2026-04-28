/**
 * Gamma Acceleration Zones
 * Computes price bands where thin liquidity × gamma sensitivity × liquidity slope
 * exceeds a threshold, indicating potential acceleration (green = upside, red = downside).
 * Uses both distance to gamma flip and nearest gamma magnet for sensitivity.
 * Persistence: strong zones can appear immediately; others need prior tick overlap.
 */

export interface GammaAccelerationZone {
  start: number;
  end: number;
  direction: "UP" | "DOWN";
  score: number;
}

export interface GammaAccelerationInput {
  spotPrice: number;
  gammaFlip: number | null;
  gammaMagnets: number[];
  liquidityHeatZones: Array<{
    priceStart: number;
    priceEnd: number;
    side: string;
    totalQuantity: number;
    intensity?: number;
  }>;
  liquidityVacuum?: {
    vacuumRisk?: string;
    vacuumScore?: number;
    activeZones?: Array<{
      priceStart?: number;
      priceEnd?: number;
      start?: number;
      end?: number;
      direction?: string;
      strength?: number;
    }>;
    nearestThinLiquidityZone?: number | null;
  } | null;
  /** Signed mid return since last terminal tick (~5s); aligns velocity with slope direction. */
  spotVelocityPct?: number;
}

const BAND_SIZE_PCT = 0.005; // 0.5% of spot per band
const RANGE_PCT = 0.02; // ±2% from spot
const ACCELERATION_THRESHOLD = 0.055;
const THIN_BAND_SLOPE_FLOOR = 0.065;
const STRONG_RAW_SCORE_INSTANT = 0.095;
const MIN_ZONE_WIDTH_PCT = 0.002;
const FLIP_DECAY_PCT = 0.01; // spotPrice * this for flip decay
const MAGNET_DECAY_PCT = 0.01; // spotPrice * this for magnet decay
const FLIP_WEIGHT = 0.8;

const CONSECUTIVE_TO_DISAPPEAR = 2;

function zoneKey(z: GammaAccelerationZone): string {
  return `${z.start.toFixed(2)}-${z.end.toFixed(2)}-${z.direction}`;
}

interface PersistenceState {
  lastRawKeys: Set<string>;
  displayedZones: GammaAccelerationZone[];
  consecutiveBelow: Map<string, number>;
}

let persistenceState: PersistenceState = {
  lastRawKeys: new Set(),
  displayedZones: [],
  consecutiveBelow: new Map(),
};

function thinZoneBounds(t: {
  priceStart?: number;
  priceEnd?: number;
  start?: number;
  end?: number;
}): { lo: number; hi: number } {
  const lo = t.priceStart ?? t.start ?? 0;
  const hi = t.priceEnd ?? t.end ?? 0;
  return { lo, hi };
}

function computeRawZones(input: GammaAccelerationInput): { zones: GammaAccelerationZone[]; candidates: Array<{ mid: number; vacuumScore: number; gammaSensitivity: number; liquiditySlope: number; accelerationScore: number }> } {
  const { spotPrice, gammaFlip, gammaMagnets, liquidityHeatZones, liquidityVacuum, spotVelocityPct } = input;
  const empty = { zones: [] as GammaAccelerationZone[], candidates: [] as Array<{ mid: number; vacuumScore: number; gammaSensitivity: number; liquiditySlope: number; accelerationScore: number }> };
  if (spotPrice <= 0) return empty;

  const bandSize = spotPrice * BAND_SIZE_PCT;
  const range = spotPrice * RANGE_PCT;
  const minPrice = spotPrice - range;
  const maxPrice = spotPrice + range;
  const flipDecay = spotPrice * FLIP_DECAY_PCT;
  const magnetDecay = spotPrice * MAGNET_DECAY_PCT;

  // Build depth per band (mid price -> total quantity)
  const bandDepth = new Map<number, number>();
  for (let p = minPrice; p < maxPrice; p += bandSize) {
    const bandMid = p + bandSize / 2;
    bandDepth.set(bandMid, 0);
  }
  for (const z of liquidityHeatZones) {
    const mid = (z.priceStart + z.priceEnd) / 2;
    const qty = z.totalQuantity ?? (z.intensity ?? 0) * 100;
    for (const [bandMid, depth] of bandDepth) {
      if (mid >= bandMid - bandSize / 2 && mid < bandMid + bandSize / 2) {
        bandDepth.set(bandMid, depth + qty);
      }
    }
  }

  const sortedBands = [...bandDepth.entries()].sort((a, b) => a[0] - b[0]);
  const maxDepth = Math.max(...sortedBands.map(([, d]) => d), 0.001);

  const vacuumScoreGlobal = liquidityVacuum?.vacuumScore != null ? liquidityVacuum.vacuumScore / 100 : 0.5;
  const thinZones = liquidityVacuum?.activeZones ?? [];
  const isInThinZone = (bandMid: number): number => {
    const bandStart = bandMid - bandSize / 2;
    const bandEnd = bandMid + bandSize / 2;
    for (const t of thinZones) {
      const { lo: tStart, hi: tEnd } = thinZoneBounds(t);
      if (tEnd > tStart && bandStart < tEnd && bandEnd > tStart) return 1;
    }
    const nearest = liquidityVacuum?.nearestThinLiquidityZone;
    if (nearest != null && Number.isFinite(nearest)) {
      const w = bandSize * 1.5;
      if (bandMid >= nearest - w && bandMid <= nearest + w) return 1;
    }
    return 0;
  };

  const nearestMagnet = (mid: number): number | null => {
    if (!gammaMagnets?.length) return null;
    return gammaMagnets.reduce((best, p) =>
      Math.abs(p - mid) < Math.abs(best - mid) ? p : best
    );
  };

  const gammaSensitivity = (mid: number): number => {
    const distToFlip = gammaFlip != null ? Math.abs(mid - gammaFlip) : Infinity;
    const flipTerm = gammaFlip != null
      ? Math.exp(-distToFlip / flipDecay) * FLIP_WEIGHT
      : 0;
    const magnet = nearestMagnet(mid);
    const distToMagnet = magnet != null ? Math.abs(mid - magnet) : Infinity;
    const magnetTerm = magnet != null
      ? Math.exp(-distToMagnet / magnetDecay)
      : 0;
    return Math.max(flipTerm, magnetTerm) || 0.5;
  };

  interface BandCandidate {
    mid: number;
    vacuumScore: number;
    gammaSensitivity: number;
    liquiditySlope: number;
    accelerationScore: number;
  }

  const zones: GammaAccelerationZone[] = [];
  const allCandidates: BandCandidate[] = [];

  for (let i = 1; i < sortedBands.length - 1; i++) {
    const [mid, depth] = sortedBands[i];
    const prevDepth = sortedBands[i - 1][1];
    const nextDepth = sortedBands[i + 1][1];

    const inThin = isInThinZone(mid) === 1;
    const vacuumScore = inThin ? 1 : (1 - depth / maxDepth) * 0.5 + vacuumScoreGlobal * 0.5;
    const sens = gammaSensitivity(mid);
    const liquiditySlope = (nextDepth - prevDepth) / (2 * bandSize);
    let slopeNorm = Math.abs(nextDepth - prevDepth) / maxDepth;
    if (inThin) slopeNorm = Math.max(slopeNorm, THIN_BAND_SLOPE_FLOOR);
    let accelerationScore = vacuumScore * sens * slopeNorm;
    const vel = spotVelocityPct ?? 0;
    if (Math.abs(vel) > 3e-5) {
      const dirUp = liquiditySlope >= 0;
      const aligns = (dirUp && vel > 0) || (!dirUp && vel < 0);
      if (aligns) accelerationScore *= 1.32;
    }

    allCandidates.push({
      mid,
      vacuumScore,
      gammaSensitivity: sens,
      liquiditySlope,
      accelerationScore,
    });

    if (accelerationScore <= ACCELERATION_THRESHOLD) continue;

    const direction: "UP" | "DOWN" = liquiditySlope >= 0 ? "UP" : "DOWN";
    const start = mid - bandSize / 2;
    const end = mid + bandSize / 2;
    zones.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      direction,
      score: Math.round(accelerationScore * 1000) / 1000,
    });
  }

  // Merge adjacent zones with same direction
  const merged: GammaAccelerationZone[] = [];
  for (const z of zones) {
    const last = merged[merged.length - 1];
    if (last && last.direction === z.direction && z.start <= last.end + bandSize) {
      last.end = z.end;
      last.score = Math.max(last.score, z.score);
    } else {
      merged.push({ ...z });
    }
  }

  return { zones: merged, candidates: allCandidates };
}

/**
 * Returns zones that passed the threshold this run (raw output).
 */
export function computeGammaAccelerationZones(input: GammaAccelerationInput): GammaAccelerationZone[] {
  const { zones: rawZones, candidates } = computeRawZones(input);
  const rawKeys = new Set(rawZones.map(zoneKey));
  const state = persistenceState;

  // Update consecutive-below counts for currently displayed zones
  for (const z of state.displayedZones) {
    const k = zoneKey(z);
    if (!rawKeys.has(k)) {
      state.consecutiveBelow.set(k, (state.consecutiveBelow.get(k) ?? 0) + 1);
    } else {
      state.consecutiveBelow.set(k, 0);
    }
  }

  // Still shown: displayed zones that are either still above threshold or below for < 2 consecutive
  const stillShown = state.displayedZones.filter((z) => {
    const k = zoneKey(z);
    const belowCount = state.consecutiveBelow.get(k) ?? 0;
    return rawKeys.has(k) || belowCount < CONSECUTIVE_TO_DISAPPEAR;
  });

  // To add: raw zones that were also above last run (2 consecutive above) and not already in stillShown
  const lastKeys = state.lastRawKeys;
  const toAdd = rawZones.filter((z) => {
    const k = zoneKey(z);
    if (stillShown.some((d) => zoneKey(d) === k)) return false;
    return lastKeys.has(k) || z.score >= STRONG_RAW_SCORE_INSTANT;
  });

  // Final displayed = stillShown (minus those that have been below 2 consecutive) + toAdd
  const toRemove = stillShown.filter((z) => {
    const k = zoneKey(z);
    return (state.consecutiveBelow.get(k) ?? 0) >= CONSECUTIVE_TO_DISAPPEAR;
  });
  const kept = stillShown.filter((z) => !toRemove.includes(z));
  const displayedZones = [...kept, ...toAdd];

  if (displayedZones.length === 0 && candidates.length > 0) {
    const top = [...candidates]
      .sort((a, b) => b.accelerationScore - a.accelerationScore)
      .slice(0, 5);
    console.log("[GammaAccel] zones empty; top candidate bands:", top.map((c) => ({
      mid: c.mid.toFixed(0),
      vacuumScore: c.vacuumScore.toFixed(3),
      gammaSensitivity: c.gammaSensitivity.toFixed(3),
      liquiditySlope: c.liquiditySlope.toFixed(6),
      accelerationScore: c.accelerationScore.toFixed(4),
    })));
  }

  // Prune consecutiveBelow to only keys we care about
  const allKeys = new Set(displayedZones.map(zoneKey));
  for (const k of state.consecutiveBelow.keys()) {
    if (!allKeys.has(k)) state.consecutiveBelow.delete(k);
  }

  persistenceState = {
    lastRawKeys: rawKeys,
    displayedZones,
    consecutiveBelow: state.consecutiveBelow,
  };

  return displayedZones;
}

export type GammaAccelLifecycleState = "NONE" | "SETUP" | "TRIGGERED" | "ACTIVE";

/** Thin-path zones present = SETUP; slope+score = TRIGGERED; aligned velocity = ACTIVE. */
export function deriveGammaAccelLifecycle(
  zones: GammaAccelerationZone[],
  spotVelocityPct: number
): GammaAccelLifecycleState {
  if (!zones.length) return "NONE";
  const v = Math.abs(spotVelocityPct);
  const maxScore = zones.reduce((m, z) => Math.max(m, z.score), 0);
  if (v >= 0.000035) return "ACTIVE";
  if (maxScore >= 0.078) return "TRIGGERED";
  return "SETUP";
}
