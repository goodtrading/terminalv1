/**
 * Phase 5 / 5.5 — operational playbook (confirmation vs tradability separated).
 */

import type { TerminalState } from "@/hooks/useTerminalState";
import type { GammaInterpretationBundle } from "@/lib/volatilityGammaInterpretation";
import type {
  VolatilityEngineOutput,
  VolatilityOperationalPlaybook,
  VolatilityPlaybookScenario,
  PlaybookMode,
  PlaybookScenarioStatus,
  LiquidityContextInput,
  OrderflowConfirmationLevel,
} from "@/lib/volatilityEngine";

export type VolatilityPlaybookEngineInput = {
  liquidity?: LiquidityContextInput;
  gamma?: GammaInterpretationBundle;
  terminal?: TerminalState;
  spot?: number;
};

export type PlaybookEngineInput = VolatilityPlaybookEngineInput;

function fmtLevel(n: number | undefined | null): string | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.round(n).toLocaleString("en-US");
}

function confirmLevel(
  output: VolatilityEngineOutput,
  side: "up" | "down",
): OrderflowConfirmationLevel {
  const c = output.triggerConfirmation;
  return side === "up" ? (c?.upside ?? "NONE") : (c?.downside ?? "NONE");
}

function confirmRank(c: OrderflowConfirmationLevel): number {
  return { NONE: 0, WEAK: 1, MODERATE: 2, STRONG: 3 }[c];
}

function confirmSufficient(c: OrderflowConfirmationLevel): boolean {
  return confirmRank(c) >= 2;
}

function spotNearPrice(spot: number | undefined, price: number | undefined, pct = 0.0035): boolean {
  if (spot == null || price == null || !Number.isFinite(price)) return false;
  return Math.abs(price - spot) / spot <= pct;
}

type TargetTier = { label: string; price?: number; priority: number };

function resolveTargetHierarchy(
  side: "up" | "down",
  output: VolatilityEngineOutput,
  input: VolatilityPlaybookEngineInput,
): Pick<VolatilityPlaybookScenario, "targetPrimary" | "targetSecondary" | "targetExtended"> {
  const spot = input.spot;
  const triggers = output.triggerZones;
  const ctx = input.liquidity;
  const gamma = input.gamma;
  const pos = input.terminal?.positioning as Record<string, unknown> | undefined;
  const tiers: TargetTier[] = [];

  const add = (label: string, price: number | undefined, priority: number) => {
    if (price == null || !Number.isFinite(price)) return;
    tiers.push({ label, price, priority });
  };

  const voidZone = ctx?.nearestVoid;
  if (side === "up" && voidZone?.direction === "UP") {
    add("Upside void boundary", voidZone.high, 1);
  }
  if (side === "down" && voidZone?.direction === "DOWN") {
    add("Downside void boundary", voidZone.low, 1);
  }

  if (side === "up") {
    add("Upside trigger extension", triggers.upsideExpansionTrigger, 2);
  } else {
    add("Downside trigger extension", triggers.downsideExpansionTrigger, 2);
  }

  const gLevel = gamma?.nearestLevel;
  if (gLevel && spot != null) {
    if (side === "up" && gLevel.price > spot) {
      add(`${gLevel.type}`, gLevel.price, 3);
    }
    if (side === "down" && gLevel.price < spot) {
      add(`${gLevel.type}`, gLevel.price, 3);
    }
  }

  const magnet = ctx?.activeMagnet;
  if (magnet != null && spot != null) {
    if (side === "up" && magnet > spot) add("Liquidity magnet", magnet, 4);
    if (side === "down" && magnet < spot) add("Liquidity magnet", magnet, 4);
  }

  if (side === "up") {
    add("Call wall", pos?.callWall as number | undefined, 5);
  } else {
    add("Put wall", pos?.putWall as number | undefined, 5);
  }

  const filtered =
    spot != null
      ? tiers.filter((t) => {
          if (t.price == null) return false;
          return side === "up" ? t.price >= spot * 0.998 : t.price <= spot * 1.002;
        })
      : tiers.filter((t) => t.price != null);

  filtered.sort((a, b) => a.priority - b.priority || (a.price ?? 0) - (b.price ?? 0));

  const farPct = 3;
  const near: TargetTier[] = [];
  const far: TargetTier[] = [];
  for (const t of filtered) {
    if (spot != null && t.price != null && Math.abs(t.price - spot) / spot * 100 > farPct) {
      far.push(t);
    } else {
      near.push(t);
    }
  }
  const ordered = [...near, ...far];
  const fmt = (t: TargetTier) => `${t.label} · ${fmtLevel(t.price)}`;

  if (!ordered.length) {
    return {
      targetPrimary:
        side === "up"
          ? "Next upside liquidity/gamma level after acceptance"
          : "Next downside liquidity/gamma level after acceptance",
    };
  }

  return {
    targetPrimary: fmt(ordered[0]!),
    targetSecondary: ordered[1] ? fmt(ordered[1]) : undefined,
    targetExtended: ordered[2] ? fmt(ordered[2]) : far[0] ? fmt(far[0]) : undefined,
  };
}

