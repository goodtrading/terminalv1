import type {
  ActiveTradingMagnetLevel,
  IntradayDecisionLevel,
  MacroGravityLevel,
  MagnetLevelType,
  SessionLevelHierarchy,
  SessionTerminalInput,
} from "./sessionReportTypes";
import {
  buildLevelContext,
  distPctAbs,
  isFarFromSpot,
  num,
  resolveLocalFlip,
  signedDistancePct,
} from "./sessionReportLevelUtils";
import { FAR_MAGNET_WARNING } from "./sessionMagnetRules";

export const DECISION_LEVEL_MAX_PCT = 1;
export const ACTIVE_MAGNET_MIN_PCT = 0.25;
export const ACTIVE_MAGNET_IDEAL_MAX_PCT = 3;
export const ACTIVE_MAGNET_MAX_PCT = 5;

export type LevelCandidate = {
  price: number;
  type: MagnetLevelType | "Local Flip" | "Liquidity Wall";
  source: string;
};

function collectLevelCandidates(
  terminal: SessionTerminalInput,
  spot: number,
  localFlip: number | null,
  liquidityMagnet: number | null,
  nearestWallPrice: number | null,
): LevelCandidate[] {
  const seen = new Set<number>();
  const out: LevelCandidate[] = [];

  const add = (price: number | null, type: LevelCandidate["type"], source: string) => {
    if (price == null || !Number.isFinite(price)) return;
    const key = Math.round(price);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ price, type, source });
  };

  if (localFlip != null) add(localFlip, "Local Flip", "gamma_flip");
  add(resolveGravityPrice(terminal), "Gravity Magnet", "gravity_map");
  add(liquidityMagnet, "Key Level", "liquidity_active");
  add(nearestWallPrice, "Liquidity Wall", "liquidity_wall");

  const magnets = terminal.levels?.gammaMagnets;
  if (Array.isArray(magnets)) {
    for (const m of magnets) add(m, "Gamma Magnet", "gamma_magnets");
  }

  add(num(terminal.positioning?.callWall), "Call Wall", "call_wall");
  add(num(terminal.positioning?.putWall), "Put Wall", "put_wall");

  return out;
}

function resolveGravityPrice(terminal: SessionTerminalInput): number | null {
  const gravity = terminal.gravityMap?.primaryMagnet;
  if (gravity != null && typeof gravity === "object") {
    return num((gravity as { price?: number }).price);
  }
  if (typeof gravity === "number") return gravity;
  return null;
}

function emptyDecision(spot: number | null): IntradayDecisionLevel {
  return {
    price: null,
    type: "Local Flip",
    distancePct: null,
    distanceLabel: "N/A",
    relation: "N/A",
    levelStatus: "No intraday decision level within range",
  };
}

function emptyActive(): ActiveTradingMagnetLevel {
  return {
    price: null,
    type: "N/A",
    distancePct: null,
    distanceLabel: "N/A",
    direction: "N/A",
    condition: "N/A",
    levelStatus: "No valid intraday magnet detected",
    valid: false,
  };
}

function emptyMacro(spot: number | null): MacroGravityLevel {
  return {
    price: null,
    type: "Macro Gravity Level",
    distancePct: null,
    distanceLabel: "N/A",
    relation: "N/A",
    levelStatus: "No macro level identified",
  };
}

function resolveIntradayDecision(
  spot: number,
  localFlip: number | null,
  liquidityMagnet: number | null,
  nearestWallPrice: number | null,
): IntradayDecisionLevel {
  if (localFlip != null && distPctAbs(spot, localFlip) <= DECISION_LEVEL_MAX_PCT) {
    const ctx = buildLevelContext(localFlip, "Local Flip", spot, 0.35);
    return {
      ...ctx,
      levelStatus: "Primary intraday focus",
    };
  }

  if (liquidityMagnet != null && distPctAbs(spot, liquidityMagnet) <= DECISION_LEVEL_MAX_PCT) {
    const ctx = buildLevelContext(liquidityMagnet, "Key Level", spot, 0.35);
    return {
      ...ctx,
      levelStatus: "Primary intraday focus",
    };
  }

  if (nearestWallPrice != null && distPctAbs(spot, nearestWallPrice) <= DECISION_LEVEL_MAX_PCT) {
    const ctx = buildLevelContext(nearestWallPrice, "Liquidity Wall", spot, 0.35);
    return {
      ...ctx,
      levelStatus: "Primary intraday focus",
    };
  }

  return emptyDecision(spot);
}

function isActiveTradingDistance(spot: number, price: number): boolean {
  const d = distPctAbs(spot, price);
  return d >= ACTIVE_MAGNET_MIN_PCT && d <= ACTIVE_MAGNET_MAX_PCT;
}

function activeMagnetCondition(
  decision: IntradayDecisionLevel,
  direction: ActiveTradingMagnetLevel["direction"],
): string {
  if (decision.price != null && decision.type === "Local Flip") {
    if (direction === "Downside") {
      return "Only relevant if flip rejection confirms.";
    }
    if (direction === "Upside") {
      return "Only relevant if flip acceptance fails and price reverts.";
    }
  }
  return "Valid only while price remains inside active magnet zone.";
}

