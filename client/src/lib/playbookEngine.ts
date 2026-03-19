import type { PlaybookState } from "./playbookStateMachine";
import { buildPlaybookStateMachineContext } from "./playbookStateMachine";

export interface Playbook {
  setup: string;
  confidence: number; // 0-100
  bias: string;
  entry: string;
  target: string;
  invalidation: string;
  notes?: string;
  preSetup?: PreSetup;
  /** Actionable conditions to wait for when not trading (NO_TRADE / WAIT_FOR_BREAK). */
  waitFor?: string[];
  /** Why flat / no edge (NO_TRADE / WAIT_FOR_BREAK). */
  whyNoTrade?: string;
  /** Intraday horizon label. */
  horizon?: string;
}

export interface PreSetup {
  type: "PRE_BREAKOUT" | "PRE_BREAKDOWN" | "PRE_FADE_LONG" | "PRE_FADE_SHORT" | string;
  status: "WATCHING";
  triggerZone: string;
  confirmationNeeded: string[];
  action: string;
}

/** Structural / dealer context (macro to session). Not primary for execution copy. */
export interface StructuralPlaybookContext {
  gammaState: string;
  gammaFlip?: number;
  flipSessionRelevant: boolean;
  vannaBias: string;
  charmBias: string;
  structuralCallWall?: number;
  structuralPutWall?: number;
}

/** Session execution neighborhood around spot (this session / next few hours). */
export interface SessionPlaybookContext {
  spot?: number;
  /** Nearest resistance above spot (active wall preferred if in band). */
  sessionCallAbove?: number;
  /** Nearest support below spot. */
  sessionPutBelow?: number;
  /** Largest call strike below spot that spot is holding above (breakout ref). */
  clearedCallWall?: number;
  /** Smallest put strike above spot that spot is holding below. */
  clearedPutWall?: number;
  sessionPivot?: number;
  absorptionRef?: number;
  absorptionZoneLow?: number;
  absorptionZoneHigh?: number;
  nearestMagnet?: number;
  intradayHigh?: number;
  intradayLow?: number;
  volSessionLabel: string;
}

/** ~4.5% — tight session relevance */
const SESSION_TIGHT_PCT = 0.045;
/** ~8% — extended intraday band */
const SESSION_EXTENDED_PCT = 0.08;
/** Gamma flip mention only if within this of spot */
const FLIP_RELEVANT_PCT = 0.06;
/** Max breakout reference distance from spot */
const BREAKOUT_WALL_MAX_PCT = 0.12;

type GammaRegime = "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | string;

