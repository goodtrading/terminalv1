/**
 * Short Gamma Pocket Engine
 * Identifies zones where BTC can become structurally fragile and potentially accelerate if flow confirms.
 * A Short Gamma Pocket is a risk/fragility zone, not an entry signal.
 */

export type ShortGammaPocketDirection = "UPPER" | "LOWER";
export type ShortGammaPocketStatus = "NONE" | "IDLE" | "WATCH" | "ACTIVE" | "FAILED" | "EXPANDING";
export type ShortGammaPocketRisk = "LOW" | "MEDIUM" | "HIGH";
export type ShortGammaPocketRelation = "ABOVE_FLIP" | "BELOW_FLIP" | "NEAR_FLIP" | "INSIDE_TRANSITION";
export type ShortGammaPocketWall = "CALL_WALL" | "PUT_WALL" | null;

export interface ShortGammaPocket {
  id: string;
  direction: ShortGammaPocketDirection;
  rangeLow: number;
  rangeHigh: number;
  status: ShortGammaPocketStatus;
  risk: ShortGammaPocketRisk;
  confidence: number; // 0-100
  relationToFlip: ShortGammaPocketRelation;
  relatedMagnet?: number;
  relatedWall: ShortGammaPocketWall;
  explanation: string;
  activationCondition: string;
}

export interface ShortGammaPocketsSignal {
  status: ShortGammaPocketStatus;
  nearest: ShortGammaPocket | null;
  pockets: ShortGammaPocket[];
  summary: string;
}

interface ShortGammaPocketInput {
  spotPrice: number;
  gammaRegime: "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | string | null;
  gammaFlip: number | null;
  transitionZoneStart: number | null;
  transitionZoneEnd: number | null;
  gammaMagnets: number[];
  callWall: number | null;
  putWall: number | null;
  shortGammaPocketStart: number | null;
  shortGammaPocketEnd: number | null;
  marketMode?: string;
  marketModeConfidence?: number;
  expansionProbability?: number;
}

/**
 * Detect short gamma pockets based on multiple conditions:
 * - gamma regime is short gamma OR price is near transition/flip zone
 * - price is approaching or entering a zone near a gamma magnet, wall, or high OI strike
 * - the zone has expansion risk higher than pinning risk
 * - distance to spot is reasonable for intraday context
 * - if current market mode is GAMMA_PIN / LONG_GAMMA with low expansion probability, return no active pocket
 */
