/**
 * Phase 3.5 — operational gamma interpretation (no orderbook / orderflow).
 */

import type { TerminalState } from "@/hooks/useTerminalState";
import type { TerminalStateOptionsGammaExtras } from "@shared/schema";
import type { KeyLevels, MarketState, OptionsPositioning } from "@shared/schema";
import type {
  VolatilityEngineOutput,
  VolMarketEnergyState,
  VolExpansionRiskLevel,
  VolEngineAction,
  VolReversalWatch,
} from "@/lib/volatilityEngine";

export type GammaRegimeClass =
  | "SHORT_GAMMA"
  | "LONG_GAMMA"
  | "MIXED"
  | "NEAR_FLIP"
  | "UNKNOWN";

export type GammaVolImpact =
  | "ACCELERATION_RISK"
  | "EXPANSION_FAVORED"
  | "MEAN_REVERSION_FAVORED"
  | "COMPRESSION_FAVORED"
  | "FAKEOUT_RISK"
  | "LOCAL_ACCELERATION_RISK"
  | "GLOBAL_ACCELERATION_RISK";

export type GammaDealerBehavior = "CHASING" | "DAMPENING" | "UNSTABLE" | "—";

export type NearestGammaLevel = {
  type: string;
  price: number;
  distancePct: number;
  status: "NEAR" | "APPROACHING" | "DISTANT";
  description: string;
};

export type GammaInterpretationBundle = {
  gammaIntegrated: boolean;
  gammaRegime: GammaRegimeClass;
  localGammaRaw: string;
  globalGammaRaw: string;
  dealerBehavior: GammaDealerBehavior;
  gammaVolImpact: string;
  gammaVolImpactSecondary?: string;
  gammaInterpretation: string;
  gammaPrimaryRisk: string;
  gammaSecondaryRisk?: string;
  gammaActionHint: string;
  nearestLevel: NearestGammaLevel | null;
  levelsCompact: string;
  magnetsCompact: string;
  gammaStripTag: string;
  nearFlip: boolean;
  inShortGammaPocket: boolean;
};

const RISK_RANK: Record<VolExpansionRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EXTREME: 3,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function bumpRisk(level: VolExpansionRiskLevel): VolExpansionRiskLevel {
  const order: VolExpansionRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
  const i = order.indexOf(level);
  return order[Math.min(i + 1, order.length - 1)]!;
}

function fmtPrice(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function normalizeRegime(raw: string | null | undefined): "SHORT" | "LONG" | null {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.toUpperCase().replace(/\s+/g, "_");
  if (u.includes("SHORT")) return "SHORT";
  if (u.includes("LONG")) return "LONG";
  return null;
}

function displayRegime(r: "SHORT" | "LONG" | null): string {
  if (r === "SHORT") return "SHORT GAMMA";
  if (r === "LONG") return "LONG GAMMA";
  return "—";
}

export function hasValidGammaTerminalData(terminal: TerminalState | undefined): boolean {
  if (!terminal?.market) return false;
  const m = terminal.market;
  const opts = terminal.options as TerminalStateOptionsGammaExtras | undefined;
  const local = normalizeRegime(opts?.gammaRegimeLocal ?? undefined);
  const global = normalizeRegime(m.gammaRegime ?? undefined);
  if (local || global) return true;
  if (m.gammaFlip != null && m.gammaFlip > 0) return true;
  if (opts?.gammaFlipLocal != null && opts.gammaFlipLocal > 0) return true;
  if (opts?.gammaFlipGlobal != null && opts.gammaFlipGlobal > 0) return true;
  return false;
}

function spotInRange(spot: number, start?: number | null, end?: number | null): boolean {
  if (!Number.isFinite(spot) || spot <= 0) return false;
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return spot >= lo && spot <= hi;
}

function distPct(spot: number, level: number): number {
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(level)) return Infinity;
  return (Math.abs(spot - level) / spot) * 100;
}

function proximityStatus(pct: number): NearestGammaLevel["status"] {
  if (pct < 0.35) return "NEAR";
  if (pct < 0.75) return "APPROACHING";
  return "DISTANT";
}