type ScenarioBuildCtx = {
  side: "up" | "down";
  output: VolatilityEngineOutput;
  input: VolatilityPlaybookEngineInput;
  mode: PlaybookMode;
  confirmation: OrderflowConfirmationLevel;
};

function collectBlockingReasons(ctx: ScenarioBuildCtx): string[] {
  const { side, output, input, confirmation } = ctx;
  const reasons: string[] = [];
  const liq = input.liquidity;
  const gamma = input.gamma;
  const spot = input.spot;
  const triggers = output.triggerZones;
  const hp = liq?.heatmapPressure;

  if (output.signalAlignment === "STRONGLY_CONFLICTED") {
    reasons.push("Signal alignment is strongly conflicted.");
  } else if (output.signalAlignment === "CONFLICTED") {
    reasons.push("Signal alignment is conflicted.");
  }

  if (output.resolutionState === "CHOP_NO_TRADE" || ctx.mode === "RANGE_CHOP") {
    reasons.push("Range chop — no directional edge.");
  }

  if (output.tradeQuality === "NO TRADE") {
    reasons.push("Trade quality is NO TRADE.");
  }

  if (output.executionBias === "NO_TRADE" || ctx.mode === "NO_TRADE") {
    reasons.push("Execution bias is NO TRADE until resolution.");
  }

  const nearFlip =
    gamma?.nearFlip ||
    gamma?.gammaRegime === "NEAR_FLIP" ||
    output.gammaRegimeClass === "NEAR_FLIP";
  if (nearFlip) {
    reasons.push("Near gamma flip: first break can fail.");
  }

  if (output.moveUsed > 85) {
    reasons.push("Daily expected move is mostly consumed.");
  }

  if (spotNearPrice(spot, triggers.compressionMagnet)) {
    reasons.push("Price is still inside compression/magnet zone.");
  }

  const absSide = liq?.absorption?.side;
  const absOn =
    liq?.absorption?.detected === true ||
    absSide === "BID" ||
    absSide === "ASK" ||
    absSide === "BOTH";
  if (side === "up" && absSide === "ASK" && absOn) {
    reasons.push("Opposite-side (ask) absorption is active.");
  }
  if (side === "down" && absSide === "BID" && absOn) {
    reasons.push("Opposite-side (bid) absorption is active.");
  }

  if (side === "up" && output.directionalPressure === "DOWNSIDE" && hp === "DOWNSIDE") {
    reasons.push("Candle pressure favors downside.");
  }
  if (side === "down" && output.directionalPressure === "UPSIDE" && hp === "UPSIDE") {
    reasons.push("Candle pressure favors upside.");
  }

  if (side === "up" && hp === "DOWNSIDE") {
    reasons.push("Heatmap pressure conflicts with upside.");
  }
  if (side === "down" && hp === "UPSIDE") {
    reasons.push("Heatmap pressure conflicts with downside.");
  }

  const wall = liq?.nearestWall;
  if (side === "up" && wall?.side === "ASK") {
    reasons.push("Ask wall has not accepted.");
  }
  if (side === "down" && wall?.side === "BID") {
    reasons.push("Bid wall has not failed.");
  }

  if (output.resolutionState === "WAIT_SWEEP_RESOLUTION") {
    reasons.push("Sweep has not resolved.");
  }

  if (!confirmSufficient(confirmation) && confirmRank(confirmation) < 1) {
    reasons.push("Requires MODERATE/STRONG confirmation before entry.");
  } else if (confirmSufficient(confirmation)) {
    const softTrigger = [
      "Acceptance through trigger has not occurred yet.",
      "Sweep has not resolved.",
    ];
    if (
      output.resolutionState === "WAIT_ACCEPTANCE" ||
      output.resolutionState === "WAIT_SWEEP_RESOLUTION" ||
      output.resolutionState === "CONFLICTED_CONTINUATION" ||
      spotNearPrice(spot, triggers.compressionMagnet)
    ) {
      reasons.push(softTrigger[0]!);
    }
  }

  return [...new Set(reasons)].slice(0, 4);
}