type StructureTag = "RANGE" | "BREAKOUT" | "ACCELERATION" | "TRANSITION";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtK(n: number) {
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function getSpot(state: any): number | undefined {
  const spot =
    (typeof state?.options?.spot === "number" ? state.options.spot : undefined) ??
    (typeof state?.ticker?.price === "number" ? state.ticker.price : undefined) ??
    (typeof state?.market?.spot === "number" ? state.market.spot : undefined);
  return typeof spot === "number" && Number.isFinite(spot) ? spot : undefined;
}

function getMarketGammaRegime(state: any): GammaRegime | undefined {
  const v =
    (typeof state?.market?.gammaRegime === "string" ? state.market.gammaRegime : undefined) ??
    (typeof state?.options?.gammaRegime === "string" ? state.options.gammaRegime : undefined);
  return v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNearPrice(spot: number | undefined, target: number | undefined, pct: number) {
  if (!isFiniteNumber(spot) || !isFiniteNumber(target) || spot === 0) return false;
  return Math.abs(spot - target) / spot <= pct;
}

function deriveStructureTag(positioning: any, market: any): StructureTag {
  const squeeze = positioning?.squeezeProbabilityEngine;
  const cascade = positioning?.liquidityCascadeEngine;
  const bias = positioning?.institutionalBiasEngine;
  const volExp = positioning?.volatilityExpansionDetector;

  const squeezeRisk = squeeze?.squeezeProbability;
  if (typeof squeezeRisk === "number" && squeezeRisk >= 60) return "BREAKOUT";
  if (cascade?.cascadeRisk === "EXTREME") return "BREAKOUT";

  const volState = volExp?.volExpansionState;
  const expansionProb = volExp?.expansionProbability;
  const volExpanding =
    volState === "EXPANDING" || (typeof expansionProb === "number" && expansionProb >= 60) || bias?.institutionalBias?.includes("EXPANSION");
  if (volExpanding) return "BREAKOUT";

  const gammaRegime = market?.gammaRegime;
  if (bias?.institutionalBias === "FRAGILE_TRANSITION" || gammaRegime === "TRANSITION") return "TRANSITION";

  // "Acceleration" is treated separately via hedging flow risk
  const accelRisk = positioning?.dealerHedgingFlowMap?.hedgingAccelerationRisk;
  if (accelRisk === "HIGH") return "ACCELERATION";

  return "RANGE";
}

function getVolatilityExpansionActive(positioning: any): boolean {
  const volExp = positioning?.volatilityExpansionDetector;
  if (!volExp) return false;
  const state = volExp?.volExpansionState;
  const p = volExp?.expansionProbability;
  return state === "EXPANDING" || (typeof p === "number" && p >= 60);
}

function getAbsorptionSignal(positioning: any): any | null {
  const a = positioning?.absorption;
  return typeof a === "object" && a ? a : null;
}

function getAbsorptionLevel(absorption: any): number | undefined {
  // Prefer referencePrice. Fall back to zone mid.
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
  // Fallback: ACTIVE/CONFIRMED with any non-trivial score.
  const status = absorption?.status;
  return status === "ACTIVE" || status === "CONFIRMED";
}

function mapBiasFromSide(side: string | undefined): string {
  if (!side) return "NEUTRAL";
  if (side === "BUY_ABSORPTION") return "BULLISH";
  if (side === "SELL_ABSORPTION") return "BEARISH";
  return "NEUTRAL";
}

function flowSupportsDirection(state: any, bias: string): boolean {
  const vannaBias = state?.exposure?.vannaBias;
  const charmBias = state?.exposure?.charmBias;
  if (!vannaBias && !charmBias) return false;
  if (bias === "BULLISH") return vannaBias === "BULLISH" || charmBias === "BULLISH";
  if (bias === "BEARISH") return vannaBias === "BEARISH" || charmBias === "BEARISH";
  return false;
}

function levelDistancePct(spot: number, level: number): number {
  return Math.abs(level - spot) / spot;
}

export function buildStructuralContext(state: any, spot?: number): StructuralPlaybookContext {
  const market = state?.market ?? {};
  const options = state?.options ?? {};
  const exposure = state?.exposure ?? {};
  const positioning = state?.positioning ?? {};
  const gammaState =
    (typeof market?.gammaRegime === "string" ? market.gammaRegime : undefined) ??
    (typeof options?.gammaRegime === "string" ? options.gammaRegime : undefined) ??
    "—";
  const gammaFlip =
    (isFiniteNumber(market?.gammaFlip) ? market.gammaFlip : undefined) ??
    (isFiniteNumber(options?.gammaFlip) ? options.gammaFlip : undefined);
  const flipSessionRelevant =
    isFiniteNumber(spot) && isFiniteNumber(gammaFlip) ? levelDistancePct(spot!, gammaFlip!) <= FLIP_RELEVANT_PCT : false;

  return {
    gammaState,
    gammaFlip,
    flipSessionRelevant,
    vannaBias: exposure?.vannaBias ?? "—",
    charmBias: exposure?.charmBias ?? "—",
    structuralCallWall: positioning?.callWall ?? options?.callWall,
    structuralPutWall: positioning?.putWall ?? options?.putWall,
  };
}

function volSessionLabel(positioning: any): string {
  if (getVolatilityExpansionActive(positioning)) return "Expanding (session)";
  const p = positioning?.volatilityExpansionDetector?.expansionProbability;
  if (typeof p === "number" && p >= 45) return "Elevated vol";
  return "Contained";
}

export function buildSessionContext(state: any): SessionPlaybookContext {
  const positioning = state?.positioning ?? {};
  const market = state?.market ?? {};
  const levels = state?.levels ?? {};
  const options = state?.options ?? {};
  const spot = getSpot(state);
  const absorption = getAbsorptionSignal(positioning);
  const absRef = absorption ? getAbsorptionLevel(absorption) : undefined;
  const zl = absorption?.zoneLow;
  const zh = absorption?.zoneHigh;

  const out: SessionPlaybookContext = {
    volSessionLabel: volSessionLabel(positioning),
  };
  if (isFiniteNumber(spot)) out.spot = spot;

  const pivot = positioning?.dealerPivot ?? options?.dealerPivot;
  if (isFiniteNumber(pivot) && isFiniteNumber(spot) && levelDistancePct(spot!, pivot!) <= SESSION_EXTENDED_PCT) {
    out.sessionPivot = pivot;
  } else if (isFiniteNumber(pivot) && isFiniteNumber(spot) && levelDistancePct(spot!, pivot!) <= 0.1) {
    out.sessionPivot = pivot;
  }

  type Cand = { p: number; dist: number; active: boolean };
  const resistanceCands: Cand[] = [];
  const addRes = (p: unknown, active: boolean) => {
    if (!isFiniteNumber(p) || !isFiniteNumber(spot) || p <= spot!) return;
    const d = (p - spot!) / spot!;
    if (d > SESSION_EXTENDED_PCT) return;
    resistanceCands.push({ p, dist: d, active });
  };
  addRes(positioning?.activeCallWall, true);
  addRes(options?.callWall, false);
  addRes(positioning?.callWall, false);
  resistanceCands.sort((a, b) => a.dist - b.dist || (b.active ? 1 : 0) - (a.active ? 1 : 0));
  if (resistanceCands[0]) out.sessionCallAbove = resistanceCands[0].p;

  const supportCands: Cand[] = [];
  const addSup = (p: unknown, active: boolean) => {
    if (!isFiniteNumber(p) || !isFiniteNumber(spot) || p >= spot!) return;
    const d = (spot! - p) / spot!;
    if (d > SESSION_EXTENDED_PCT) return;
    supportCands.push({ p, dist: d, active });
  };
  addSup(positioning?.activePutWall, true);
  addSup(options?.putWall, false);
  addSup(positioning?.putWall, false);
  supportCands.sort((a, b) => a.dist - b.dist || (b.active ? 1 : 0) - (a.active ? 1 : 0));
  if (supportCands[0]) out.sessionPutBelow = supportCands[0].p;

  if (isFiniteNumber(spot)) {
    const callRefs = [positioning?.activeCallWall, options?.callWall, positioning?.callWall].filter(
      (x): x is number => isFiniteNumber(x) && x < spot!
    ) as number[];
    const belowSpotCalls = callRefs.filter((p) => (spot! - p) / spot! <= BREAKOUT_WALL_MAX_PCT);
    if (belowSpotCalls.length) out.clearedCallWall = Math.max(...belowSpotCalls);

    const putRefs = [positioning?.activePutWall, options?.putWall, positioning?.putWall].filter(
      (x): x is number => isFiniteNumber(x) && x > spot!
    ) as number[];
    const aboveSpotPuts = putRefs.filter((p) => (p - spot!) / spot! <= BREAKOUT_WALL_MAX_PCT);
    if (aboveSpotPuts.length) out.clearedPutWall = Math.min(...aboveSpotPuts);
  }

  if (isFiniteNumber(spot) && isFiniteNumber(absRef) && levelDistancePct(spot!, absRef!) <= SESSION_EXTENDED_PCT) {
    out.absorptionRef = absRef;
  }
  if (isFiniteNumber(spot) && isFiniteNumber(zl) && isFiniteNumber(zh)) {
    const mid = (zl! + zh!) / 2;
    if (levelDistancePct(spot!, mid) <= SESSION_EXTENDED_PCT) {
      out.absorptionZoneLow = zl!;
      out.absorptionZoneHigh = zh!;
    }
  }

  if (isFiniteNumber(spot)) {
    const magnets: number[] = Array.isArray(levels?.gammaMagnets)
      ? (levels.gammaMagnets as unknown[]).filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      : [];
    let best: { p: number; d: number } | undefined;
    for (const m of magnets) {
      const d = levelDistancePct(spot!, m);
      if (d <= SESSION_TIGHT_PCT && (!best || d < best.d)) best = { p: m, d };
    }
    if (best) out.nearestMagnet = best.p;
  }

  if (isFiniteNumber(out.sessionPutBelow) && isFiniteNumber(out.sessionCallAbove)) {
    out.intradayLow = out.sessionPutBelow;
    out.intradayHigh = out.sessionCallAbove;
  }

  return out;
}

/** Max 3 session-scoped wait triggers. */
export function buildSessionWaitConditions(sess: SessionPlaybookContext, struct: StructuralPlaybookContext): string[] {
  const spot = sess.spot;
  const out: string[] = [];

  if (isFiniteNumber(spot) && isFiniteNumber(sess.sessionPivot)) {
    if (spot! < sess.sessionPivot!) out.push(`Reclaim ${fmtK(sess.sessionPivot!)} pivot`);
    else if (spot! > sess.sessionPivot!) out.push(`Lose ${fmtK(sess.sessionPivot!)} pivot`);
    else out.push(`Break from ${fmtK(sess.sessionPivot!)} pivot with follow-through`);
  }

  if (isFiniteNumber(sess.sessionCallAbove)) {
    out.push(`Acceptance above ${fmtK(sess.sessionCallAbove!)} (session call)`);
  }
  if (isFiniteNumber(sess.sessionPutBelow)) {
    out.push(`Break below ${fmtK(sess.sessionPutBelow!)} (session put)`);
  }

  if (sess.absorptionZoneLow != null && sess.absorptionZoneHigh != null) {
    out.push(`Loss of absorption zone ${fmtK(sess.absorptionZoneLow)}–${fmtK(sess.absorptionZoneHigh)}`);
  } else if (isFiniteNumber(sess.absorptionRef)) {
    out.push(`Loss of hold near absorption ${fmtK(sess.absorptionRef!)}`);
  }

  // Dedupe, max 3
  const seen = new Set<string>();
  const deduped = out.filter((s) => {
    const k = s.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (deduped.length <= 3) return deduped;

  // Prioritize: pivot, then one wall, then absorption
  const priority: string[] = [];
  const pivotLine = deduped.find((s) => s.includes("pivot"));
  if (pivotLine) priority.push(pivotLine);
  const callLine = deduped.find((s) => s.includes("session call"));
  const putLine = deduped.find((s) => s.includes("session put"));
  if (callLine) priority.push(callLine);
  else if (putLine) priority.push(putLine);
  const absLine = deduped.find((s) => s.includes("absorption"));
  if (absLine && priority.length < 3) priority.push(absLine);
  for (const s of deduped) {
    if (priority.length >= 3) break;
    if (!priority.includes(s)) priority.push(s);
  }
  return priority.slice(0, 3);
}

function buildSessionWaitFromState(state: any): string[] {
  const sess = buildSessionContext(state);
  const struct = buildStructuralContext(state, sess.spot);
  const absorption = getAbsorptionSignal(state?.positioning ?? {});
  if (absorption && sess.absorptionRef == null && isFiniteNumber(sess.spot)) {
    const zl = absorption.zoneLow;
    const zh = absorption.zoneHigh;
    const mid =
      isFiniteNumber(zl) && isFiniteNumber(zh) ? (zl! + zh!) / 2 : getAbsorptionLevel(absorption);
    if (isFiniteNumber(mid) && isFiniteNumber(sess.spot) && levelDistancePct(sess.spot!, mid!) <= SESSION_EXTENDED_PCT) {
      sess.absorptionZoneLow = isFiniteNumber(zl) ? zl! : undefined;
      sess.absorptionZoneHigh = isFiniteNumber(zh) ? zh! : undefined;
      sess.absorptionRef = isFiniteNumber(mid) ? mid : sess.absorptionRef;
    }
  }
  let wf = buildSessionWaitConditions(sess, struct);
  if (wf.length === 0 && isFiniteNumber(sess.spot)) {
    wf = [
      `Reclaim ${fmtK(sess.sessionPivot ?? sess.spot!)} (pivot/spot)`,
      sess.sessionCallAbove ? `Acceptance above ${fmtK(sess.sessionCallAbove)}` : "Define nearest session resistance",
      sess.sessionPutBelow ? `Break below ${fmtK(sess.sessionPutBelow)}` : "Define nearest session support",
    ].filter((s, i, a) => a.indexOf(s) === i);
  }
  return wf.slice(0, 3);
}

function buildWhyNoTrade(state: any, sess: SessionPlaybookContext, struct: StructuralPlaybookContext): string {
  const parts: string[] = [];
  parts.push("No clear session edge:");
  if (sess.volSessionLabel.includes("Expanding") || sess.volSessionLabel.includes("Elevated")) {
    parts.push("vol is hot but direction/levels are not clean");
  } else {
    parts.push("price is not at a clean session trigger (walls/pivot/absorption)");
  }
  if (struct.flipSessionRelevant && isFiniteNumber(struct.gammaFlip)) {
    parts.push(`flip ${fmtK(struct.gammaFlip!)} is nearby structurally`);
  }
  return parts.join(" ");
}

function sessionTargetLine(sess: SessionPlaybookContext, direction: "UP" | "DOWN"): string {
  const parts: string[] = [];
  if (isFiniteNumber(sess.sessionPivot)) parts.push(`Pivot ${fmtK(sess.sessionPivot!)}`);
  if (direction === "UP" && isFiniteNumber(sess.sessionCallAbove)) parts.push(`Session call ${fmtK(sess.sessionCallAbove!)}`);
  if (direction === "DOWN" && isFiniteNumber(sess.sessionPutBelow)) parts.push(`Session put ${fmtK(sess.sessionPutBelow!)}`);
  if (isFiniteNumber(sess.absorptionRef)) parts.push(`Absorption ${fmtK(sess.absorptionRef!)}`);
  if (isFiniteNumber(sess.nearestMagnet)) parts.push(`Magnet ${fmtK(sess.nearestMagnet!)}`);
  if (direction === "UP" && isFiniteNumber(sess.sessionPutBelow)) parts.push(`Opposite: put ${fmtK(sess.sessionPutBelow!)}`);
  if (direction === "DOWN" && isFiniteNumber(sess.sessionCallAbove)) parts.push(`Opposite: call ${fmtK(sess.sessionCallAbove!)}`);
  const uniq = [...new Set(parts)];
  return uniq.slice(0, 4).join(" · ");
}

function structuralDeskNote(struct: StructuralPlaybookContext, sess: SessionPlaybookContext): string {
  const flip =
    struct.flipSessionRelevant && isFiniteNumber(struct.gammaFlip)
      ? `Flip ~${fmtK(struct.gammaFlip!)}. `
      : "";
  return `${flip}${struct.gammaState} · Vanna ${struct.vannaBias} / Charm ${struct.charmBias} · ${sess.volSessionLabel}`.trim();
}

function fmtPreZone(label: string, level?: number): string {
  if (!isFiniteNumber(level)) return label;
  return `${label} ${fmtK(level)}`;
}

function inferPreSetup(
  currentState: any,
  prevState: any,
  structureTag: StructureTag,
  volActive: boolean
): PreSetup | undefined {
  const positioning = currentState?.positioning ?? {};
  const market = currentState?.market ?? {};

  const smCtx = buildPlaybookStateMachineContext(currentState, prevState ?? {}, {
    nowMs: Date.now(),
    lastSwitchAtMs: 0,
    cooldownMs: 0,
    nearMinPct: 0.3,
    nearMaxPct: 0.8,
  });

  const near = smCtx.nearTriggers ?? {};
  const nearLevels = smCtx.nearTriggerLevels ?? {};

  const absorption = getAbsorptionSignal(positioning);
  const absorptionBias = absorption ? mapBiasFromSide(absorption.side) : "NEUTRAL";

  const volBias = smCtx.volatilityExpansion || structureTag === "BREAKOUT" || volActive;

  type Cand = {
    type: PreSetup["type"];
    priority: 1 | 2;
    distPct: number;
    triggerZone: string;
    confirmationNeeded: string[];
    action: string;
  };

  const cands: Cand[] = [];

  // PRE_BREAKOUT
  {
    const distPivot = typeof near.reclaimPivot === "number" ? near.reclaimPivot : Infinity;
    const distCall = typeof near.breakCallWall === "number" ? near.breakCallWall : Infinity;
    const hasNear = isFiniteNumber(distPivot) || isFiniteNumber(distCall) || near.reclaimPivot != null || near.breakCallWall != null;
    if (hasNear && volBias && !smCtx.reclaimPivot && !smCtx.breakCallWall) {
      const usePivot = distPivot <= distCall;
      const pivot = nearLevels.pivot;
      const callWall = nearLevels.callWall;
      const triggerZone = usePivot ? fmtPreZone("Pivot", pivot) : fmtPreZone("Call Wall", callWall);
      const confirmationNeeded = usePivot
        ? [`Reclaim ${fmtK(pivot ?? 0)} (close/hold)`, `Acceptance above call wall (break + hold)`]
        : [`Acceptance above call wall (break + hold)`, `Breakout confirmation (follow-through)`];
      const action = "Watching long breakout: only switch on acceptance + hold above the trigger.";
      cands.push({
        type: "PRE_BREAKOUT",
        priority: 1,
        distPct: Math.min(distPivot, distCall),
        triggerZone,
        confirmationNeeded,
        action,
      });
    }
  }

  // PRE_BREAKDOWN
  {
    const distPut = typeof near.breakPutWall === "number" ? near.breakPutWall : Infinity;
    const distAbs = typeof near.absorptionZone === "number" ? near.absorptionZone : Infinity;
    const hasNear = distPut !== Infinity || distAbs !== Infinity;
    const downsidePressure = absorptionBias === "BEARISH" || flowSupportsDirection(currentState, "BEARISH");
    if (hasNear && downsidePressure && !smCtx.losePivot && !smCtx.breakPutWall) {
      const useAbs = distAbs <= distPut;
      const putWall = nearLevels.putWall;
      const absZone = nearLevels.absorptionZone;
      const triggerZone = useAbs ? fmtPreZone("Absorption", absZone) : fmtPreZone("Put Wall", putWall);
      const confirmationNeeded = useAbs
        ? [`Absorption rejection persists (hold below zone)`, `Acceptance below put wall (break + hold)`]
        : [`Acceptance below put wall (break + hold)`, `Breakdown confirmation (follow-through)`];
      const action = "Watching breakdown: prepare shorts only if put-wall acceptance arrives.";
      cands.push({
        type: "PRE_BREAKDOWN",
        priority: 1,
        distPct: Math.min(distPut, distAbs),
        triggerZone,
        confirmationNeeded,
        action,
      });
    }
  }

  // PRE_FADE_LONG
  {
    const nearPut = typeof near.breakPutWall === "number" ? near.breakPutWall : undefined;
    const nearAbs = typeof near.absorptionZone === "number" ? near.absorptionZone : undefined;
    if (
      smCtx.longGammaContext &&
      smCtx.inRangeBox &&
      !smCtx.volatilityExpansion &&
      (nearPut != null || nearAbs != null) &&
      !smCtx.breakPutWall
    ) {
      const useAbs = (nearAbs ?? Infinity) <= (nearPut ?? Infinity);
      const putWall = nearLevels.putWall;
      const absZone = nearLevels.absorptionZone;
      const distPct = useAbs ? (nearAbs as number) : (nearPut as number);
      const triggerZone = useAbs ? fmtPreZone("Absorption", absZone) : fmtPreZone("Put Wall", putWall);
      const confirmationNeeded = [
        "Rejection from put/support (hold back inside range)",
        "No clean breakdown acceptance",
      ];
      const action = "Watching fade-long: wait for put rejection, then work back toward pivot/magnet.";
      cands.push({
        type: "PRE_FADE_LONG",
        priority: 2,
        distPct,
        triggerZone,
        confirmationNeeded,
        action,
      });
    }
  }

  // PRE_FADE_SHORT
  {
    const nearCall = typeof near.breakCallWall === "number" ? near.breakCallWall : undefined;
    const nearPivot = typeof near.reclaimPivot === "number" ? near.reclaimPivot : undefined;
    if (
      smCtx.longGammaContext &&
      smCtx.inRangeBox &&
      !smCtx.volatilityExpansion &&
      (nearCall != null || nearPivot != null) &&
      !smCtx.breakCallWall
    ) {
      const useCall = (nearCall ?? Infinity) <= (nearPivot ?? Infinity);
      const callWall = nearLevels.callWall;
      const pivot = nearLevels.pivot;
      const distPct = useCall ? (nearCall as number) : (nearPivot as number);
      const triggerZone = useCall ? fmtPreZone("Call Wall", callWall) : fmtPreZone("Pivot", pivot);
      const confirmationNeeded = [
        "Rejection from call/resistance (hold back inside range)",
        "No clean breakout acceptance",
      ];
      const action = "Watching fade-short: wait for call rejection, then fade back toward pivot/magnet.";
      cands.push({
        type: "PRE_FADE_SHORT",
        priority: 2,
        distPct,
        triggerZone,
        confirmationNeeded,
        action,
      });
    }
  }

  if (cands.length === 0) return undefined;
  // Priority group then closest-to-spot wins.
  cands.sort((a, b) => a.priority - b.priority || a.distPct - b.distPct);
  return {
    ...cands[0],
    status: "WATCHING",
  };
}

function sessionBreakoutUp(
  volActive: boolean,
  spot: number | undefined,
  currentState: any,
  prevState: any | undefined,
  struct: StructuralPlaybookContext
): boolean {
  if (!volActive || !isFiniteNumber(spot)) return false;
  const prevSess = prevState ? buildSessionContext(prevState) : null;
  const prevSpot = getSpot(prevState ?? {});
  const prevHi = prevSess?.sessionCallAbove;
  if (isFiniteNumber(prevSpot) && isFiniteNumber(prevHi) && prevSpot <= prevHi * 1.001 && spot! > prevHi * 1.001) return true;
  const active = currentState?.positioning?.activeCallWall;
  if (isFiniteNumber(active) && spot! > active * 1.001 && levelDistancePct(spot!, active) <= BREAKOUT_WALL_MAX_PCT) {
    if (!isFiniteNumber(prevSpot) || prevSpot <= active * 1.001) return true;
  }
  const cw = struct.structuralCallWall;
  if (isFiniteNumber(cw) && spot! > cw * 1.001 && levelDistancePct(spot!, cw) <= BREAKOUT_WALL_MAX_PCT) {
    if (!isFiniteNumber(prevSpot) || prevSpot <= cw * 1.001) return true;
  }
  return false;
}

function sessionBreakoutDown(
  volActive: boolean,
  spot: number | undefined,
  currentState: any,
  prevState: any | undefined,
  struct: StructuralPlaybookContext
): boolean {
  if (!volActive || !isFiniteNumber(spot)) return false;
  const prevSess = prevState ? buildSessionContext(prevState) : null;
  const prevSpot = getSpot(prevState ?? {});
  const prevLo = prevSess?.sessionPutBelow;
  if (isFiniteNumber(prevSpot) && isFiniteNumber(prevLo) && prevSpot >= prevLo * 0.999 && spot! < prevLo * 0.999) return true;
  const active = currentState?.positioning?.activePutWall;
  if (isFiniteNumber(active) && spot! < active * 0.999 && levelDistancePct(spot!, active) <= BREAKOUT_WALL_MAX_PCT) {
    if (!isFiniteNumber(prevSpot) || prevSpot >= active * 0.999) return true;
  }
  const pw = struct.structuralPutWall;
  if (isFiniteNumber(pw) && spot! < pw * 0.999 && levelDistancePct(spot!, pw) <= BREAKOUT_WALL_MAX_PCT) {
    if (!isFiniteNumber(prevSpot) || prevSpot >= pw * 0.999) return true;
  }
  return false;
}

/** Volatility elevated but not necessarily full expansion breakout. */
function isVolatilityHigh(positioning: any): boolean {
  if (getVolatilityExpansionActive(positioning)) return true;
  const volExp = positioning?.volatilityExpansionDetector;
  const p = volExp?.expansionProbability;
  return typeof p === "number" && p >= 45;
}

function noTradeConfidence(seed?: number): number {
  if (seed != null && Number.isFinite(seed)) return 30 + (Math.abs(Math.floor(seed)) % 11);
  return 35;
}

const SESSION_WAIT_LOADING = [
  "Session: wait for live spot + active walls",
  "Then: pivot reclaim or session wall acceptance",
  "Avoid distant structural strikes until price is there",
];

/** Always valid — used when terminal state is missing or no setup matches. */
export function createDefaultNoTradePlaybook(seed?: number): Playbook {
  return {
    setup: "NO_TRADE",
    confidence: noTradeConfidence(seed),
    bias: "UNCLEAR / TRANSITION",
    entry: "Wait — session context loading.",
    target: "N/A",
    invalidation: "Wait for structure",
    whyNoTrade: "Terminal snapshot not yet available.",
    horizon: "This session",
    notes: "Intraday desk: load spot and nearest active walls before sizing any idea.",
    waitFor: [...SESSION_WAIT_LOADING],
  };
}

export function createNoTradePlaybookFromContext(state: any): Playbook {
  const ts = state?.timestamp;
  const sess = buildSessionContext(state);
  const struct = buildStructuralContext(state, sess.spot);
  const waitFor = buildSessionWaitFromState(state);
  const why = buildWhyNoTrade(state, sess, struct);
  const flipNote =
    struct.flipSessionRelevant && isFiniteNumber(struct.gammaFlip) ? ` Flip ~${fmtK(struct.gammaFlip!)} nearby.` : "";
  return {
    setup: "NO_TRADE",
    confidence: noTradeConfidence(ts),
    bias: "UNCLEAR / TRANSITION",
    entry: "No clear entry — wait for session trigger.",
    target: "N/A",
    invalidation: "Wait for confirmed break / reclaim (see wait conditions)",
    whyNoTrade: why,
    horizon: "This session · next few hours",
    notes: `${struct.gammaState} · Vanna ${struct.vannaBias} / Charm ${struct.charmBias} · ${sess.volSessionLabel}.${flipNote}`.trim(),
    waitFor,
  };
}

export function createWaitForBreakPlaybook(state: any): Playbook {
  const seed = state?.timestamp;
  const sess = buildSessionContext(state);
  const struct = buildStructuralContext(state, sess.spot);
  const base = buildSessionWaitFromState(state);
  const merged = ["Break + hold (session)", ...base];
  const seen = new Set<string>();
  const wf = merged.filter((s) => {
    const k = s.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);

  return {
    setup: "WAIT_FOR_BREAK",
    confidence: clamp(40 + (seed != null && Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % 11 : 5), 0, 100),
    bias: "TRANSITION",
    entry: "Wait — vol expanding; need directional acceptance.",
    target: "N/A",
    invalidation: "Do not fade until a session level breaks with hold",
    whyNoTrade: "Volatility up but session direction not clean.",
    horizon: "This session",
    notes: `${sess.volSessionLabel}. Expansion likely; stand aside until a nearby session level breaks.${struct.flipSessionRelevant && isFiniteNumber(struct.gammaFlip) ? ` Flip ~${fmtK(struct.gammaFlip!)}.` : ""}`.trim(),
    waitFor: wf,
  };
}

/**
 * Always returns a valid Playbook (never null/undefined).
 * Pass `null`/`undefined` when terminal state is not yet loaded.
 */
export function computePlaybook(currentState: any, prevState?: any, forcedState?: PlaybookState): Playbook {
  if (currentState == null || typeof currentState !== "object") {
    return createDefaultNoTradePlaybook();
  }

  const positioning = currentState?.positioning ?? {};
  const market = currentState?.market ?? {};

  const spot = getSpot(currentState);
  const sess = buildSessionContext(currentState);
  const struct = buildStructuralContext(currentState, sess.spot);
  const gammaRegime = getMarketGammaRegime(currentState);
  const volActive = getVolatilityExpansionActive(positioning);
  const structureTag = deriveStructureTag(positioning, market);

  const sessionHi = sess.sessionCallAbove;
  const sessionLo = sess.sessionPutBelow;
  const hasSessionBox =
    isFiniteNumber(sessionHi) && isFiniteNumber(sessionLo) && sessionLo! < sessionHi!;
  const insideSessionRange =
    hasSessionBox && isFiniteNumber(spot) ? spot! >= sessionLo! && spot! <= sessionHi! : false;

  const nearSessionHi = hasSessionBox && isFiniteNumber(spot) ? isNearPrice(spot, sessionHi, 0.0035) : false;
  const nearSessionLo = hasSessionBox && isFiniteNumber(spot) ? isNearPrice(spot, sessionLo, 0.0035) : false;

  const absorption = getAbsorptionSignal(positioning);
  const absorptionLevel = absorption ? getAbsorptionLevel(absorption) : undefined;
  const absorptionNearSession =
    isFiniteNumber(spot) &&
    isFiniteNumber(absorptionLevel) &&
    (levelDistancePct(spot!, absorptionLevel!) <= SESSION_TIGHT_PCT || isNearPrice(spot, absorptionLevel, 0.004));
  const hasAbsorptionRejection = absorption ? rejectionLikely(absorption) : false;

  const prevSess = prevState ? buildSessionContext(prevState) : null;
  const prevSpot = getSpot(prevState ?? {});
  const prevHi = prevSess?.sessionCallAbove;
  const prevLo = prevSess?.sessionPutBelow;
  const prevHadBox = isFiniteNumber(prevHi) && isFiniteNumber(prevLo) && prevHi! > prevLo!;
  const prevOutsideSession =
    prevHadBox && isFiniteNumber(prevSpot) ? prevSpot! > prevHi! || prevSpot! < prevLo! : false;

  const horizon = "This session · next few hours";

  // If a higher-level state machine says what to do, render that state directly
  // (so the ACTIVE TRADING PLAN switches deterministically).
  if (forcedState) {
    const flipBrief =
      struct.flipSessionRelevant && isFiniteNumber(struct.gammaFlip)
        ? ` Flip ~${fmtK(struct.gammaFlip!)}.`
        : "";

    if (forcedState === "NO_TRADE") {
      const base = createNoTradePlaybookFromContext(currentState);
      const pre = inferPreSetup(currentState, prevState, structureTag, volActive);
      return { ...base, preSetup: pre ?? undefined };
    }

    const callFallback =
      positioning?.activeCallWall ??
      positioning?.callWall ??
      struct.structuralCallWall;
    const putFallback =
      positioning?.activePutWall ??
      positioning?.putWall ??
      struct.structuralPutWall;

    const effHi = isFiniteNumber(sessionHi) ? sessionHi : callFallback;
    const effLo = isFiniteNumber(sessionLo) ? sessionLo : putFallback;

    if (forcedState !== "REVERSAL" && (!isFiniteNumber(effHi) || !isFiniteNumber(effLo) || !isFiniteNumber(spot))) {
      return createNoTradePlaybookFromContext(currentState);
    }

    if (forcedState === "FADE_EXTREMES") {
      const distToLo = isFiniteNumber(spot) && isFiniteNumber(effLo) ? levelDistancePct(spot, effLo) : Infinity;
      const distToHi = isFiniteNumber(spot) && isFiniteNumber(effHi) ? levelDistancePct(spot, effHi) : Infinity;
      const buyFromLo = distToLo <= distToHi;
      const directionBias = buyFromLo ? "BULLISH" : "BEARISH";
      const biasTag = "RANGE / FADE";

      const proximityPct = 0.0025;
      const putRangeLow = effLo * (1 - proximityPct);
      const putRangeHigh = effLo * (1 + proximityPct);

      const absorption = getAbsorptionSignal(positioning);
      const absorptionLevel = absorption ? getAbsorptionLevel(absorption) : undefined;
      const absorptionNearSession =
        isFiniteNumber(spot) &&
        isFiniteNumber(absorptionLevel) &&
        (levelDistancePct(spot!, absorptionLevel!) <= SESSION_TIGHT_PCT || isNearPrice(spot, absorptionLevel, 0.004));

      const buyLevelText = absorptionNearSession && isFiniteNumber(absorptionLevel) ? fmtK(absorptionLevel) : `${fmtK(putRangeLow)}-${fmtK(putRangeHigh)}`;

      const entry = buyFromLo
        ? `Buy: ${buyLevelText}\nSell: ${fmtK(effHi)}`
        : `Sell: ${fmtK(effHi)}\nBuy: ${buyLevelText}`;

      const target = sessionTargetLine(sess, directionBias === "BULLISH" ? "UP" : "DOWN");
      const invalidation = `Wrong if spot accepts below ${fmtK(effLo)} OR holds above ${fmtK(effHi)}.`;

      let score = 60;
      if (gammaRegime === "LONG GAMMA") score += 15;
      if (volActive) score -= 10;
      if (buyFromLo ? distToLo <= 0.0035 : distToHi <= 0.0035) score += 10;
      if (flowSupportsDirection(currentState, directionBias)) score += 10;

      return {
        setup: "FADE_EXTREMES",
        confidence: clamp(score, 0, 100),
        bias: biasTag,
        entry,
        target,
        invalidation,
        horizon,
        notes: `${structuralDeskNote(struct, sess)} · Fade extremes inside today's band toward pivot/magnet.${flipBrief}`.trim(),
      };
    }

    if (forcedState === "BREAKOUT") {
      const callRef = effHi;
      if (!isFiniteNumber(callRef)) return createNoTradePlaybookFromContext(currentState);

      const entryStop = callRef * 1.001;
      const entry = isFiniteNumber(spot) && spot! > entryStop * 0.9995 ? `Hold above ${fmtK(callRef)} (session call)` : `Buy stop above ${fmtK(callRef)}`;

      return {
        setup: "BREAKOUT",
        confidence: clamp(55 + (volActive ? 20 : 0) + (gammaRegime === "LONG GAMMA" ? 5 : 0), 0, 100),
        bias: "MOMENTUM",
        entry,
        target: sessionTargetLine(sess, "UP"),
        invalidation: `Wrong: close back below ${fmtK(callRef)}`,
        horizon,
        notes: `${structuralDeskNote(struct, sess)} · Session breakout acceptance; trail to pivot/magnet.${flipBrief}`.trim(),
      };
    }

    if (forcedState === "BREAKDOWN") {
      const putRef = effLo;
      if (!isFiniteNumber(putRef)) return createNoTradePlaybookFromContext(currentState);

      const entryStop = putRef * 0.999;
      const entry = isFiniteNumber(spot) && spot! < entryStop * 1.0005 ? `Hold below ${fmtK(putRef)} (session put)` : `Sell stop below ${fmtK(putRef)}`;

      return {
        setup: "BREAKDOWN",
        confidence: clamp(55 + (volActive ? 20 : 0) + (gammaRegime === "SHORT GAMMA" ? 5 : 0), 0, 100),
        bias: "MOMENTUM",
        entry,
        target: sessionTargetLine(sess, "DOWN"),
        invalidation: `Wrong: close back above ${fmtK(putRef)}`,
        horizon,
        notes: `${structuralDeskNote(struct, sess)} · Session breakdown acceptance; trail to pivot/magnet.${flipBrief}`.trim(),
      };
    }

    if (forcedState === "REVERSAL") {
      const absorption = getAbsorptionSignal(positioning);
      if (!absorption || absorption?.status === "INACTIVE") return createNoTradePlaybookFromContext(currentState);

      const directionBias = mapBiasFromSide(absorption.side);
      const isBuy = directionBias === "BULLISH";
      const biasTag = "TRANSITION";

      const absorptionLevel = getAbsorptionLevel(absorption);
      const entry = isFiniteNumber(absorptionLevel)
        ? `${isBuy ? "Buy" : "Sell"} near ${fmtK(absorptionLevel)} (absorption · session reversal)`
        : `${isBuy ? "Buy" : "Sell"} near active absorption`;

      const invalidation = isFiniteNumber(absorptionLevel)
        ? isBuy
          ? `Wrong: acceptance below ${fmtK(absorptionLevel)}`
          : `Wrong: acceptance above ${fmtK(absorptionLevel)}`
        : "Wrong if absorption resolution fades";

      const confidenceBase = rejectionLikely(absorption) ? 70 : 55;

      return {
        setup: "REVERSAL",
        confidence: clamp(confidenceBase + (flowSupportsDirection(currentState, directionBias) ? 10 : 0), 0, 100),
        bias: biasTag,
        entry,
        target: sessionTargetLine(sess, isBuy ? "UP" : "DOWN"),
        invalidation,
        horizon,
        notes: `${structuralDeskNote(struct, sess)} · Absorption reversal (rejection ${absorption.rejectionScore ?? "--"}).${flipBrief}`.trim(),
      };
    }

    if (forcedState === "ACCELERATION") {
      const accelHigh = positioning?.dealerHedgingFlowMap?.hedgingAccelerationRisk === "HIGH";
      const dir: "UP" | "DOWN" =
        isFiniteNumber(spot) && isFiniteNumber(effHi) && spot! > effHi! * 1.001
          ? "UP"
          : "DOWN";

      const entry =
        dir === "UP"
          ? `Hold/press above ${fmtK(effHi!)} (acceleration)`
          : `Hold/press below ${fmtK(effLo!)} (acceleration)`;

      return {
        setup: "ACCELERATION",
        confidence: clamp(60 + (volActive ? 20 : 0) + (accelHigh ? 10 : 0), 0, 100),
        bias: "MOMENTUM",
        entry,
        target: sessionTargetLine(sess, dir),
        invalidation: dir === "UP" ? `Wrong if reclaim fails back below ${fmtK(effHi!)}` : `Wrong if reclaim fails back above ${fmtK(effLo!)}`,
        horizon,
        notes: `${structuralDeskNote(struct, sess)} · Acceleration risk ${accelHigh ? "HIGH" : "elevated"}; prioritize follow-through over next hours.${flipBrief}`.trim(),
      };
    }
  }

  // -----------------------------
  // 1) Absorption reversal (session-scoped level)
  // -----------------------------
  if (
    spot &&
    absorptionNearSession &&
    hasAbsorptionRejection &&
    absorption?.side &&
    absorption?.side !== "NONE"
  ) {
    const directionBias = mapBiasFromSide(absorption.side);
    const isBuy = directionBias === "BULLISH";
    const biasTag = "TRANSITION";

    let entryLevel = absorptionLevel ?? (isBuy ? sessionLo : sessionHi);
    if (!isFiniteNumber(entryLevel) && isFiniteNumber(spot)) {
      const sw = isBuy ? struct.structuralPutWall : struct.structuralCallWall;
      if (isFiniteNumber(sw) && levelDistancePct(spot!, sw) <= SESSION_EXTENDED_PCT) entryLevel = sw;
    }
    const entryWall = isBuy ? sessionLo : sessionHi;
    const entry = isFiniteNumber(entryLevel)
      ? `${isBuy ? "Buy" : "Sell"} near ${fmtK(entryLevel)} (absorption · session)`
      : `${isBuy ? "Buy" : "Sell"} near active absorption`;

    const wrongSideInvalidation = isFiniteNumber(absorptionLevel)
      ? isBuy
        ? `Wrong: acceptance below ${fmtK(absorptionLevel)}`
        : `Wrong: acceptance above ${fmtK(absorptionLevel)}`
      : "Wrong if rejection fades and price holds the other side";

    let score = 0;
    if (isBuy ? gammaRegime === "LONG GAMMA" : gammaRegime === "SHORT GAMMA") score += 30;
    if (insideSessionRange && structureTag === "RANGE") score += 20;
    if (hasAbsorptionRejection) score += 20;
    if (!volActive || structureTag === "RANGE") score += 15;
    if (flowSupportsDirection(currentState, directionBias)) score += 15;

    return {
      setup: "ABSORPTION_REVERSAL",
      confidence: clamp(score, 0, 100),
      bias: biasTag,
      entry,
      target: sessionTargetLine(sess, isBuy ? "UP" : "DOWN"),
      invalidation: wrongSideInvalidation,
      horizon,
      notes: `${structuralDeskNote(struct, sess)} · Absorption score ${absorption.rejectionScore ?? "—"}.`,
    };
  }

  // -----------------------------
  // 2) Failed break (back inside session range)
  // -----------------------------
  if (volActive && prevOutsideSession && insideSessionRange && hasSessionBox && isFiniteNumber(spot)) {
    const attemptedUp = isFiniteNumber(prevSpot) && isFiniteNumber(prevHi) && prevSpot! > prevHi!;
    const directionBias = attemptedUp ? "BEARISH" : "BULLISH";

    const refHi = sessionHi!;
    const refLo = sessionLo!;
    const entry = attemptedUp
      ? `Fade / sell toward pivot — failed hold above session call ${fmtK(refHi)}`
      : `Fade / buy toward pivot — failed hold below session put ${fmtK(refLo)}`;

    const invalidation = attemptedUp
      ? `Wrong: reclaim above ${fmtK(refHi)} with hold`
      : `Wrong: reclaim below ${fmtK(refLo)} with hold`;

    let score = 0;
    if (directionBias === "BULLISH" ? gammaRegime === "LONG GAMMA" : gammaRegime === "SHORT GAMMA") score += 30;
    if (insideSessionRange && structureTag === "RANGE") score += 20;
    if ((nearSessionHi || nearSessionLo) && hasAbsorptionRejection && absorptionNearSession) score += 20;
    else if (nearSessionHi || nearSessionLo) score += 10;
    if (volActive) score += 15;
    if (flowSupportsDirection(currentState, directionBias)) score += 15;

    return {
      setup: "FAILED_BREAK",
      confidence: clamp(score, 0, 100),
      bias: "TRANSITION",
      entry,
      target: sessionTargetLine(sess, attemptedUp ? "DOWN" : "UP"),
      invalidation,
      horizon,
      notes: `${structuralDeskNote(struct, sess)} · Rejected session break; work back toward range mid.`,
    };
  }

  // -----------------------------
  // 3) Breakout continuation (session / active / nearby structural only)
  // -----------------------------
  const brokeUp = sessionBreakoutUp(volActive, spot, currentState, prevState, struct);
  const brokeDown = sessionBreakoutDown(volActive, spot, currentState, prevState, struct);

  if (brokeUp && isFiniteNumber(spot)) {
    const ref =
      isFiniteNumber(prevHi) && spot! > prevHi! * 1.001
        ? prevHi!
        : positioning.activeCallWall ?? struct.structuralCallWall ?? sessionHi;
    const refK = isFiniteNumber(ref) ? fmtK(ref) : "session call";
    let score = 0;
    if (gammaRegime === "LONG GAMMA") score += 30;
    score += 35;
    if (volActive) score += 15;
    if (flowSupportsDirection(currentState, "BULLISH")) score += 15;

    return {
      setup: "BREAKOUT_CONTINUATION",
      confidence: clamp(score, 0, 100),
      bias: "MOMENTUM",
      entry: `Long: hold above ${refK} (session break)`,
      target: sessionTargetLine(sess, "UP"),
      invalidation: `Wrong: close back below ${refK}`,
      horizon,
      notes: `${structuralDeskNote(struct, sess)} · Next few hours: trail toward session call / magnet.`,
    };
  }

  if (brokeDown && isFiniteNumber(spot)) {
    const ref =
      isFiniteNumber(prevLo) && spot! < prevLo! * 0.999
        ? prevLo!
        : positioning.activePutWall ?? struct.structuralPutWall ?? sessionLo;
    const refK = isFiniteNumber(ref) ? fmtK(ref) : "session put";
    let score = 0;
    if (gammaRegime === "SHORT GAMMA") score += 30;
    score += 35;
    if (volActive) score += 15;
    if (flowSupportsDirection(currentState, "BEARISH")) score += 15;

    return {
      setup: "BREAKOUT_CONTINUATION",
      confidence: clamp(score, 0, 100),
      bias: "MOMENTUM",
      entry: `Short: hold below ${refK} (session break)`,
      target: sessionTargetLine(sess, "DOWN"),
      invalidation: `Wrong: close back above ${refK}`,
      horizon,
      notes: `${structuralDeskNote(struct, sess)} · Next few hours: trail toward session put / magnet.`,
    };
  }

  // -----------------------------
  // 4) Fade extremes (long gamma, inside active session range)
  // -----------------------------
  if (
    gammaRegime === "LONG GAMMA" &&
    hasSessionBox &&
    insideSessionRange &&
    structureTag === "RANGE" &&
    (nearSessionLo || nearSessionHi) &&
    isFiniteNumber(spot)
  ) {
    const directionBias = nearSessionLo ? "BULLISH" : "BEARISH";
    const loBand = `${fmtK(sessionLo! * 0.997)}–${fmtK(sessionLo! * 1.003)}`;
    const hiBand = `${fmtK(sessionHi! * 0.997)}–${fmtK(sessionHi! * 1.003)}`;
    const buyZone = absorptionNearSession && isFiniteNumber(absorptionLevel) ? fmtK(absorptionLevel) : loBand;
    const entry = nearSessionLo
      ? `Buy / wait: ${buyZone} (session put)\nSell / wait: ${hiBand} (session call)`
      : `Sell / wait: ${hiBand}\nBuy / wait: ${loBand}`;

    let score = 0;
    if (gammaRegime === "LONG GAMMA") score += 30;
    if (insideSessionRange) score += 20;
    if (nearSessionHi || nearSessionLo) score += 20;
    if (!volActive) score += 15;
    if (flowSupportsDirection(currentState, directionBias)) score += 15;

    return {
      setup: "FADE_EXTREMES",
      confidence: clamp(score, 0, 100),
      bias: "RANGE / FADE",
      entry,
      target: sessionTargetLine(sess, directionBias === "BULLISH" ? "UP" : "DOWN"),
      invalidation: `Wrong: session range breaks (${fmtK(sessionLo!)} / ${fmtK(sessionHi!)}) with acceptance.`,
      horizon,
      notes: `${structuralDeskNote(struct, sess)} · Fade toward pivot/magnet inside today’s band.`,
    };
  }

  const structureUnclear =
    structureTag === "TRANSITION" ||
    market?.gammaRegime === "TRANSITION" ||
    positioning?.institutionalBiasEngine?.institutionalBias === "FRAGILE_TRANSITION";
  if (structureUnclear && isVolatilityHigh(positioning)) {
    return createWaitForBreakPlaybook(currentState);
  }

  return createNoTradePlaybookFromContext(currentState);
}