function findNearestGammaLevel(
  spot: number,
  market: MarketState | undefined,
  opts: TerminalStateOptionsGammaExtras | undefined,
  levels: KeyLevels | undefined,
  positioning: OptionsPositioning | undefined,
): NearestGammaLevel | null {
  if (!Number.isFinite(spot) || spot <= 0) return null;

  if (
    spotInRange(spot, market?.transitionZoneStart, market?.transitionZoneEnd) ||
    spotInRange(spot, opts?.localTransitionZoneStart, opts?.localTransitionZoneEnd)
  ) {
    return {
      type: "Transition Zone",
      price: spot,
      distancePct: 0,
      status: "NEAR",
      description: "Regime transition nearby. First breakout can fail.",
    };
  }

  const candidates: { type: string; price: number; priority: number }[] = [];

  const push = (type: string, price: number | null | undefined, priority: number) => {
    if (price != null && Number.isFinite(price) && price > 0) {
      candidates.push({ type, price, priority });
    }
  };

  push("Local Flip", opts?.gammaFlipLocal, 1);
  push("Global Flip", opts?.gammaFlipGlobal ?? market?.gammaFlip, 2);
  push("Broad Flip", opts?.gammaFlipBroad ?? market?.gammaFlip, 3);
  push("Call Wall", positioning?.callWall, 4);
  push("Put Wall", positioning?.putWall, 4);
  levels?.gammaMagnets?.forEach((m, i) => {
    if (Number.isFinite(m) && m > 0) push(`Magnet ${i + 1}`, m, 5);
  });

  if (
    levels?.shortGammaPocketStart != null &&
    levels?.shortGammaPocketEnd != null &&
    spotInRange(spot, levels.shortGammaPocketStart, levels.shortGammaPocketEnd)
  ) {
    const mid = (levels.shortGammaPocketStart + levels.shortGammaPocketEnd) / 2;
    return {
      type: "Short Gamma Pocket",
      price: mid,
      distancePct: distPct(spot, mid),
      status: "NEAR",
      description: "Inside short gamma pocket. Acceleration and whip risk elevated.",
    };
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const da = distPct(spot, a.price);
    const db = distPct(spot, b.price);
    if (Math.abs(da - db) > 0.02) return da - db;
    return a.priority - b.priority;
  });

  const best = candidates[0]!;
  const d = distPct(spot, best.price);
  const status = proximityStatus(d);

  let description = "Meaningful gamma structure nearby.";
  if (best.type.includes("Flip")) {
    description = "Regime transition nearby. First breakout can fail.";
  } else if (best.type.includes("Wall")) {
    description = "OI wall nearby. Rejection or acceleration depends on acceptance.";
  } else if (best.type.includes("Magnet")) {
    description = "Gamma magnet nearby. Price may pin or reject until displacement.";
  }

  return {
    type: best.type,
    price: best.price,
    distancePct: d,
    status,
    description,
  };
}

function classifyGammaProfile(
  local: "SHORT" | "LONG" | null,
  global: "SHORT" | "LONG" | null,
  nearFlip: boolean,
): Pick<
  GammaInterpretationBundle,
  | "gammaRegime"
  | "dealerBehavior"
  | "gammaVolImpact"
  | "gammaVolImpactSecondary"
  | "gammaInterpretation"
  | "gammaPrimaryRisk"
  | "gammaSecondaryRisk"
  | "gammaActionHint"