function buildActivationTrigger(ctx: ScenarioBuildCtx): string {
  const { side, output, input } = ctx;
  const triggers = output.triggerZones;
  const liq = input.liquidity;
  const gamma = input.gamma;
  const up = fmtLevel(triggers.upsideExpansionTrigger);
  const down = fmtLevel(triggers.downsideExpansionTrigger);
  const magnet = fmtLevel(triggers.compressionMagnet);
  const wall = liq?.nearestWall;
  const sweep = liq?.sweep;

  if (side === "up") {
    if (sweep?.direction === "DOWN" && sweep.status === "SETUP") {
      return `Sweep low → reclaim above compression magnet ${magnet ?? "—"}.`;
    }
    if (gamma?.nearestLevel && gamma.nearestLevel.price > (input.spot ?? 0)) {
      return `Accepted break above local flip ${fmtLevel(gamma.nearestLevel.price)}.`;
    }
    if (wall?.side === "ASK") {
      return `Acceptance through ask wall ${fmtLevel(wall.price)}.`;
    }
    return `Acceptance above ${up ?? "upside trigger"} with MODERATE/STRONG flow.`;
  }

  if (sweep?.direction === "DOWN" && (sweep.status === "SETUP" || sweep.status === "TRIGGERED")) {
    return "Downside sweep resolves with acceptance below sweep level.";
  }
  if (wall?.side === "BID") {
    return `Bid wall ${fmtLevel(wall.price)} fails and sellers hold below it.`;
  }
  if (liq?.absorption?.side === "BID") {
    return "Absorption fails and price accepts below the wall.";
  }
  return `Acceptance below ${down ?? "downside trigger"} with failed reclaim.`;
}

function buildConditionText(ctx: ScenarioBuildCtx, blocking: string[]): string {
  const { side, output, confirmation } = ctx;
  const sufficient = confirmSufficient(confirmation);
  const hasHardBlock =
    output.signalAlignment === "STRONGLY_CONFLICTED" ||
    output.tradeQuality === "NO TRADE" ||
    ctx.mode === "NO_TRADE";

  if (sufficient && hasHardBlock) {
    return side === "up"
      ? "Upside has strong flow confirmation, but conflict must resolve before entry."
      : "Downside has strong flow confirmation, but conflict must resolve before entry.";
  }

  if (!sufficient) {
    return "Requires MODERATE/STRONG confirmation before entry.";
  }

  if (side === "up") {
    return "Upside expansion after accepted break through trigger and liquidity path.";
  }
  return "Downside expansion after accepted break below trigger with failed reclaim.";
}

function hasValidStructure(ctx: ScenarioBuildCtx): boolean {
  const t = ctx.output.triggerZones;
  const up = t.upsideExpansionTrigger;
  const down = t.downsideExpansionTrigger;
  return Number.isFinite(up) && Number.isFinite(down) && up > 0 && down > 0;
}

function isHardBlock(reasons: string[]): boolean {
  const hard = [
    "strongly conflicted",
    "NO TRADE",
    "Range chop",
    "Opposite-side",
    "Near gamma flip",
    "mostly consumed",
    "inside compression",
    "Execution bias is NO TRADE",
  ];
  return reasons.some((r) => hard.some((h) => r.toLowerCase().includes(h.toLowerCase())));
}

