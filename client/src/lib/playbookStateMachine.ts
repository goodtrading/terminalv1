export type PlaybookState =
  | "NO_TRADE"
  | "FADE_EXTREMES"
  | "BREAKOUT"
  | "BREAKDOWN"
  | "REVERSAL"
  | "ACCELERATION";

export interface PlaybookStateMachineTriggers {
  reclaimPivot: boolean;
  losePivot: boolean;
  breakCallWall: boolean;
  breakPutWall: boolean;
  acceptanceAboveLevel: boolean;
  acceptanceBelowLevel: boolean;
  absorptionDetected: boolean;
  absorptionFailed: boolean;
  volatilityExpansion: boolean;
  accelerationRiskHigh: boolean;
  longGammaContext: boolean;
  nearCallWall: boolean;
  nearPutWall: boolean;
  inRangeBox: boolean;
}

export interface PlaybookStateMachineContext extends PlaybookStateMachineTriggers {
  nowMs: number;
  lastSwitchAtMs: number;
  cooldownMs: number;
  // Extra gating signals for stability / invalidation.
  absorptionRejectionNow: boolean;
  prevInRangeBox: boolean;
  breakoutInvalidated: boolean;
  breakdownInvalidated: boolean;
  fadeInvalidated: boolean;
  reversalInvalidated: boolean;
  accelerationInvalidated: boolean;