> {
  if (nearFlip && (!local || !global || local === global)) {
    return {
      gammaRegime: "NEAR_FLIP",
      dealerBehavior: "UNSTABLE",
      gammaVolImpact: "FAKEOUT_RISK",
      gammaInterpretation:
        "Price is near a gamma flip or transition zone. Regime can shift quickly; first breaks often fail.",
      gammaPrimaryRisk: "Fakeout risk near transition zone",
      gammaSecondaryRisk: "Regime shift on acceptance",
      gammaActionHint:
        "Wait for acceptance beyond flip or sweep + reclaim. Avoid first touch.",
    };
  }

  if (local === "SHORT" && global === "SHORT") {
    return {
      gammaRegime: "SHORT_GAMMA",
      dealerBehavior: "CHASING",
      gammaVolImpact: "EXPANSION_FAVORED",
      gammaVolImpactSecondary: "ACCELERATION_RISK",
      gammaInterpretation: "Dealers may chase accepted moves. Expansion can accelerate.",
      gammaPrimaryRisk: "Acceleration on acceptance",
      gammaActionHint: "Favor continuation on confirmed breaks; do not fade without absorption.",
    };
  }

  if (local === "LONG" && global === "LONG") {
    return {
      gammaRegime: "LONG_GAMMA",
      dealerBehavior: "DAMPENING",
      gammaVolImpact: "MEAN_REVERSION_FAVORED",
      gammaVolImpactSecondary: "COMPRESSION_FAVORED",
      gammaInterpretation:
        "Dealers may dampen movement. Extremes are more likely to mean-revert unless acceptance is strong.",
      gammaPrimaryRisk: "Mean-reversion at extremes",
      gammaActionHint: "Fade extremes only after absorption or failed breakout.",
    };
  }

  if (local === "SHORT" && global === "LONG") {
    return {
      gammaRegime: "MIXED",
      dealerBehavior: "UNSTABLE",
      gammaVolImpact: "FAKEOUT_RISK",
      gammaVolImpactSecondary: "LOCAL_ACCELERATION_RISK",
      gammaInterpretation:
        "Local short gamma can amplify movement, but global long gamma can dampen or reject extremes.",
      gammaPrimaryRisk: "Fakeout risk near transition",
      gammaSecondaryRisk: "Local acceleration if trigger accepts",
      gammaActionHint:
        "Wait for acceptance beyond the nearest flip or sweep + reclaim. Avoid first touch.",
    };
  }

  if (local === "LONG" && global === "SHORT") {
    return {
      gammaRegime: "MIXED",
      dealerBehavior: "UNSTABLE",
      gammaVolImpact: "FAKEOUT_RISK",
      gammaVolImpactSecondary: "GLOBAL_ACCELERATION_RISK",
      gammaInterpretation:
        "Local damping can create chop, but global short gamma can accelerate accepted breaks.",
      gammaPrimaryRisk: "Chop then acceleration risk",
      gammaSecondaryRisk: "Global acceleration on acceptance",
      gammaActionHint:
        "Wait for clean acceptance through mixed structure. Do not trade mid-range chop.",
    };
  }

  const single = local ?? global;
  if (single === "SHORT") {
    return classifyGammaProfile("SHORT", "SHORT", false);
  }
  if (single === "LONG") {
    return classifyGammaProfile("LONG", "LONG", false);
  }

  return {
    gammaRegime: "UNKNOWN",
    dealerBehavior: "—",
    gammaVolImpact: "FAKEOUT_RISK",
    gammaInterpretation: "Gamma regime unclear. Rely on candle triggers and confirmation.",
    gammaPrimaryRisk: "Structure unclear",
    gammaActionHint: "Wait for clearer regime or trigger acceptance.",
  };
}

function formatImpactDisplay(primary: string, secondary?: string): string {
  const p = primary.replace(/_/g, " ");
  if (!secondary) return p;
  return `${p} + ${secondary.replace(/_/g, " ")}`;
}

function buildLevelsCompact(
  market: MarketState | undefined,
  opts: TerminalStateOptionsGammaExtras | undefined,
  positioning: OptionsPositioning | undefined,
): string {
  const parts: string[] = [];
  const gFlip = opts?.gammaFlipGlobal;
  const lFlip = opts?.gammaFlipLocal;
  const broad = opts?.gammaFlipBroad ?? market?.gammaFlip;
  if (gFlip != null && gFlip > 0) parts.push(`Global Flip ${fmtPrice(gFlip)}`);
  if (lFlip != null && lFlip > 0) parts.push(`Local Flip ${fmtPrice(lFlip)}`);
  else if (broad != null && broad > 0 && !parts.some((p) => p.includes("Flip"))) {
    parts.push(`Flip ${fmtPrice(broad)}`);
  }
  if (positioning?.callWall != null && positioning.callWall > 0) {
    parts.push(`Call Wall ${fmtPrice(positioning.callWall)}`);
  }
  if (positioning?.putWall != null && positioning.putWall > 0) {
    parts.push(`Put Wall ${fmtPrice(positioning.putWall)}`);
  }
  return parts.length ? `Levels: ${parts.join(" / ")}` : "—";
}