function resolveScenarioStatus(
  ctx: ScenarioBuildCtx,
  blockingReasons: string[],
): PlaybookScenarioStatus {
  if (!hasValidStructure(ctx)) return "DISABLED";

  const { side, output, mode, confirmation } = ctx;
  const rank = confirmRank(confirmation);
  const hard = isHardBlock(blockingReasons);

  if (rank === 0 && hard) return "DISABLED";
  if (hard && (rank >= 2 || mode === "NO_TRADE" || output.executionBias === "NO_TRADE")) {
    return "BLOCKED";
  }

  const aligned =
    output.signalAlignment === "ALIGNED" || output.signalAlignment === "PARTIALLY_ALIGNED";
  const sideBiasOk =
    side === "up"
      ? output.directionalPressure === "UPSIDE" || output.executionBias === "LONG"
      : output.directionalPressure === "DOWNSIDE" || output.executionBias === "SHORT";

  const activeOk =
    rank >= 2 &&
    aligned &&
    output.tradeQuality !== "NO TRADE" &&
    output.resolutionState === "CLEAN_CONTINUATION" &&
    mode === "CONTINUATION" &&
    sideBiasOk &&
    !hard &&
    blockingReasons.filter((r) => r.includes("has not")).length === 0;

  if (activeOk) return "ACTIVE";

  if (rank >= 1 || mode === "WAIT_TRIGGER" || mode === "WAIT_CONFIRMATION") {
    if (hard) return "BLOCKED";
    return "WAITING";
  }

  return "DISABLED";
}

function buildDirectionalScenario(ctx: ScenarioBuildCtx): VolatilityPlaybookScenario {
  const confirmation = ctx.confirmation;
  const blockingReasons = collectBlockingReasons(ctx);
  const scenarioStatus = resolveScenarioStatus(ctx, blockingReasons);
  const targets = resolveTargetHierarchy(ctx.side, ctx.output, ctx.input);
  const liq = ctx.input.liquidity;
  const gamma = ctx.input.gamma;
  const triggers = ctx.output.triggerZones;

  let invalidation =
    ctx.side === "up"
      ? "Failed acceptance back below trigger."
      : "Failed acceptance back above trigger.";
  if (liq?.nearestWall?.side === "ASK" && ctx.side === "up") {
    invalidation = "Rejection at ask wall with absorption.";
  }
  if (liq?.nearestWall?.side === "BID" && ctx.side === "down") {
    invalidation = "Bid absorption holds and price reclaims wall.";
  }
  invalidation += ` Return to compression magnet ${fmtLevel(triggers.compressionMagnet) ?? "—"} invalidates.`;

  const enabled = scenarioStatus !== "DISABLED";

  return {
    enabled,
    scenarioStatus,
    condition: buildConditionText(ctx, blockingReasons),
    activationTrigger: buildActivationTrigger(ctx),
    confirmation,
    blockingReasons: blockingReasons.slice(0, 3),
    ...targets,
    invalidation,
  };
}

function selectMode(output: VolatilityEngineOutput): PlaybookMode {
  const aligned = output.signalAlignment;
  const exec = output.executionBias;
  const res = output.resolutionState;
  const vol = output.volState;
  const expansion = output.expansionRisk;

  if (exec === "NO_TRADE" || aligned === "STRONGLY_CONFLICTED") return "NO_TRADE";
  if (res === "WAIT_SWEEP_RESOLUTION") return "WAIT_CONFIRMATION";
  if (res === "CHOP_NO_TRADE") return "RANGE_CHOP";
  if (res === "ABSORPTION_REVERSAL_RISK") return "REVERSAL_WATCH";
  if (res === "CLEAN_CONTINUATION") return "CONTINUATION";
  if (
    (vol === "COMPRESSED" || vol === "LOADED") &&
    expansion >= 50 &&
    res !== "CONFLICTED_CONTINUATION"
  ) {
    return "WAIT_TRIGGER";
  }
  if (aligned === "CONFLICTED" || res === "CONFLICTED_CONTINUATION") return "WAIT_CONFIRMATION";
  if (res === "FAKEOUT_RISK" || res === "WAIT_ACCEPTANCE") return "WAIT_CONFIRMATION";
  if (vol === "EXHAUSTED") return "REVERSAL_WATCH";
  return "WAIT_TRIGGER";
}