export function detectShortGammaPockets(input: ShortGammaPocketInput): ShortGammaPocketsSignal {
  const {
    spotPrice,
    gammaRegime,
    gammaFlip,
    transitionZoneStart,
    transitionZoneEnd,
    gammaMagnets,
    callWall,
    putWall,
    shortGammaPocketStart,
    shortGammaPocketEnd,
    marketMode,
    marketModeConfidence,
    expansionProbability,
  } = input;

  // If market is in Long Gamma / Gamma Pin with low expansion risk, return no active pocket
  if (gammaRegime === "LONG GAMMA" && marketMode === "GAMMA_PIN") {
    if (expansionProbability != null && expansionProbability < 30) {
      return {
        status: "NONE",
        nearest: null,
        pockets: [],
        summary: "No active short gamma pocket. Market currently pinned / long gamma. Watch transition zones only if price leaves the pin zone.",
      };
    }
  }

  // If no flip or transition zone, and regime is long gamma, return none
  if (!gammaFlip && gammaRegime === "LONG GAMMA") {
    return {
      status: "NONE",
      nearest: null,
      pockets: [],
      summary: "No active short gamma pocket. Market currently long gamma with no transition zone detected.",
    };
  }

  const pockets: ShortGammaPocket[] = [];

  // Generate potential pockets from existing data
  if (shortGammaPocketStart != null && shortGammaPocketEnd != null) {
    const pocket = createPocketFromRange(
      shortGammaPocketStart,
      shortGammaPocketEnd,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (pocket) {
      pockets.push(pocket);
    }
  }

  // Generate pockets from transition zones
  if (transitionZoneStart != null && transitionZoneEnd != null) {
    const upperPocket = createPocketFromRange(
      transitionZoneEnd,
      transitionZoneEnd + (transitionZoneEnd - transitionZoneStart) * 0.5,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (upperPocket) {
      pockets.push(upperPocket);
    }

    const lowerPocket = createPocketFromRange(
      transitionZoneStart - (transitionZoneEnd - transitionZoneStart) * 0.5,
      transitionZoneStart,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (lowerPocket) {
      pockets.push(lowerPocket);
    }
  }

  // Generate pockets from gamma magnets
  for (const magnet of gammaMagnets) {
    const magnetRange = 500; // 0.5% range around magnet
    const pocket = createPocketFromRange(
      magnet - magnetRange,
      magnet + magnetRange,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (pocket) {
      pockets.push(pocket);
    }
  }

  // Generate pockets from walls
  if (callWall != null) {
    const wallRange = 500;
    const pocket = createPocketFromRange(
      callWall - wallRange,
      callWall + wallRange,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (pocket) {
      pockets.push(pocket);
    }
  }

  if (putWall != null) {
    const wallRange = 500;
    const pocket = createPocketFromRange(
      putWall - wallRange,
      putWall + wallRange,
      spotPrice,
      gammaFlip,
      transitionZoneStart,
      transitionZoneEnd,
      gammaMagnets,
      callWall,
      putWall,
      gammaRegime,
      marketMode,
      expansionProbability,
    );
    if (pocket) {
      pockets.push(pocket);
    }
  }

  // Filter and rank pockets
  const validPockets = pockets
    .filter(p => p.confidence > 30) // Only keep pockets with reasonable confidence
    .sort((a, b) => {
      // Prioritize pockets closer to spot
      const distA = Math.min(Math.abs(a.rangeLow - spotPrice), Math.abs(a.rangeHigh - spotPrice));
      const distB = Math.min(Math.abs(b.rangeLow - spotPrice), Math.abs(b.rangeHigh - spotPrice));
      return distA - distB;
    });

  // Determine status based on nearest pocket
  let status: ShortGammaPocketStatus = "NONE";
  let nearest: ShortGammaPocket | null = null;

  if (validPockets.length > 0) {
    nearest = validPockets[0];
    const distToNearest = Math.min(
      Math.abs(nearest.rangeLow - spotPrice),
      Math.abs(nearest.rangeHigh - spotPrice),
    );

    if (distToNearest < 200) {
      status = "ACTIVE";
    } else if (distToNearest < 500) {
      status = "WATCH";
    } else if (distToNearest < 1000) {
      status = "IDLE";
    } else {
      status = "NONE";
    }

    if (status !== "NONE") {
      nearest.status = status;
    }
  }

  const summary = generateSummary(status, nearest, gammaRegime, marketMode);

  return {
    status,
    nearest,
    pockets: validPockets,
    summary,
  };
}

function createPocketFromRange(
  rangeLow: number,
  rangeHigh: number,
  spotPrice: number,
  gammaFlip: number | null,
  transitionZoneStart: number | null,
  transitionZoneEnd: number | null,
  gammaMagnets: number[],
  callWall: number | null,
  putWall: number | null,
  gammaRegime: "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | string | null,
  marketMode?: string,
  expansionProbability?: number,
): ShortGammaPocket | null {
  // Validate range
  if (rangeLow >= rangeHigh || rangeLow <= 0 || rangeHigh <= 0) {
    return null;
  }

  // Determine direction
  const direction: ShortGammaPocketDirection = rangeHigh > spotPrice ? "UPPER" : "LOWER";

  // Determine relation to flip
  let relationToFlip: ShortGammaPocketRelation = "NEAR_FLIP";
  if (gammaFlip != null) {
    if (rangeLow > gammaFlip) {
      relationToFlip = "ABOVE_FLIP";
    } else if (rangeHigh < gammaFlip) {
      relationToFlip = "BELOW_FLIP";
    } else if (transitionZoneStart != null && transitionZoneEnd != null) {
      if (rangeLow >= transitionZoneStart && rangeHigh <= transitionZoneEnd) {
        relationToFlip = "INSIDE_TRANSITION";
      }
    }
  }

  // Find related magnet
  const relatedMagnet = gammaMagnets.find(m => m >= rangeLow && m <= rangeHigh);

  // Find related wall
  let relatedWall: ShortGammaPocketWall = null;
  if (callWall != null && callWall >= rangeLow && callWall <= rangeHigh) {
    relatedWall = "CALL_WALL";
  } else if (putWall != null && putWall >= rangeLow && putWall <= rangeHigh) {
    relatedWall = "PUT_WALL";
  }

  // Calculate confidence based on multiple factors
  let confidence = 50;

  // Boost confidence if in short gamma regime
  if (gammaRegime === "SHORT GAMMA") {
    confidence += 20;
  }

  // Boost confidence if near transition zone
  if (transitionZoneStart != null && transitionZoneEnd != null) {
    if (rangeLow >= transitionZoneStart && rangeHigh <= transitionZoneEnd) {
      confidence += 15;
    }
  }

  // Boost confidence if related to magnet or wall
  if (relatedMagnet) {
    confidence += 10;
  }
  if (relatedWall) {
    confidence += 10;
  }

  // Boost confidence if expansion probability is high
  if (expansionProbability != null && expansionProbability > 50) {
    confidence += 10;
  }

  // Reduce confidence if in GAMMA_PIN mode
  if (marketMode === "GAMMA_PIN") {
    confidence -= 20;
  }

  // Clamp confidence to 0-100
  confidence = Math.max(0, Math.min(100, confidence));

  // Determine risk based on confidence and relation to flip
  let risk: ShortGammaPocketRisk = "MEDIUM";
  if (confidence >= 70) {
    risk = "HIGH";
  } else if (confidence <= 40) {
    risk = "LOW";
  }

  // Generate explanation
  const explanation = generateExplanation(
    direction,
    rangeLow,
    rangeHigh,
    relationToFlip,
    relatedMagnet,
    relatedWall,
    gammaRegime,
    marketMode,
  );

  // Generate activation condition
  const activationCondition = generateActivationCondition(direction, relationToFlip, relatedWall);

  return {
    id: `pocket-${direction}-${rangeLow}-${rangeHigh}`,
    direction,
    rangeLow,
    rangeHigh,
    status: "IDLE", // Will be updated by main function
    risk,
    confidence,
    relationToFlip,
    relatedMagnet,
    relatedWall,
    explanation,
    activationCondition,
  };
}

function generateExplanation(
  direction: ShortGammaPocketDirection,
  rangeLow: number,
  rangeHigh: number,
  relationToFlip: ShortGammaPocketRelation,
  relatedMagnet?: number,
  relatedWall?: ShortGammaPocketWall,
  gammaRegime?: "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | string | null,
  marketMode?: string,
): string {
  const parts: string[] = [];

  parts.push(`${direction} transition zone`);

  if (relatedMagnet) {
    parts.push(`near gamma magnet at ${(relatedMagnet / 1000).toFixed(1)}k`);
  }

  if (relatedWall === "CALL_WALL") {
    parts.push("near call wall");
  } else if (relatedWall === "PUT_WALL") {
    parts.push("near put wall");
  }

  if (relationToFlip === "ABOVE_FLIP") {
    parts.push("above gamma flip");
  } else if (relationToFlip === "BELOW_FLIP") {
    parts.push("below gamma flip");
  } else if (relationToFlip === "INSIDE_TRANSITION") {
    parts.push("inside transition zone");
  }

  if (gammaRegime === "SHORT GAMMA") {
    parts.push("in short gamma regime");
  }

  if (marketMode === "GAMMA_PIN") {
    parts.push("currently pinned - watch for breakout");
  }

  return parts.join(". ") + ".";
}

function generateActivationCondition(
  direction: ShortGammaPocketDirection,
  relationToFlip: ShortGammaPocketRelation,
  relatedWall?: ShortGammaPocketWall,
): string {
  const conditions: string[] = [];

  conditions.push("Price enters zone");

  if (direction === "UPPER") {
    conditions.push("with aggressive buying flow");
  } else {
    conditions.push("with aggressive selling flow");
  }

  if (relatedWall) {
    conditions.push("or liquidity vacuum near wall");
  }

  conditions.push("or sweep continuation");

  return conditions.join(", ") + ".";
}

function generateSummary(
  status: ShortGammaPocketStatus,
  nearest: ShortGammaPocket | null,
  gammaRegime?: "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | string | null,
  marketMode?: string,
): string {
  if (status === "NONE") {
    if (gammaRegime === "LONG GAMMA" && marketMode === "GAMMA_PIN") {
      return "No active short gamma pocket. Market currently pinned / long gamma. Watch transition zones only if price leaves the pin zone.";
    }
    return "No active short gamma pocket detected.";
  }

  if (!nearest) {
    return "No active short gamma pocket detected.";
  }

  const direction = nearest.direction === "UPPER" ? "upper" : "lower";
  const range = `${(nearest.rangeLow / 1000).toFixed(1)}k-${(nearest.rangeHigh / 1000).toFixed(1)}k`;

  if (status === "ACTIVE") {
    return `${direction} short gamma pocket ACTIVE at ${range}. Price in zone. Monitor for acceleration or rejection.`;
  } else if (status === "WATCH") {
    return `${direction} short gamma pocket at ${range}. Price approaching. Watch for entry and flow confirmation.`;
  } else if (status === "IDLE") {
    return `${direction} short gamma pocket at ${range}. Price distant. Monitor for approach.`;
  }

  return `Short gamma pocket detected at ${range}. Status: ${status}.`;
}