function buildMagnetsCompact(levels: KeyLevels | undefined): string {
  const m = levels?.gammaMagnets?.filter((x) => Number.isFinite(x) && x > 0) ?? [];
  if (!m.length) return "—";
  return `Magnets: ${m.map((x) => fmtPrice(x)).join(" / ")}`;
}

export function buildGammaInterpretation(
  terminal: TerminalState | undefined,
  spot: number | undefined,
): GammaInterpretationBundle {
  const empty: GammaInterpretationBundle = {
    gammaIntegrated: false,
    gammaRegime: "UNKNOWN",
    localGammaRaw: "—",
    globalGammaRaw: "—",
    dealerBehavior: "—",
    gammaVolImpact: "—",
    gammaInterpretation: "",
    gammaPrimaryRisk: "",
    gammaActionHint: "",
    nearestLevel: null,
    levelsCompact: "—",
    magnetsCompact: "—",
    gammaStripTag: "",
    nearFlip: false,
    inShortGammaPocket: false,
  };

  if (!hasValidGammaTerminalData(terminal)) return empty;

  const market = terminal!.market;
  const opts = terminal!.options as TerminalStateOptionsGammaExtras | undefined;
  const levels = terminal!.levels as KeyLevels | undefined;
  const positioning = terminal!.positioning as OptionsPositioning | undefined;

  const localR = normalizeRegime(opts?.gammaRegimeLocal ?? undefined);
  const globalR = normalizeRegime(market.gammaRegime ?? undefined);
  const localGammaRaw = displayRegime(localR);
  const globalGammaRaw = displayRegime(globalR);

  const spotPrice =
    spot != null && Number.isFinite(spot) && spot > 0
      ? spot
      : typeof terminal!.ticker?.price === "number"
        ? terminal!.ticker!.price
        : NaN;

  const distFlip = market.distanceToFlip;
  const nearFlip =
    (distFlip != null && Number.isFinite(distFlip) && distFlip < 0.35) ||
    spotInRange(spotPrice, market.transitionZoneStart, market.transitionZoneEnd) ||
    spotInRange(spotPrice, opts?.localTransitionZoneStart, opts?.localTransitionZoneEnd);

  const inShortGammaPocket =
    Number.isFinite(spotPrice) &&
    spotInRange(spotPrice, levels?.shortGammaPocketStart, levels?.shortGammaPocketEnd);

  const profile = classifyGammaProfile(localR, globalR, nearFlip);
  let gammaRegime = profile.gammaRegime;
  if (nearFlip && gammaRegime !== "MIXED" && localR && globalR && localR !== globalR) {
    gammaRegime = "MIXED";
  } else if (nearFlip && gammaRegime === "SHORT_GAMMA") {
    gammaRegime = "NEAR_FLIP";
  } else if (nearFlip && gammaRegime === "LONG_GAMMA") {
    gammaRegime = "NEAR_FLIP";
  }

  const nearestLevel = Number.isFinite(spotPrice)
    ? findNearestGammaLevel(spotPrice, market, opts, levels, positioning)
    : null;

  let dealerBehavior = profile.dealerBehavior;
  if (nearestLevel?.status === "NEAR" && gammaRegime !== "MIXED" && dealerBehavior !== "CHASING") {
    dealerBehavior = "UNSTABLE";
  }

  const gammaVolImpact = formatImpactDisplay(
    profile.gammaVolImpact,
    profile.gammaVolImpactSecondary,
  );

  const regimeLabel =
    gammaRegime === "MIXED"
      ? "MIXED / TRANSITION"
      : gammaRegime === "NEAR_FLIP"
        ? "NEAR FLIP"
        : gammaRegime.replace(/_/g, " ");

  const gammaStripTag = `GAMMA: ${regimeLabel} | DEALERS: ${dealerBehavior} | IMPACT: ${profile.gammaVolImpact.replace(/_/g, " ")}`;

  return {
    gammaIntegrated: true,
    gammaRegime,
    localGammaRaw,
    globalGammaRaw,
    dealerBehavior,
    gammaVolImpact,
    gammaVolImpactSecondary: profile.gammaVolImpactSecondary,
    gammaInterpretation: profile.gammaInterpretation,
    gammaPrimaryRisk: profile.gammaPrimaryRisk,
    gammaSecondaryRisk: profile.gammaSecondaryRisk,
    gammaActionHint: profile.gammaActionHint,
    nearestLevel,
    levelsCompact: buildLevelsCompact(market, opts, positioning),
    magnetsCompact: buildMagnetsCompact(levels),
    gammaStripTag,
    nearFlip,
    inShortGammaPocket,
  };
}