function modeCopy(
  mode: PlaybookMode,
  output?: VolatilityEngineOutput,
): { headline: string; summary: string; currentAction: string } {
  switch (mode) {
    case "NO_TRADE":
      return {
        headline: "NO TRADE — WAIT FOR RESOLUTION",
        summary:
          "Signals are conflicted. Gamma transition, mixed liquidity and poor trade quality require confirmation before entry.",
        currentAction:
          "Stand aside until accepted displacement, sweep reclaim, or failed continuation resolves the range.",
      };
    case "WAIT_CONFIRMATION":
      if (output?.resolutionState === "WAIT_SWEEP_RESOLUTION") {
        return {
          headline: "WAIT SWEEP RESOLUTION",
          summary:
            "Reclaim after sweep favors reversal. Acceptance beyond the wall favors continuation.",
          currentAction: "Do not enter before sweep resolution.",
        };
      }
      return {
        headline: "WAIT CONFIRMATION",
        summary:
          output?.resolutionHint ||
          "Conflicting signals require confirmation before directional execution.",
        currentAction: "Do not enter until confirmation reaches MODERATE or STRONG.",
      };
    case "WAIT_TRIGGER":
      return {
        headline: "WAIT TRIGGER — EXPANSION BUILDING",
        summary:
          "Compression is active. Expansion requires accepted break through trigger zone.",
        currentAction: "Prepare both scenarios, but wait for confirmation.",
      };
    case "CONTINUATION":
      return {
        headline: "CONTINUATION PLAYBOOK ACTIVE",
        summary:
          "Directional pressure, liquidity path and confirmation are aligned.",
        currentAction: "Favor pullback continuation after accepted trigger.",
      };
    case "REVERSAL_WATCH":
      return {
        headline: "REVERSAL WATCH — ABSORPTION ACTIVE",
        summary:
          "Absorption after extension can trap late continuation traders.",
        currentAction: "Wait for reclaim or failed continuation before entry.",
      };
    case "RANGE_CHOP":
      return {
        headline: "RANGE CHOP — NO EDGE",
        summary: "Market is near equilibrium or transition. First breaks can fail.",
        currentAction: "Wait for displacement away from magnet/range midpoint.",
      };
    default:
      return {
        headline: "NO TRADE — INSUFFICIENT CONTEXT",
        summary: "Playbook context is incomplete. Stand aside until data is live.",
        currentAction: "Do not force a directional trade.",
      };
  }
}

function buildAvoidRules(
  output: VolatilityEngineOutput,
  input: VolatilityPlaybookEngineInput,
): string[] {
  const rules: string[] = [];
  const gamma = input.gamma;
  const ctx = input.liquidity;

  if (gamma?.nearFlip || gamma?.gammaRegime === "NEAR_FLIP") {
    rules.push("Do not chase first break near gamma flip.");
  }
  if (output.volState === "COMPRESSED" || output.volState === "LOADED") {
    rules.push("Do not trade midpoint noise inside compression.");
  }
  if (ctx?.absorption?.side === "BID" && output.directionalPressure === "DOWNSIDE") {
    rules.push("Do not short into bid absorption without acceptance below wall.");
  }
  if (ctx?.absorption?.side === "ASK" && output.directionalPressure === "UPSIDE") {
    rules.push("Do not long into ask absorption without acceptance above wall.");
  }
  if (gamma?.gammaRegime === "SHORT_GAMMA" && output.liquidityRegime === "THIN_LIQUIDITY") {
    rules.push("Do not fade accepted short-gamma expansion without absorption.");
  }
  if (output.moveUsed > 80 || output.volState === "EXHAUSTED") {
    rules.push("Do not enter after most of expected move is consumed without pullback.");
  }
  if (output.resolutionState === "WAIT_SWEEP_RESOLUTION") {
    rules.push("Do not enter before sweep resolves — reclaim or acceptance.");
  }
  if (rules.length < 2) {
    rules.push("Do not force trades when confirmation is NONE or WEAK.");
  }
  return [...new Set(rules)].slice(0, 4);
}

function buildNextCheckpoint(
  output: VolatilityEngineOutput,
  mode: PlaybookMode,
): string {
  const up = fmtLevel(output.triggerZones.upsideExpansionTrigger);
  const down = fmtLevel(output.triggerZones.downsideExpansionTrigger);
  const magnet = fmtLevel(output.triggerZones.compressionMagnet);

  if (output.resolutionState === "WAIT_SWEEP_RESOLUTION") {
    return "Next checkpoint: sweep resolves — reclaim or acceptance.";
  }
  if (output.resolutionState === "ABSORPTION_REVERSAL_RISK") {
    return "Next checkpoint: absorption either fails or confirms reclaim.";
  }
  if (mode === "WAIT_TRIGGER" || output.volState === "COMPRESSED" || output.volState === "LOADED") {
    return `Next checkpoint: price leaves compression magnet ${magnet ?? "—"} with MODERATE/STRONG confirmation.`;
  }
  if (up && down) {
    return `Next checkpoint: accepted break above ${up} or below ${down}.`;
  }
  return "Next checkpoint: trigger acceptance with MODERATE/STRONG confirmation.";
}