  // Near-trigger anticipatory metrics (debug only).
  nearTriggers?: {
    reclaimPivot?: number; // distance %
    breakCallWall?: number; // distance %
    breakPutWall?: number; // distance %
    absorptionZone?: number; // distance %
  };
  nearTriggerLevels?: {
    pivot?: number;
    callWall?: number;
    putWall?: number;
    absorptionZone?: number;
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function getSpot(state: any): number | undefined {
  const spot =
    (typeof state?.options?.spot === "number" ? state.options.spot : undefined) ??
    (typeof state?.ticker?.price === "number" ? state.ticker.price : undefined) ??
    (typeof state?.market?.spot === "number" ? state.market.spot : undefined);
  return typeof spot === "number" && Number.isFinite(spot) ? spot : undefined;
}

function getPivot(state: any): number | undefined {
  const pivot = state?.positioning?.dealerPivot ?? state?.options?.dealerPivot ?? state?.positioning?.dealer_pivot;
  return isFiniteNumber(pivot) ? pivot : undefined;
}

function getActiveWalls(state: any): { callWall?: number; putWall?: number } {
  const p = state?.positioning ?? {};
  const o = state?.options ?? {};
  const callWall =
    p?.activeCallWall ??
    p?.callWall ??
    o?.activeCallWall ??
    o?.callWall ??
    p?.call_wall ??
    o?.call_wall;
  const putWall =
    p?.activePutWall ??
    p?.putWall ??
    o?.activePutWall ??
    o?.putWall ??
    p?.put_wall ??
    o?.put_wall;
  return { callWall: isFiniteNumber(callWall) ? callWall : undefined, putWall: isFiniteNumber(putWall) ? putWall : undefined };
}

function volatilityExpansionActive(positioning: any): boolean {
  const volExp = positioning?.volatilityExpansionDetector;
  if (!volExp) return false;
  const state = volExp?.volExpansionState;
  const p = volExp?.expansionProbability;
  return state === "EXPANDING" || (typeof p === "number" && p >= 60);
}

function getAbsorptionSignal(positioning: any): any | null {
  const a = positioning?.absorption;
  if (typeof a !== "object" || !a) return null;
  return a;
}

function getAbsorptionRef(absorption: any): number | undefined {
  const ref = absorption?.referencePrice;
  if (isFiniteNumber(ref)) return ref;
  const zl = absorption?.zoneLow;
  const zh = absorption?.zoneHigh;
  if (isFiniteNumber(zl) && isFiniteNumber(zh)) return (zl + zh) / 2;
  return undefined;
}

function rejectionLikely(absorption: any): boolean {
  const rs = absorption?.rejectionScore;
  if (typeof rs === "number" && Number.isFinite(rs)) return rs >= 55;
  const status = absorption?.status;
  return status === "ACTIVE" || status === "CONFIRMED";
}

function levelDistancePct(spot: number, level: number): number {
  return Math.abs(level - spot) / spot;
}

/**
 * Build triggers from the current/previous terminal snapshots.
 * Uses conservative buffers so we don't react to wicks.
 */
export function buildPlaybookStateMachineContext(
  currentState: any,
  prevState: any,
  opts?: { nowMs?: number; lastSwitchAtMs?: number; cooldownMs?: number; nearMinPct?: number; nearMaxPct?: number }
): PlaybookStateMachineContext {
  const nowMs = opts?.nowMs ?? Date.now();
  const lastSwitchAtMs = opts?.lastSwitchAtMs ?? 0;
  const cooldownMs = opts?.cooldownMs ?? 8000;
  const hasPrev = prevState != null && typeof prevState === "object";

  // "Near" band for anticipatory debug.
  // distancePct is in fractional form (e.g., 0.003 = 0.3%).
  const nearMinFrac = typeof opts?.nearMinPct === "number" ? opts.nearMinPct / 100 : 0.003;
  const nearMaxFrac = typeof opts?.nearMaxPct === "number" ? opts.nearMaxPct / 100 : 0.008;

  const spot = getSpot(currentState);
  const prevSpot = getSpot(prevState ?? {});

  const positioning = currentState?.positioning ?? {};
  const prevPositioning = prevState?.positioning ?? {};

  const pivot = getPivot(currentState);
  const prevPivot = getPivot(prevState ?? {});

  const { callWall, putWall } = getActiveWalls(currentState);
  // Prefer "active" walls; if missing, fall back to structural-like fields via same accessor.

  const prevWalls = getActiveWalls(prevState ?? {});
  const prevCallWall = prevWalls.callWall;
  const prevPutWall = prevWalls.putWall;

  // Conservative acceptance buffers (reduce wick/overshoot noise).
  // These are relative multipliers so they scale with spot.
  const EPS_PIVOT_ACCEPT = 0.0010; // 0.10% close/hold confirmation
  const EPS_PIVOT_CROSS = 0.0006; // smaller cross confirmation
  const EPS_WALL_ACCEPT = 0.0015; // stricter acceptance for walls
  const EPS_WALL_CROSS = 0.0008;
  const EPS_WALL_BREAK = 0.0018;
  const EPS_WALL_BREAK_SMALL = 0.0009;

  // Active range margin: fade only when price is clearly inside.
  const RANGE_MARGIN = 0.0010; // 0.10% away from edges

  const pivotRef = isFiniteNumber(pivot) ? pivot : prevPivot;

  // Acceptance confirmation uses two snapshots (prev + current), approximating "hold/close" persistence.
  const acceptanceAbovePivot =
    isFiniteNumber(spot) &&
    isFiniteNumber(pivotRef) &&
    isFiniteNumber(prevSpot) &&
    spot! > pivotRef! * (1 + EPS_PIVOT_ACCEPT) &&
    prevSpot! > pivotRef! * (1 + EPS_PIVOT_ACCEPT * 0.5);

  const acceptanceBelowPivot =
    isFiniteNumber(spot) &&
    isFiniteNumber(pivotRef) &&
    isFiniteNumber(prevSpot) &&
    spot! < pivotRef! * (1 - EPS_PIVOT_ACCEPT) &&
    prevSpot! < pivotRef! * (1 - EPS_PIVOT_ACCEPT * 0.5);

  const acceptanceAboveCallWall =
    isFiniteNumber(spot) &&
    isFiniteNumber(callWall) &&
    isFiniteNumber(prevSpot) &&
    spot! > callWall! * (1 + EPS_WALL_ACCEPT) &&
    prevSpot! > callWall! * (1 + EPS_WALL_ACCEPT * 0.5);

  const acceptanceBelowPutWall =
    isFiniteNumber(spot) &&
    isFiniteNumber(putWall) &&
    isFiniteNumber(prevSpot) &&
    spot! < putWall! * (1 - EPS_WALL_ACCEPT) &&
    prevSpot! < putWall! * (1 - EPS_WALL_ACCEPT * 0.5);

  const acceptanceAboveLevel = !!acceptanceAbovePivot || !!acceptanceAboveCallWall;
  const acceptanceBelowLevel = !!acceptanceBelowPivot || !!acceptanceBelowPutWall;

  const reclaimPivot =
    isFiniteNumber(spot) &&
    isFiniteNumber(pivotRef) &&
    isFiniteNumber(prevSpot) &&
    acceptanceAbovePivot &&
    prevSpot! <= pivotRef! * (1 + EPS_PIVOT_CROSS);

  const losePivot =
    isFiniteNumber(spot) &&
    isFiniteNumber(pivotRef) &&
    isFiniteNumber(prevSpot) &&
    acceptanceBelowPivot &&
    prevSpot! >= pivotRef! * (1 - EPS_PIVOT_CROSS);

  const breakCallWall =
    isFiniteNumber(spot) &&
    isFiniteNumber(callWall) &&
    isFiniteNumber(prevSpot) &&
    acceptanceAboveCallWall &&
    spot! > callWall! * (1 + EPS_WALL_BREAK) &&
    prevSpot! <= callWall! * (1 + EPS_WALL_BREAK_SMALL);

  const breakPutWall =
    isFiniteNumber(spot) &&
    isFiniteNumber(putWall) &&
    isFiniteNumber(prevSpot) &&
    acceptanceBelowPutWall &&
    spot! < putWall! * (1 - EPS_WALL_BREAK) &&
    prevSpot! >= putWall! * (1 - EPS_WALL_BREAK_SMALL);

  const absorption = getAbsorptionSignal(positioning);
  const prevAbsorption = getAbsorptionSignal(prevPositioning);

  const absStatus = absorption?.status ?? "INACTIVE";
  const prevAbsStatus = prevAbsorption?.status ?? "INACTIVE";

  const absRef = absorption ? getAbsorptionRef(absorption) : undefined;
  const prevAbsRef = prevAbsorption ? getAbsorptionRef(prevAbsorption) : undefined;

  const absorptionDetected =
    !!absorption &&
    absStatus !== "INACTIVE" &&
    isFiniteNumber(spot) &&
    isFiniteNumber(absRef) &&
    levelDistancePct(spot!, absRef!) <= 0.055 &&
    // Medium confirmation: absorption must be plausible across consecutive snapshots.
    (prevAbsStatus !== "INACTIVE" || (isFiniteNumber(prevSpot) && isFiniteNumber(prevAbsRef) && levelDistancePct(prevSpot!, prevAbsRef!) <= 0.065));

  const absorptionRejectionNow = absorption ? rejectionLikely(absorption) : false;

  const distanceToPivotFrac =
    isFiniteNumber(spot) && isFiniteNumber(pivotRef) && pivotRef !== 0 ? Math.abs(spot! - pivotRef!) / Math.abs(pivotRef!) : undefined;
  const distanceToCallWallFrac =
    isFiniteNumber(spot) && isFiniteNumber(callWall) && callWall !== 0
      ? Math.abs(spot! - callWall!) / Math.abs(callWall!)
      : undefined;
  const distanceToPutWallFrac =
    isFiniteNumber(spot) && isFiniteNumber(putWall) && putWall !== 0
      ? Math.abs(spot! - putWall!) / Math.abs(putWall!)
      : undefined;
  const distanceToAbsZoneFrac =
    isFiniteNumber(spot) && isFiniteNumber(absRef) && absRef !== 0 ? Math.abs(spot! - absRef!) / Math.abs(absRef!) : undefined;

  const toNearValPct = (distFrac: number | undefined): number | undefined => {
    if (!isFiniteNumber(distFrac as any)) return undefined;
    if (distFrac! < nearMinFrac || distFrac! > nearMaxFrac) return undefined;
    return distFrac! * 100; // return distance %
  };

  const nearTriggers = {
    reclaimPivot: toNearValPct(distanceToPivotFrac),
    breakCallWall: toNearValPct(distanceToCallWallFrac),
    breakPutWall: toNearValPct(distanceToPutWallFrac),
    absorptionZone: toNearValPct(distanceToAbsZoneFrac),
  };

  const nearTriggerLevels = {
    pivot: isFiniteNumber(pivotRef) ? pivotRef : undefined,
    callWall: isFiniteNumber(callWall) ? callWall : undefined,
    putWall: isFiniteNumber(putWall) ? putWall : undefined,
    absorptionZone: isFiniteNumber(absRef) ? absRef : undefined,
  };

  const zl = absorption?.zoneLow;
  const zh = absorption?.zoneHigh;
  const prevZl = prevAbsorption?.zoneLow;
  const prevZh = prevAbsorption?.zoneHigh;

  const zoneLow = isFiniteNumber(zl) ? zl : undefined;
  const zoneHigh = isFiniteNumber(zh) ? zh : undefined;
  const prevZoneLow = isFiniteNumber(prevZl) ? prevZl : undefined;
  const prevZoneHigh = isFiniteNumber(prevZh) ? prevZh : undefined;

  const prevInside =
    isFiniteNumber(prevSpot) &&
    isFiniteNumber(prevZoneLow) &&
    isFiniteNumber(prevZoneHigh) &&
    prevSpot! >= prevZoneLow! * 0.998 &&
    prevSpot! <= prevZoneHigh! * 1.002;

  const currentOutside =
    isFiniteNumber(spot) &&
    isFiniteNumber(zoneLow) &&
    isFiniteNumber(zoneHigh) &&
    (spot! < zoneLow! * 0.998 || spot! > zoneHigh! * 1.002);

  const prevInRangeBox =
    isFiniteNumber(prevSpot) &&
    isFiniteNumber(prevCallWall) &&
    isFiniteNumber(prevPutWall) &&
    prevCallWall! > prevPutWall! &&
    prevSpot! >= prevPutWall! * (1 + RANGE_MARGIN) &&
    prevSpot! <= prevCallWall! * (1 - RANGE_MARGIN);

  const inRangeBox =
    isFiniteNumber(spot) &&
    isFiniteNumber(callWall) &&
    isFiniteNumber(putWall) &&
    callWall! > putWall! &&
    spot! >= putWall! * (1 + RANGE_MARGIN) &&
    spot! <= callWall! * (1 - RANGE_MARGIN);

  // Absorption failed = absorption zone was active, but price left the zone without sustained rejection.
  const absorptionFailed =
    absorptionDetected &&
    prevInside &&
    currentOutside &&
    !absorptionRejectionNow &&
    (absStatus === "ACTIVE" || absStatus === "CONFIRMED" || absStatus === "SETUP");

  // For noise reduction: require persistence for vol expansion + acceleration risk.
  const volatilityExpansionNow = volatilityExpansionActive(positioning);
  const volatilityExpansionPrev = volatilityExpansionActive(prevPositioning);
  const volatilityExpansion = volatilityExpansionNow && (volatilityExpansionPrev || positioning?.volatilityExpansionDetector?.expansionProbability >= 70);

  const accelerationRiskNow = positioning?.dealerHedgingFlowMap?.hedgingAccelerationRisk === "HIGH";
  const accelerationRiskPrev = prevPositioning?.dealerHedgingFlowMap?.hedgingAccelerationRisk === "HIGH";
  const accelerationRiskHigh = accelerationRiskNow && (accelerationRiskPrev || !hasPrev);

  const gammaRegime = currentState?.market?.gammaRegime ?? currentState?.options?.gammaRegime ?? "NEUTRAL";
  const longGammaContext = gammaRegime === "LONG GAMMA";

  const nearCallWall = isFiniteNumber(spot) && isFiniteNumber(callWall) ? levelDistancePct(spot, callWall) <= 0.0028 : false;
  const nearPutWall = isFiniteNumber(spot) && isFiniteNumber(putWall) ? levelDistancePct(spot, putWall) <= 0.0028 : false;

  // Invalidation paths (for stability).
  const breakoutInvalidated =
    isFiniteNumber(spot) && isFiniteNumber(callWall) && isFiniteNumber(prevSpot) && prevSpot! >= callWall! * (1 - RANGE_MARGIN * 0.5) && spot! < callWall! * (1 - RANGE_MARGIN);
  const breakdownInvalidated =
    isFiniteNumber(spot) && isFiniteNumber(putWall) && isFiniteNumber(prevSpot) && prevSpot! <= putWall! * (1 + RANGE_MARGIN * 0.5) && spot! > putWall! * (1 + RANGE_MARGIN);

  const fadeInvalidated =
    isFiniteNumber(spot) &&
    isFiniteNumber(callWall) &&
    isFiniteNumber(putWall) &&
    prevInRangeBox &&
    (spot! > callWall! * (1 + RANGE_MARGIN) || spot! < putWall! * (1 - RANGE_MARGIN));

  const reversalInvalidated = !absorptionDetected || !absorptionRejectionNow;
  const accelerationInvalidated = !volatilityExpansion || (!acceptanceAboveCallWall && !acceptanceBelowPutWall);

  return {
    nowMs,
    lastSwitchAtMs,
    cooldownMs,
    reclaimPivot: !!reclaimPivot,
    losePivot: !!losePivot,
    breakCallWall: !!breakCallWall,
    breakPutWall: !!breakPutWall,
    acceptanceAboveLevel: !!acceptanceAboveLevel,
    acceptanceBelowLevel: !!acceptanceBelowLevel,
    absorptionDetected: !!absorptionDetected,
    absorptionFailed: !!absorptionFailed,
    volatilityExpansion: !!volatilityExpansion,
    accelerationRiskHigh: !!accelerationRiskHigh,
    longGammaContext: !!longGammaContext,
    nearCallWall: !!nearCallWall,
    nearPutWall: !!nearPutWall,
    inRangeBox: !!inRangeBox,
    absorptionRejectionNow: !!absorptionRejectionNow,
    prevInRangeBox: !!prevInRangeBox,
    breakoutInvalidated: !!breakoutInvalidated,
    breakdownInvalidated: !!breakdownInvalidated,
    fadeInvalidated: !!fadeInvalidated,
    reversalInvalidated: !!reversalInvalidated,
    accelerationInvalidated: !!accelerationInvalidated,

    nearTriggers,
    nearTriggerLevels,
  };
}

/**
 * Finite-state machine: switch strategies when the key market triggers confirm.
 * Designed to be stable (acceptance + cooldown) and fast (few triggers).
 */
export interface PlaybookStateMachineDebug {
  previousState: string;
  nextState: string;
  winningTrigger: string | null;
  blockedTriggers: string[];
  acceptancePassed: boolean;
  cooldownActive: boolean;
  inRangeBox?: boolean;
  nearCallWall?: boolean;
  nearPutWall?: boolean;
  reclaimPivot?: boolean;
  losePivot?: boolean;
  breakCallWall?: boolean;
  breakPutWall?: boolean;
  absorptionDetected?: boolean;
  absorptionFailed?: boolean;
  volatilityExpansion?: boolean;
  timestamp: number;
  // Extra detail (optional but useful when calibrating buffers)
  cooldownMsRequired?: number;
  nearTriggers?: {
    reclaimPivot?: number;
    breakCallWall?: number;
    breakPutWall?: number;
    absorptionZone?: number;
  };
  nearTriggerLevels?: {
    pivot?: number;
    callWall?: number;
    putWall?: number;
    absorptionZone?: number;
  };
}

function getStateCooldownMs(state: PlaybookState, baseCooldownMs: number): number {
  switch (state) {
    case "BREAKOUT":
    case "BREAKDOWN":
      return Math.round(baseCooldownMs * 1.5); // longer to prevent immediate revert
    case "REVERSAL":
      return Math.round(baseCooldownMs * 1.25);
    case "FADE_EXTREMES":
      return Math.round(baseCooldownMs * 1.1);
    case "ACCELERATION":
      return Math.round(baseCooldownMs * 1.0);
    case "NO_TRADE":
    default:
      return Math.round(baseCooldownMs * 0.6);
  }
}

export function updatePlaybookStateWithDebug(
  currentState: PlaybookState,
  context: PlaybookStateMachineContext
): { nextState: PlaybookState; debug: PlaybookStateMachineDebug } {
  const upBreakout = context.breakCallWall && context.acceptanceAboveLevel;
  const downBreakdown = context.breakPutWall && context.acceptanceBelowLevel;

  const breakoutCandidate = upBreakout || (context.reclaimPivot && context.acceptanceAboveLevel);
  const breakdownCandidate = downBreakdown || (context.losePivot && context.acceptanceBelowLevel);
  const accelerationCandidate = context.accelerationRiskHigh && context.volatilityExpansion && (breakoutCandidate || breakdownCandidate);
  const reversalCandidate =
    context.absorptionDetected &&
    !context.absorptionFailed &&
    context.absorptionRejectionNow &&
    context.inRangeBox &&
    !context.prevInRangeBox; // require return inside structure
  const fadeCandidate =
    !context.volatilityExpansion &&
    context.longGammaContext &&
    context.inRangeBox &&
    (context.nearPutWall || context.nearCallWall) &&
    !context.absorptionDetected; // keep reversal separate

  const candidates: Array<{ state: PlaybookState; priority: number; trigger: string; ok: boolean }> = [
    { state: breakoutCandidate ? "BREAKOUT" : "BREAKOUT", priority: 1, trigger: "breakout", ok: breakoutCandidate },
    { state: breakdownCandidate ? "BREAKDOWN" : "BREAKDOWN", priority: 1, trigger: "breakdown", ok: breakdownCandidate },
    { state: "ACCELERATION", priority: 2, trigger: "acceleration", ok: accelerationCandidate },
    { state: "REVERSAL", priority: 3, trigger: "reversal", ok: reversalCandidate },
    { state: "FADE_EXTREMES", priority: 4, trigger: "fade_extremes", ok: fadeCandidate },
    { state: "NO_TRADE", priority: 5, trigger: "fallback", ok: true },
  ];

  const cooldownMsRequired = getStateCooldownMs(currentState, context.cooldownMs);
  const cooldownActive = context.nowMs - context.lastSwitchAtMs < cooldownMsRequired;

  const currentInvalidated =
    currentState === "BREAKOUT"
      ? context.breakoutInvalidated
      : currentState === "BREAKDOWN"
        ? context.breakdownInvalidated
        : currentState === "FADE_EXTREMES"
          ? context.fadeInvalidated
          : currentState === "REVERSAL"
            ? context.reversalInvalidated
            : currentState === "ACCELERATION"
              ? context.accelerationInvalidated
              : false;

  const blockedTriggers: Array<{ trigger: string; reason: string }> = [];
  const acceptancePassed = context.acceptanceAboveLevel || context.acceptanceBelowLevel;

  const buildDebug = (nextState: PlaybookState, winningTrigger: string | null): PlaybookStateMachineDebug => ({
    previousState: currentState,
    nextState,
    winningTrigger,
    blockedTriggers: blockedTriggers.map((bt) => `${bt.trigger} (${bt.reason})`),
    acceptancePassed,
    cooldownActive,
    cooldownMsRequired,
    inRangeBox: context.inRangeBox,
    nearCallWall: context.nearCallWall,
    nearPutWall: context.nearPutWall,
    reclaimPivot: context.reclaimPivot,
    losePivot: context.losePivot,
    breakCallWall: context.breakCallWall,
    breakPutWall: context.breakPutWall,
    absorptionDetected: context.absorptionDetected,
    absorptionFailed: context.absorptionFailed,
    volatilityExpansion: context.volatilityExpansion,
    timestamp: context.nowMs,
    nearTriggers: context.nearTriggers,
    nearTriggerLevels: context.nearTriggerLevels,
  });

  const choose = (): { state: PlaybookState; trigger: string } => {
    // Priority: BREAKOUT/BREAKDOWN > ACCELERATION > REVERSAL > FADE_EXTREMES > NO_TRADE
    const ordered = [...candidates].sort((a, b) => a.priority - b.priority);

    // Resolve conflicting #1 candidates with deterministic direction preference.
    if (upBreakout) return { state: "BREAKOUT", trigger: "breakCallWall+acceptAbove" };
    if (downBreakdown) return { state: "BREAKDOWN", trigger: "breakPutWall+acceptBelow" };

    const first = ordered.find((c) => c.ok && c.state !== "NO_TRADE");
    if (first && first.state !== "NO_TRADE") return { state: first.state, trigger: first.trigger };
    return { state: "NO_TRADE", trigger: "fallback" };
  };

  const winning = choose();

  // Stability gating: prevent immediate reverts without invalidation.
  if (!cooldownActive && !currentInvalidated) {
    // no-op; allow normal switching
  }

  const blockBecauseCooldown = cooldownActive && !currentInvalidated;

  if (blockBecauseCooldown) {
    // Allow only the strongest structural move to punch through cooldown.
    if (!winning.state || (winning.state !== "BREAKOUT" && winning.state !== "BREAKDOWN" && winning.state !== "ACCELERATION")) {
      blockedTriggers.push({ trigger: winning.trigger, reason: "cooldown active" });
      return {
        nextState: currentState,
        debug: buildDebug(currentState, null),
      };
    }
  }

  if (currentState === "BREAKOUT" && !context.breakoutInvalidated) {
    // Cannot flip into breakdown/no-trade without clean invalidation.
    if (winning.state === "BREAKDOWN" || winning.state === "NO_TRADE" || winning.state === "REVERSAL" || winning.state === "FADE_EXTREMES") {
      blockedTriggers.push({ trigger: "breakdown/revert", reason: "BREAKOUT not invalidated" });
      return {
        nextState: currentState,
        debug: buildDebug(currentState, null),
      };
    }
  }

  if (currentState === "BREAKDOWN" && !context.breakdownInvalidated) {
    if (winning.state === "BREAKOUT" || winning.state === "NO_TRADE" || winning.state === "REVERSAL" || winning.state === "FADE_EXTREMES") {
      blockedTriggers.push({ trigger: "breakup/revert", reason: "BREAKDOWN not invalidated" });
      return {
        nextState: currentState,
        debug: buildDebug(currentState, null),
      };
    }
  }

  if (currentState === "FADE_EXTREMES" && !context.fadeInvalidated) {
    if (winning.state === "NO_TRADE") {
      blockedTriggers.push({ trigger: "fallback", reason: "FADE_EXTREMES not invalidated (avoid oscillation)" });
      return {
        nextState: currentState,
          debug: buildDebug(currentState, null),
      };
    }
  }

  if (currentState === "REVERSAL" && !context.reversalInvalidated) {
    if (winning.state === "NO_TRADE" || winning.state === "FADE_EXTREMES") {
      blockedTriggers.push({ trigger: "revert", reason: "REVERSAL rejection structure still valid" });
      return {
        nextState: currentState,
        debug: buildDebug(currentState, null),
      };
    }
  }

  if (currentState === "ACCELERATION" && !context.accelerationInvalidated) {
    if (winning.state === "NO_TRADE" || winning.state === "REVERSAL" || winning.state === "FADE_EXTREMES") {
      blockedTriggers.push({ trigger: "accel_stability", reason: "ACCELERATION follow-through still valid" });
      return {
        nextState: currentState,
        debug: buildDebug(currentState, null),
      };
    }
  }

  const stateChanged = winning.state !== currentState;
  return {
    nextState: winning.state,
    debug: buildDebug(winning.state, stateChanged ? winning.trigger : null),
  };
}

export function updatePlaybookState(currentState: PlaybookState, context: PlaybookStateMachineContext): PlaybookState {
  return updatePlaybookStateWithDebug(currentState, context).nextState;
}