function executiveWithGamma(
  volState: VolMarketEnergyState,
  g: GammaInterpretationBundle,
): { headline: string; subtext: string } {
  const regime = g.gammaRegime;

  if (g.nearFlip || regime === "NEAR_FLIP") {
    return {
      headline: "MARKET IS NEAR GAMMA FLIP. FAKEOUT RISK IS HIGH.",
      subtext:
        "Regime transition zones can reject first breaks. Wait for acceptance or sweep reclaim.",
    };
  }

  if (regime === "MIXED" && volState === "EXHAUSTED") {
    return {
      headline: "MARKET IS EXTENDED INSIDE MIXED GAMMA. LATE CHASE RISK IS HIGH.",
      subtext:
        "Local short gamma can still amplify accepted moves, but global long gamma increases rejection and fakeout risk. Wait for absorption, reclaim, or reset.",
    };
  }

  if (regime === "MIXED") {
    return {
      headline: "MIXED GAMMA REGIME. CONFIRMATION REQUIRED.",
      subtext: g.gammaInterpretation,
    };
  }

  if (regime === "SHORT_GAMMA" && volState === "LOADED") {
    return {
      headline: "MARKET IS LOADED. SHORT GAMMA CAN AMPLIFY EXPANSION.",
      subtext:
        "Compression is active and dealer behavior may chase accepted moves. Wait for trigger confirmation.",
    };
  }

  if (regime === "LONG_GAMMA" && volState === "EXHAUSTED") {
    return {
      headline: "MARKET IS EXTENDED INSIDE LONG GAMMA. MEAN REVERSION RISK IS HIGH.",
      subtext:
        "Dealer damping can reject late continuation. Avoid chasing unless fresh flow confirms acceptance.",
    };
  }

  if (regime === "SHORT_GAMMA" && volState === "EXPANDING") {
    return {
      headline: "SHORT GAMMA EXPANSION. FOLLOW PULLBACKS, DO NOT FADE BLINDLY.",
      subtext: g.gammaInterpretation,
    };
  }

  if (regime === "LONG_GAMMA") {
    return {
      headline: "LONG GAMMA ENVIRONMENT. RESPECT DAMPING.",
      subtext: g.gammaInterpretation,
    };
  }

  return {
    headline: "",
    subtext: "",
  };
}

function playbookWithGamma(g: GammaInterpretationBundle): {
  bestPlay: string;
  avoid: string;
} | null {
  switch (g.gammaRegime) {
    case "MIXED":
    case "NEAR_FLIP":
      return {
        bestPlay:
          "Wait for acceptance beyond the nearest flip or sweep + reclaim. Mixed gamma favors fakeouts before resolution.",
        avoid:
          "Do not chase first break near transition. Do not fade accepted short-gamma expansion without absorption.",
      };
    case "SHORT_GAMMA":
      return {
        bestPlay:
          "If trigger accepts with expansion, favor continuation pullbacks over blind fades.",
        avoid: "Do not fade acceleration without absorption or failed continuation.",
      };
    case "LONG_GAMMA":
      return {
        bestPlay: "Fade extremes only after absorption or failed breakout. Respect walls and magnets.",
        avoid: "Do not chase into long-gamma damping zones.",
      };
    default:
      return null;
  }
}