function resolveActiveTradingMagnet(
  spot: number,
  candidates: LevelCandidate[],
  decision: IntradayDecisionLevel,
  liquidityMagnet: number | null,
): ActiveTradingMagnetLevel {
  const decisionPrice = decision.price;

  const eligible = candidates.filter((c) => {
    if (decisionPrice != null && Math.abs(c.price - decisionPrice) < 1) return false;
    if (isFarFromSpot(spot, c.price)) return false;
    return isActiveTradingDistance(spot, c.price);
  });

  let pick: LevelCandidate | null = null;

  if (liquidityMagnet != null && isActiveTradingDistance(spot, liquidityMagnet)) {
    const fromLiq = eligible.find((c) => Math.abs(c.price - liquidityMagnet) < 1);
    if (fromLiq) pick = fromLiq;
  }

  if (!pick && eligible.length) {
    const ideal = eligible.filter((c) => distPctAbs(spot, c.price) <= ACTIVE_MAGNET_IDEAL_MAX_PCT);
    const pool = ideal.length ? ideal : eligible;
    pick = pool.reduce((best, c) =>
      distPctAbs(spot, c.price) < distPctAbs(spot, best.price) ? c : best,
    );
  }

  if (!pick) return emptyActive();

  const distancePct = signedDistancePct(spot, pick.price);
  const direction: ActiveTradingMagnetLevel["direction"] =
    pick.price < spot ? "Downside" : pick.price > spot ? "Upside" : "N/A";

  const displayType =
    direction === "Downside" && pick.type !== "Local Flip"
      ? `Downside Active Magnet`
      : direction === "Upside" && pick.type !== "Local Flip"
        ? `Upside Active Magnet`
        : pick.type === "Gamma Magnet"
          ? "Gamma Magnet"
          : pick.type === "Key Level"
            ? "Key Level"
            : String(pick.type);

  return {
    price: pick.price,
    type: displayType,
    distancePct,
    distanceLabel: `${distancePct >= 0 ? "+" : ""}${distancePct.toFixed(2)}%`,
    direction,
    condition: activeMagnetCondition(decision, direction),
    levelStatus: distPctAbs(spot, pick.price) <= ACTIVE_MAGNET_IDEAL_MAX_PCT
      ? "Active intraday magnet"
      : "Extended active magnet (≤5%)",
    valid: true,
  };
}

function resolveMacroGravity(
  spot: number,
  candidates: LevelCandidate[],
): MacroGravityLevel {
  const gravityPrice = candidates.find((c) => c.source === "gravity_map")?.price ?? null;

  if (gravityPrice != null && isFarFromSpot(spot, gravityPrice)) {
    const ctx = buildLevelContext(gravityPrice, "Macro Gravity Level", spot);
    return {
      ...ctx,
      type: "Macro Gravity Level",
      role: "macro",
      isIntradayTarget: false,
      farMacroStatus: "Macro only",
      warning: FAR_MAGNET_WARNING,
      levelStatus: "Macro only",
    };
  }

  const farCandidates = candidates.filter((c) => isFarFromSpot(spot, c.price));
  if (!farCandidates.length) return emptyMacro(spot);

  const farthest = farCandidates.reduce((best, c) =>
    distPctAbs(spot, c.price) > distPctAbs(spot, best.price) ? c : best,
  );

  const ctx = buildLevelContext(farthest.price, "Macro Gravity Level", spot);
  return {
    ...ctx,
    type: "Macro Gravity Level",
    role: "macro",
    isIntradayTarget: false,
    farMacroStatus: "Macro only",
    warning: FAR_MAGNET_WARNING,
    levelStatus: "Macro only",
  };
}

export function resolveSessionLevelHierarchy(
  terminal: SessionTerminalInput,
  spot: number | null,
  liquidityMagnet: number | null,
  nearestWallPrice: number | null,
): SessionLevelHierarchy {
  const localFlip = resolveLocalFlip(terminal);

  if (spot == null) {
    return {
      intradayDecision: emptyDecision(null),
      activeTrading: emptyActive(),
      macroGravity: emptyMacro(null),
      localFlip,
    };
  }

  const candidates = collectLevelCandidates(
    terminal,
    spot,
    localFlip,
    liquidityMagnet,
    nearestWallPrice,
  );

  const intradayDecision = resolveIntradayDecision(
    spot,
    localFlip,
    liquidityMagnet,
    nearestWallPrice,
  );
  const activeTrading = resolveActiveTradingMagnet(
    spot,
    candidates,
    intradayDecision,
    liquidityMagnet,
  );
  const macroGravity = resolveMacroGravity(spot, candidates);

  return {
    intradayDecision,
    activeTrading,
    macroGravity,
    localFlip,
  };
}

/** Active magnet price for risk/edge when valid. */
export function activeTradingPrice(hierarchy: SessionLevelHierarchy): number | null {
  return hierarchy.activeTrading.valid ? hierarchy.activeTrading.price : null;
}

export function decisionLevelPrice(hierarchy: SessionLevelHierarchy): number | null {
  return hierarchy.intradayDecision.price;
}

/** Legacy bridge — farthest macro price. */
export function macroGravityPrice(hierarchy: SessionLevelHierarchy): number | null {
  return hierarchy.macroGravity.price;
}

export function hierarchyHasFarMacroOnly(
  hierarchy: SessionLevelHierarchy,
  spot: number | null,
): boolean {
  if (spot == null) return false;
  return (
    hierarchy.macroGravity.price != null &&
    !hierarchy.activeTrading.valid &&
    isFarFromSpot(spot, hierarchy.macroGravity.price)
  );
}