const emptyScenario = (overrides?: Partial<VolatilityPlaybookScenario>): VolatilityPlaybookScenario => ({
  enabled: false,
  scenarioStatus: "DISABLED",
  condition: "Insufficient context.",
  activationTrigger: "—",
  confirmation: "NONE",
  blockingReasons: [],
  invalidation: "—",
  ...overrides,
});

const FALLBACK_PLAYBOOK: VolatilityOperationalPlaybook = {
  mode: "NO_TRADE",
  headline: "NO TRADE — INSUFFICIENT CONTEXT",
  summary: "Playbook context is incomplete. Stand aside until engine data is live.",
  currentAction: "Do not force a directional trade.",
  upsideScenario: emptyScenario(),
  downsideScenario: emptyScenario(),
  avoid: ["Do not trade without live volatility and liquidity context."],
  nextCheckpoint: "Next checkpoint: wait for DATA: LIVE.",
};

export function buildVolatilityPlaybook(
  output: VolatilityEngineOutput,
  input: VolatilityPlaybookEngineInput = {},
): VolatilityOperationalPlaybook {
  if (!output.computedFromCandles) return FALLBACK_PLAYBOOK;

  const mode = selectMode(output);
  const copy = modeCopy(mode, output);

  const upsideCtx: ScenarioBuildCtx = {
    side: "up",
    output,
    input,
    mode,
    confirmation: confirmLevel(output, "up"),
  };
  const downsideCtx: ScenarioBuildCtx = {
    side: "down",
    output,
    input,
    mode,
    confirmation: confirmLevel(output, "down"),
  };

  const upsideScenario = buildDirectionalScenario(upsideCtx);
  const downsideScenario = buildDirectionalScenario(downsideCtx);

  return {
    mode,
    headline: copy.headline,
    summary: copy.summary,
    currentAction: copy.currentAction,
    upsideScenario,
    downsideScenario,
    avoid: buildAvoidRules(output, input),
    nextCheckpoint: buildNextCheckpoint(output, mode),
  };
}

function executiveFromPlaybook(pb: VolatilityOperationalPlaybook): {
  headline: string;
  subtext: string;
} {
  const strongBlocked =
    pb.mode === "NO_TRADE" &&
    (["upsideScenario", "downsideScenario"] as const).some((k) => {
      const s = pb[k];
      return (
        s.scenarioStatus === "BLOCKED" &&
        confirmRank(s.confirmation) >= 2
      );
    });

  const base = (() => {
    switch (pb.mode) {
      case "NO_TRADE":
        return {
          headline: "NO TRADE — WAIT FOR RESOLUTION.",
          subtext:
            "Signals are conflicted. Wait for accepted displacement, sweep reclaim, or failed continuation.",
        };
      case "WAIT_TRIGGER":
        return {
          headline: "WAIT TRIGGER — EXPANSION BUILDING.",
          subtext:
            "Compression is active. Trade only after accepted break through trigger zone.",
        };
      case "CONTINUATION":
        return {
          headline: "CONTINUATION PLAYBOOK ACTIVE.",
          subtext:
            "Directional pressure, liquidity path and confirmation align. Favor pullbacks after accepted trigger.",
        };
      case "REVERSAL_WATCH":
        return {
          headline: "REVERSAL WATCH — ABSORPTION ACTIVE.",
          subtext:
            "Late continuation quality is poor. Wait for reclaim or trapped flow.",
        };
      case "WAIT_CONFIRMATION":
        return {
          headline: pb.headline.endsWith(".") ? pb.headline : `${pb.headline}.`,
          subtext: pb.summary,
        };
      case "RANGE_CHOP":
        return { headline: "RANGE CHOP — NO EDGE.", subtext: pb.summary };
      default:
        return { headline: pb.headline, subtext: pb.summary };
    }
  })();

  if (strongBlocked) {
    return {
      ...base,
      subtext: `${base.subtext} Some directional confirmation exists, but conflict and trade quality still block entry.`,
    };
  }

  return base;
}

export function refineVolatilityWithPlaybook(
  output: VolatilityEngineOutput,
  input: VolatilityPlaybookEngineInput = {},
): VolatilityEngineOutput {
  const playbook = buildVolatilityPlaybook(output, input);
  const exec = executiveFromPlaybook(playbook);

  return {
    ...output,
    playbook,
    explanations: {
      ...output.explanations,
      executiveDecision: exec.headline,
      executiveSubtext: exec.subtext,
    },
  };
}