function applyGammaScoring(
  output: VolatilityEngineOutput,
  g: GammaInterpretationBundle,
): Partial<VolatilityEngineOutput> {
  let expansionRisk = output.expansionRisk;
  let tradeQualityScore = output.tradeQualityScore;
  let lateChaseRisk = output.lateChaseRisk;
  let reversalWatch = output.reversalWatch;
  let cleanExpansionRiskLabel = output.cleanExpansionRiskLabel;
  let tradeRiskLabel = output.tradeRiskLabel;
  let action: VolEngineAction = output.action;
  const reasons = [...output.qualityReasons];

  const vol = output.volState;
  const moveUsed = output.moveUsed;

  if (g.gammaRegime === "SHORT_GAMMA") {
    if (vol === "LOADED" || vol === "EXPANDING") expansionRisk = clamp(expansionRisk + 15, 0, 100);
    if (moveUsed > 70) {
      tradeRiskLabel = bumpRisk(tradeRiskLabel);
      lateChaseRisk = bumpRisk(lateChaseRisk);
    }
  }

  if (g.gammaRegime === "LONG_GAMMA") {
    if (vol !== "EXPANDING") expansionRisk = clamp(expansionRisk - 15, 0, 100);
    if (moveUsed > 70) {
      reversalWatch =
        reversalWatch === "INACTIVE" ? "ACTIVE" : reversalWatch === "ACTIVE" ? "HIGH" : "HIGH";
      reasons.push("Long gamma favors mean-reversion when extended");
    }
  }

  if (g.gammaRegime === "MIXED" || g.gammaRegime === "NEAR_FLIP" || g.nearFlip) {
    tradeRiskLabel = bumpRisk(tradeRiskLabel);
    expansionRisk = clamp(expansionRisk + 5, 0, 100);
    reversalWatch =
      reversalWatch === "INACTIVE" ? "ACTIVE" : reversalWatch === "ACTIVE" ? "HIGH" : reversalWatch;
    if (g.nearFlip) reasons.push("Price is near gamma transition zone");
    if (vol === "EXHAUSTED") action = "WAIT ABSORPTION";
    else if (action === "WAIT TRIGGER" || action === "NO TRADE") action = "WAIT CONFIRMATION";
  }

  if (g.inShortGammaPocket) {
    expansionRisk = clamp(expansionRisk + 15, 0, 100);
    tradeRiskLabel = bumpRisk(tradeRiskLabel);
    reasons.push("Inside short gamma pocket");
  }

  const riskLabelFromScore = (score: number): VolExpansionRiskLevel => {
    if (score <= 25) return "LOW";
    if (score <= 50) return "MEDIUM";
    if (score <= 75) return "HIGH";
    return "EXTREME";
  };

  cleanExpansionRiskLabel = riskLabelFromScore(expansionRisk);

  return {
    expansionRisk,
    tradeQualityScore: clamp(tradeQualityScore, 0, 100),
    lateChaseRisk,
    reversalWatch,
    cleanExpansionRiskLabel,
    tradeRiskLabel,
    riskLabel: riskLabelFromScore(expansionRisk),
    action,
    qualityReasons: [...new Set(reasons)].slice(0, 3),
  };
}

export type GammaRefinedResult = {
  output: VolatilityEngineOutput;
  gamma: GammaInterpretationBundle;
};

/** Refine candle engine output with terminal gamma interpretation. */
export function refineVolatilityWithGamma(
  output: VolatilityEngineOutput,
  terminal: TerminalState | undefined,
  spot?: number,
): GammaRefinedResult {
  const gamma = buildGammaInterpretation(terminal, spot);
  if (!gamma.gammaIntegrated) {
    return {
      output: { ...output, gammaIntegrated: false },
      gamma,
    };
  }

  const scoring = applyGammaScoring(output, gamma);
  const execGamma = executiveWithGamma(output.volState, gamma);
  const playbookGamma = playbookWithGamma(gamma);

  const executiveDecision = execGamma.headline || output.explanations.executiveDecision;
  const executiveSubtext = execGamma.subtext || output.explanations.executiveSubtext;

  return {
    output: {
      ...output,
      ...scoring,
      gammaIntegrated: true,
      gammaRegimeClass: gamma.gammaRegime,
      gammaInterpretation: gamma.gammaInterpretation,
      gammaPrimaryRisk: gamma.gammaPrimaryRisk,
      gammaSecondaryRisk: gamma.gammaSecondaryRisk,
      gammaActionHint: gamma.gammaActionHint,
      gammaVolImpact: gamma.gammaVolImpact,
      gammaDealerBehavior: gamma.dealerBehavior,
      gammaStripTag: gamma.gammaStripTag,
      explanations: {
        ...output.explanations,
        executiveDecision,
        executiveSubtext,
        bestPlay: playbookGamma?.bestPlay ?? output.explanations.bestPlay,
        avoid: playbookGamma?.avoid ?? output.explanations.avoid,
      },
    },
    gamma,
  };
}
