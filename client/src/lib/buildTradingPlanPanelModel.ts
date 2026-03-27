import type { Playbook } from "./playbookEngine";
import type { PlaybookState } from "./playbookStateMachine";
import type {
  PlaybookStateMachineContext,
  PlaybookStateMachineDebug,
} from "./playbookStateMachine";
import {
  buildSessionContext,
  buildStructuralContext,
} from "./playbookEngine";
import {
  collectOperationalLevelsFromState,
  horizonShort,
  prioritizeLevelsForPlaybook,
} from "./levelTiming";

export type TradeGateStatus = "NO_TRADE" | "PREPARE" | "TRADE VALID" | "INVALID";

export type PanelPreSetupStatus = "WAITING" | "ARMED" | "READY" | "ACTIVE" | "BLOCKED" | "INVALIDATED";

export interface PanelPreSetup {
  type: string;
  direction: "LONG" | "SHORT";
  status: PanelPreSetupStatus;
  triggerZone: string;
  conditionToTrigger: string;
  confirmationNeeded: string[];
  invalidation: string;
  nextAction: string;
}

export interface TradingPlanPanelModel {
  sessionContext: {
    pivot?: number;
    callWall?: number;
    putWall?: number;
    absorptionZone?: { low: number; high: number; mid: number };
    gammaFlip?: number;
    regime?: string;
    dealerContext?: string;
  };
  playbookState: {
    state: PlaybookState;
    bias: "Neutral" | "Long Bias" | "Short Bias";
    mainTrigger: string;
    keyLevel?: number;
    cooldown: "Active" | "Inactive";
    confidenceBand: "Low" | "Medium" | "High";
    confidence: number;
    invalidation: string;
    why: string;
  };
  preSetup?: PanelPreSetup;
  tradeGate: {
    status: TradeGateStatus;
    why: string;
    blockers: string[];
    entryPermission: "allowed" | "blocked";
  };
  timingPriority?: {
    activeTactical: Array<{ price: number; horizon: string; urgency: string; state: string; score: number; kind: string }>;
    intraday: Array<{ price: number; horizon: string; urgency: string; state: string; score: number; kind: string }>;
    structural: Array<{ price: number; horizon: string; urgency: string; state: string; score: number; kind: string }>;
  };
  score: {
    total: number;
    location: number;
    flow: number;
    acceptance: number;
    context: number;
    riskQuality: number;
    formatted: string;
  };
  debug?: {
    previousState: string;
    currentState: string;
    selectedTrigger: string | null;
    acceptancePassed: boolean;
    cooldownActive: boolean;
    preSetupStatus?: PanelPreSetupStatus;
    tradeGateStatus: TradeGateStatus;
    whyBlocked: string;
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function fmtK(n: number) {
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function confidenceBand(confidence: number): TradingPlanPanelModel["playbookState"]["confidenceBand"] {
  if (confidence >= 75) return "High";
  if (confidence >= 45) return "Medium";
  return "Low";
}

function scoreFromDistancePct(distPct: number | undefined): number {
  if (!isFiniteNumber(distPct)) return 3.0;
  if (distPct <= 0.35) return 8.5;
  if (distPct <= 0.55) return 7.0;
  if (distPct <= 0.8) return 5.5;
  return 3.5;
}

function directionFromPreSetup(type: string): "LONG" | "SHORT" {
  if (type === "PRE_BREAKDOWN") return "SHORT";
  if (type === "PRE_FADE_LONG") return "LONG";
  if (type === "PRE_BREAKOUT") return "LONG";
  if (type === "PRE_FADE_SHORT") return "SHORT";
  // fallback: infer by name
  return type.includes("BREAKDOWN") || type.includes("FADE_SHORT") ? "SHORT" : "LONG";
}

function mainTriggerFromState(
  state: PlaybookState,
  ctx: PlaybookStateMachineContext,
  debug: PlaybookStateMachineDebug | null
): { mainTrigger: string; keyLevel?: number } {
  const callWall = isFiniteNumber(ctx.nearTriggerLevels?.callWall) ? ctx.nearTriggerLevels?.callWall : undefined;
  const putWall = isFiniteNumber(ctx.nearTriggerLevels?.putWall) ? ctx.nearTriggerLevels?.putWall : undefined;
  const pivot = isFiniteNumber(ctx.nearTriggerLevels?.pivot) ? ctx.nearTriggerLevels?.pivot : undefined;
  const absZone = isFiniteNumber(ctx.nearTriggerLevels?.absorptionZone) ? ctx.nearTriggerLevels?.absorptionZone : undefined;

  if (state === "BREAKOUT") {
    if (ctx.breakCallWall || debug?.winningTrigger?.includes("breakCallWall")) {
      return { mainTrigger: "Acceptance above call wall", keyLevel: callWall };
    }
    if (ctx.reclaimPivot || debug?.winningTrigger?.includes("reclaimPivot")) {
      return { mainTrigger: "Reclaim pivot", keyLevel: pivot };
    }
    return { mainTrigger: "Breakout path valid", keyLevel: callWall ?? pivot };
  }

  if (state === "BREAKDOWN") {
    if (ctx.breakPutWall || debug?.winningTrigger?.includes("breakPutWall")) {
      return { mainTrigger: "Acceptance below put wall", keyLevel: putWall };
    }
    if (ctx.losePivot || debug?.winningTrigger?.includes("losePivot")) {
      return { mainTrigger: "Lose pivot", keyLevel: pivot };
    }
    return { mainTrigger: "Breakdown path valid", keyLevel: putWall ?? pivot };
  }

  if (state === "REVERSAL") {
    return { mainTrigger: "Absorption rejection", keyLevel: absZone };
  }

  if (state === "FADE_EXTREMES") {
    if (ctx.nearPutWall) return { mainTrigger: "Fade long: put support", keyLevel: putWall };
    if (ctx.nearCallWall) return { mainTrigger: "Fade short: call resistance", keyLevel: callWall };
    return { mainTrigger: "Fade extremes inside range", keyLevel: putWall ?? callWall };
  }

  if (state === "ACCELERATION") {
    const key = ctx.nearTriggerLevels?.callWall ?? ctx.nearTriggerLevels?.putWall;
    return { mainTrigger: "Vol expansion + acceleration risk", keyLevel: isFiniteNumber(key) ? key : undefined };
  }

  return { mainTrigger: "Waiting for acceptance", keyLevel: pivot };
}

function mapBias(struct: { vannaBias: string; charmBias: string }): TradingPlanPanelModel["playbookState"]["bias"] {
  if (struct.vannaBias === "BULLISH" || struct.charmBias === "BULLISH") return "Long Bias";
  if (struct.vannaBias === "BEARISH" || struct.charmBias === "BEARISH") return "Short Bias";
  return "Neutral";
}

function derivePreSetupPanel(
  playbook: Playbook,
  fsmState: PlaybookState,
  ctx: PlaybookStateMachineContext
): PanelPreSetup | undefined {
  if (!playbook.preSetup) return undefined;
  // Pre-setup is mainly meaningful when we are NOT trading execution yet.
  if (fsmState !== "NO_TRADE") return undefined;

  const type = playbook.preSetup.type;
  const direction = directionFromPreSetup(type);

  const near = ctx.nearTriggers ?? {};
  const distPct =
    type === "PRE_BREAKOUT"
      ? Math.min(near.reclaimPivot ?? Infinity, near.breakCallWall ?? Infinity)
      : type === "PRE_BREAKDOWN"
        ? Math.min(near.reclaimPivot ?? Infinity, near.breakPutWall ?? Infinity)
        : type === "PRE_FADE_LONG"
          ? near.breakPutWall
          : type === "PRE_FADE_SHORT"
            ? near.breakCallWall
            : undefined;

  // Map to operational statuses using acceptance + invalidation context.
  const triggerIsAlreadyFiring =
    type === "PRE_BREAKOUT" ? ctx.reclaimPivot || ctx.breakCallWall : type === "PRE_BREAKDOWN" ? ctx.losePivot || ctx.breakPutWall : false;

  const baseInvalidated = !ctx.inRangeBox || ctx.volatilityExpansion;

  let status: PanelPreSetupStatus = "ARMED";
  if (triggerIsAlreadyFiring) status = "BLOCKED";
  else if (baseInvalidated) status = "INVALIDATED";
  else if (distPct != null && isFiniteNumber(distPct) && distPct <= 0.35) status = "READY";
  else status = "ARMED";

  // ConditionToTrigger: compress to the first actionable requirement.
  const conditionToTrigger =
    playbook.preSetup.confirmationNeeded.length > 0 ? playbook.preSetup.confirmationNeeded[0] : "Approach trigger zone then acceptance/hold";

  const invalidation = (() => {
    // Use the closest relevant distance as a proxy for the zone.
    const trigLevel =
      type === "PRE_BREAKOUT"
        ? (isFiniteNumber(ctx.nearTriggerLevels?.callWall) && (near.breakCallWall ?? Infinity) <= (near.reclaimPivot ?? Infinity) ? ctx.nearTriggerLevels?.callWall : ctx.nearTriggerLevels?.pivot)
        : type === "PRE_BREAKDOWN"
          ? ctx.nearTriggerLevels?.putWall
          : type === "PRE_FADE_LONG"
            ? ctx.nearTriggerLevels?.putWall
            : type === "PRE_FADE_SHORT"
              ? ctx.nearTriggerLevels?.callWall
              : undefined;
    if (isFiniteNumber(trigLevel)) {
      return `Acceptance fails; price drifts back from ${fmtK(trigLevel)}`;
    }
    return "Acceptance not sustained; price drifts away from trigger zone";
  })();

  const nextAction = (() => {
    if (type === "PRE_BREAKOUT") return "If acceptance holds above trigger, switch to BREAKOUT execution.";
    if (type === "PRE_BREAKDOWN") return "If acceptance holds below trigger, switch to BREAKDOWN execution.";
    if (type === "PRE_FADE_LONG") return "If support rejection holds, fade long back toward pivot/magnet.";
    if (type === "PRE_FADE_SHORT") return "If resistance rejection holds, fade short back toward pivot/magnet.";
    return playbook.preSetup.action;
  })();

  return {
    type,
    direction,
    status,
    triggerZone: playbook.preSetup.triggerZone,
    conditionToTrigger,
    confirmationNeeded: playbook.preSetup.confirmationNeeded,
    invalidation,
    nextAction,
  };
}

function deriveTradeGate(
  playbook: Playbook,
  fsmState: PlaybookState,
  ctx: PlaybookStateMachineContext,
  preSetup: PanelPreSetup | undefined
): TradingPlanPanelModel["tradeGate"] {
  const blockers: string[] = [];

  const add = (s: string) => {
    if (!blockers.includes(s)) blockers.push(s);
  };

  // Execution states.
  const isExecution =
    fsmState === "BREAKOUT" ||
    fsmState === "BREAKDOWN" ||
    fsmState === "REVERSAL" ||
    fsmState === "FADE_EXTREMES" ||
    fsmState === "ACCELERATION";

  if (isExecution) {
    // Invalidation gating is state-specific.
    const invalid =
      (fsmState === "BREAKOUT" && ctx.breakoutInvalidated) ||
      (fsmState === "BREAKDOWN" && ctx.breakdownInvalidated) ||
      (fsmState === "FADE_EXTREMES" && ctx.fadeInvalidated) ||
      (fsmState === "REVERSAL" && ctx.reversalInvalidated) ||
      (fsmState === "ACCELERATION" && ctx.accelerationInvalidated);

    if (invalid) {
      add("Invalidated: structure/acceptance failed");
    }

    // Acceptance gating where relevant.
    if (fsmState === "BREAKOUT" && !ctx.acceptanceAboveLevel) add("Acceptance not confirmed above trigger");
    if (fsmState === "BREAKDOWN" && !ctx.acceptanceBelowLevel) add("Acceptance not confirmed below trigger");
    if (fsmState === "REVERSAL" && !ctx.absorptionRejectionNow) add("Absorption rejection not confirmed");
    if (fsmState === "FADE_EXTREMES" && !ctx.inRangeBox) add("Fade requires active range box");
    if (fsmState === "ACCELERATION" && !(ctx.volatilityExpansion && ctx.accelerationRiskHigh)) add("Acceleration requires vol expansion + accel risk");

    if (blockers.length > 0) {
      return {
        status: invalid ? "INVALID" : "INVALID",
        why: playbook.invalidation,
        blockers,
        entryPermission: "blocked",
      };
    }

    return {
      status: "TRADE VALID",
      why: "Acceptance confirmed + invalidation cleared for current execution mode",
      blockers: [],
      entryPermission: "allowed",
    };
  }

  // NO_TRADE gate.
  if (preSetup) {
    if (preSetup.status === "READY" || preSetup.status === "ARMED") {
      return {
        status: preSetup.status === "READY" ? "PREPARE" : "PREPARE",
        why: "Pre-setup armed: relevant level is near but confirmation still pending",
        blockers: [
          preSetup.status === "READY" ? "Need acceptance/hold confirmation before execution switch" : "Wait for acceptance/hold confirmation",
        ],
        entryPermission: "blocked",
      };
    }
    if (preSetup.status === "BLOCKED") {
      return {
        status: "NO_TRADE",
        why: "Pre-setup is blocked by conflicting conditions or cooldown/invalidation",
        blockers: ["Trigger appears near/ready but confirmation is blocked"],
        entryPermission: "blocked",
      };
    }
    if (preSetup.status === "INVALIDATED") {
      return {
        status: "NO_TRADE",
        why: "Pre-setup invalidated: context drifted away from the watch zone",
        blockers: ["Range/volatility conditions not suitable"],
        entryPermission: "blocked",
      };
    }
  }

  return {
    status: "NO_TRADE",
    why: playbook.whyNoTrade ?? "No clear edge for this session trigger",
    blockers: [playbook.invalidation ?? "Wait for acceptance/hold"],
    entryPermission: "blocked",
  };
}

function deriveSetupScore(
  playbook: Playbook,
  fsmState: PlaybookState,
  ctx: PlaybookStateMachineContext,
  preSetup: PanelPreSetup | undefined,
  struct: { vannaBias: string; charmBias: string },
  tradeGateStatus: TradeGateStatus
): TradingPlanPanelModel["score"] {
  const inferredDirection: "LONG" | "SHORT" =
    struct.vannaBias === "BULLISH" || struct.charmBias === "BULLISH"
      ? "LONG"
      : struct.vannaBias === "BEARISH" || struct.charmBias === "BEARISH"
        ? "SHORT"
        : fsmState === "BREAKDOWN"
          ? "SHORT"
          : "LONG";

  const location = (() => {
    const near = ctx.nearTriggers ?? {};
    const distPct =
      preSetup
        ? preSetup.type === "PRE_BREAKOUT"
          ? Math.min(near.reclaimPivot ?? Infinity, near.breakCallWall ?? Infinity)
          : preSetup.type === "PRE_BREAKDOWN"
            ? Math.min(near.reclaimPivot ?? Infinity, near.breakPutWall ?? Infinity)
            : preSetup.type === "PRE_FADE_LONG"
              ? near.breakPutWall
              : preSetup.type === "PRE_FADE_SHORT"
                ? near.breakCallWall
                : undefined
        : fsmState === "BREAKOUT"
          ? Math.min(near.reclaimPivot ?? Infinity, near.breakCallWall ?? Infinity)
          : fsmState === "BREAKDOWN"
            ? Math.min(near.reclaimPivot ?? Infinity, near.breakPutWall ?? Infinity)
            : fsmState === "REVERSAL"
              ? near.absorptionZone
              : fsmState === "FADE_EXTREMES"
                ? ctx.nearPutWall
                  ? near.breakPutWall
                  : near.breakCallWall
                : fsmState === "ACCELERATION"
                  ? Math.min(near.reclaimPivot ?? Infinity, near.breakCallWall ?? Infinity, near.breakPutWall ?? Infinity)
                  : undefined;
    return scoreFromDistancePct(distPct);
  })();

  const acceptance =
    fsmState === "BREAKOUT"
      ? ctx.acceptanceAboveLevel
        ? 8
        : 4
      : fsmState === "BREAKDOWN"
        ? ctx.acceptanceBelowLevel
          ? 8
          : 4
        : fsmState === "REVERSAL"
          ? ctx.absorptionRejectionNow
            ? 8
            : 4
          : fsmState === "ACCELERATION"
            ? ctx.volatilityExpansion && ctx.accelerationRiskHigh
              ? 7.5
              : 4
            : fsmState === "FADE_EXTREMES"
              ? ctx.inRangeBox
                ? 6.5
                : 4
              : 3.5;

  const contextScore = ctx.longGammaContext || ctx.inRangeBox ? 7.0 : 5.0;

  const riskQuality = (() => {
    const invalid =
      (fsmState === "BREAKOUT" && ctx.breakoutInvalidated) ||
      (fsmState === "BREAKDOWN" && ctx.breakdownInvalidated) ||
      (fsmState === "FADE_EXTREMES" && ctx.fadeInvalidated) ||
      (fsmState === "REVERSAL" && ctx.reversalInvalidated) ||
      (fsmState === "ACCELERATION" && ctx.accelerationInvalidated);
    if (invalid) return 2.0;
    if (tradeGateStatus === "NO_TRADE") return 4.6;
    if (tradeGateStatus === "PREPARE") return 6.5;
    if (tradeGateStatus === "INVALID") return 2.2;
    return 8.4;
  })();

  const flow = (() => {
    if (inferredDirection === "LONG") {
      return struct.vannaBias === "BULLISH" || struct.charmBias === "BULLISH" ? 8.0 : 4.8;
    }
    return struct.vannaBias === "BEARISH" || struct.charmBias === "BEARISH" ? 8.0 : 4.8;
  })();

  const weights = { location: 0.2, flow: 0.2, acceptance: 0.25, context: 0.2, riskQuality: 0.15 };
  let total =
    location * weights.location +
    flow * weights.flow +
    acceptance * weights.acceptance +
    contextScore * weights.context +
    riskQuality * weights.riskQuality;

  // Never inflate. Cap depending on trade gate.
  const cap =
    tradeGateStatus === "NO_TRADE"
      ? 5.3
      : tradeGateStatus === "PREPARE"
        ? 6.7
        : tradeGateStatus === "INVALID"
          ? 4.0
          : 9.2;
  total = clamp(total, 0, cap);

  const formatted = `${total.toFixed(1)} / 10`;
  return { total, location: clamp(location, 0, 10), flow, acceptance, context: contextScore, riskQuality, formatted };
}

export function buildTradingPlanPanelModel(params: {
  currentState: any;
  prevState: any;
  fsmState: PlaybookState;
  fsmContext: PlaybookStateMachineContext;
  fsmDebug: PlaybookStateMachineDebug | null;
  playbook: Playbook;
  prevModel?: TradingPlanPanelModel | null;
}): TradingPlanPanelModel {
  const { currentState, prevState, fsmState, fsmContext, fsmDebug, playbook } = params;

  const sess = buildSessionContext(currentState);
  const struct = buildStructuralContext(currentState, sess.spot);

  const sessionContext: TradingPlanPanelModel["sessionContext"] = {
    pivot: isFiniteNumber(sess.sessionPivot) ? sess.sessionPivot : undefined,
    callWall: isFiniteNumber(sess.sessionCallAbove) ? sess.sessionCallAbove : undefined,
    putWall: isFiniteNumber(sess.sessionPutBelow) ? sess.sessionPutBelow : undefined,
    absorptionZone:
      isFiniteNumber(sess.absorptionZoneLow) && isFiniteNumber(sess.absorptionZoneHigh)
        ? {
            low: sess.absorptionZoneLow!,
            high: sess.absorptionZoneHigh!,
            mid: (sess.absorptionZoneLow! + sess.absorptionZoneHigh!) / 2,
          }
        : undefined,
    gammaFlip: isFiniteNumber(struct.gammaFlip) ? struct.gammaFlip : undefined,
    regime: struct.gammaState,
    dealerContext: `Vanna ${struct.vannaBias} / Charm ${struct.charmBias}`,
  };

  const { mainTrigger, keyLevel } = mainTriggerFromState(fsmState, fsmContext, fsmDebug);

  const bias = mapBias(struct);

  // Fallback key level from session context when near-trigger levels are missing.
  const fallbackKeyLevel = (() => {
    if (fsmState === "BREAKOUT" && isFiniteNumber(sessionContext.callWall)) return sessionContext.callWall;
    if (fsmState === "BREAKDOWN" && isFiniteNumber(sessionContext.putWall)) return sessionContext.putWall;
    if (fsmState === "REVERSAL" && sessionContext.absorptionZone?.mid != null) return sessionContext.absorptionZone.mid;
    if (fsmState === "FADE_EXTREMES") return fsmContext.nearPutWall ? sessionContext.putWall : sessionContext.callWall;
    if (fsmState === "ACCELERATION") return isFiniteNumber(sessionContext.callWall) ? sessionContext.callWall : sessionContext.pivot;
    return sessionContext.pivot;
  })();

  const preSetup = derivePreSetupPanel(playbook, fsmState, fsmContext);

  const tradeGate = deriveTradeGate(playbook, fsmState, fsmContext, preSetup);
  const timingGroups = (() => {
    const spot = sess.spot;
    if (!isFiniteNumber(spot)) {
      return { activeTactical: [], intraday: [], structural: [] as any[] };
    }
    return prioritizeLevelsForPlaybook(collectOperationalLevelsFromState(currentState, spot, 60));
  })();

  // Score uses only conservative proxies; never inflate.
  const score = deriveSetupScore(playbook, fsmState, fsmContext, preSetup, struct, tradeGate.status);

  const stateWhy = (() => {
    if (fsmDebug?.winningTrigger) return `Trigger: ${fsmDebug.winningTrigger}`;
    const t0 = timingGroups.activeTactical[0];
    if (t0?.timingMeta) {
      return `Priority ${horizonShort(t0.timingMeta.horizon)} ${t0.timingMeta.urgency.toUpperCase()} ${Math.round(t0.price)} (score ${t0.timingMeta.score})`;
    }
    if (tradeGate.status === "NO_TRADE") return playbook.whyNoTrade ?? "No clear trigger edge";
    return playbook.invalidation;
  })();

  const cooldown = fsmContext.cooldownActive ? "Active" : "Inactive";

  return {
    sessionContext,
    playbookState: {
      state: fsmState,
      bias,
      mainTrigger,
      keyLevel: isFiniteNumber(keyLevel) ? keyLevel : isFiniteNumber(fallbackKeyLevel) ? fallbackKeyLevel : undefined,
      cooldown,
      confidenceBand: confidenceBand(playbook.confidence),
      confidence: playbook.confidence,
      invalidation: playbook.invalidation,
      why: stateWhy,
    },
    preSetup,
    tradeGate,
    timingPriority: {
      activeTactical: timingGroups.activeTactical.slice(0, 5).map((l) => ({
        price: l.price,
        horizon: l.timingMeta?.horizon ?? "intraday",
        urgency: l.timingMeta?.urgency ?? "medium",
        state: l.timingMeta?.state ?? "pending",
        score: l.timingMeta?.score ?? 0,
        kind: l.kind,
      })),
      intraday: timingGroups.intraday.slice(0, 6).map((l) => ({
        price: l.price,
        horizon: l.timingMeta?.horizon ?? "intraday",
        urgency: l.timingMeta?.urgency ?? "medium",
        state: l.timingMeta?.state ?? "pending",
        score: l.timingMeta?.score ?? 0,
        kind: l.kind,
      })),
      structural: timingGroups.structural.slice(0, 6).map((l) => ({
        price: l.price,
        horizon: l.timingMeta?.horizon ?? "swing",
        urgency: l.timingMeta?.urgency ?? "low",
        state: l.timingMeta?.state ?? "pending",
        score: l.timingMeta?.score ?? 0,
        kind: l.kind,
      })),
    },
    score,
    debug: fsmDebug
      ? {
          previousState: fsmDebug.previousState,
          currentState: fsmState,
          selectedTrigger: fsmDebug.winningTrigger,
          acceptancePassed: fsmDebug.acceptancePassed,
          cooldownActive: fsmDebug.cooldownActive,
          preSetupStatus: preSetup?.status,
          tradeGateStatus: tradeGate.status,
          whyBlocked: tradeGate.blockers[0] ?? "",
        }
      : undefined,
  };
}

