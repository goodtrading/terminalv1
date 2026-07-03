/**
 * Unified terminal operational snapshot — shared Web + Desktop.
 * Single derivation for Market Mode, Trading State, and Trade Setup panels.
 */

export type TradingStateStatus = "WAIT" | "WATCH" | "READY" | "ACTIVE" | "AVOID";
export type TradingStateBias = "LONG" | "SHORT" | "NEUTRAL";
export type TradingStateRisk = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type TradingStateExecution = "NO TRADE" | "PROBE ONLY" | "REDUCED SIZE" | "NORMAL SIZE";
export type TradingStateConfidence = "LOW" | "MEDIUM" | "HIGH";
export type TradingStateDataQuality = "complete" | "incomplete" | "stale";
export type MarketCondition = "WEAK" | "DEVELOPING" | "CONFIRMED";
export type FlowState = "STABLE" | "VOLATILE";
export type ComponentRisk = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export type TradingStateInput = {
  spot?: number | null;
  gammaRegime?: string | null;
  totalGex?: number | null;
  globalFlip?: number | null;
  localFlip?: number | null;
  transitionZoneStart?: number | null;
  transitionZoneEnd?: number | null;
  localTransitionZoneStart?: number | null;
  localTransitionZoneEnd?: number | null;
  dealerPivot?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  scenarioBias?: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  volatilityRisk?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  gammaAcceleration?: string | null;
  vannaBias?: string | null;
  hedgeFlowIntensity?: string | null;
  marketMode?: string | null;
  marketModeConfidence?: number | null;
  vacuumRisk?: string | null;
  institutionalBias?: string | null;
  gammaPressurePositive?: boolean;
  dataQuality?: TradingStateDataQuality;
};

export type TradingStateFactor = {
  id: string;
  label: string;
  effect: "bullish" | "bearish" | "neutral" | "risk" | "confidence";
  weight: number;
};

export type TerminalOperationalSnapshot = {
  status: TradingStateStatus;
  bias: TradingStateBias;
  risk: TradingStateRisk;
  execution: TradingStateExecution;
  confidence: TradingStateConfidence;
  reason: string;
  factors: TradingStateFactor[];
  dataQuality: TradingStateDataQuality;
  scores: {
    bullish: number;
    bearish: number;
    risk: number;
    alignment: number;
  };
  regimeState: string;
  regimeDisplay: string;
  marketCondition: MarketCondition;
  flowState: FlowState;
  componentVolatilityRisk: ComponentRisk;
  componentVacuumRisk: ComponentRisk;
  componentTransitionRisk: ComponentRisk;
  confidenceScore: number;
  confidenceBand: TradingStateConfidence;
  waitingForClarity: boolean;
  supportiveFactors: string[];
  blockers: string[];
  readinessBlockers: string[];
  drivers: string[];
  nearestLevelPct: number | null;
  triggerConfirmed: boolean;
};

/** @deprecated Use TerminalOperationalSnapshot */
export type DerivedTradingState = TerminalOperationalSnapshot;

const NEAR_LEVEL_PCT = 0.005;
const APPROACH_LEVEL_PCT = 0.02;
const STATUS_RANK: Record<TradingStateStatus, number> = {
  AVOID: -1,
  WAIT: 0,
  WATCH: 1,
  READY: 2,
  ACTIVE: 3,
};
const RISK_RANK: Record<TradingStateRisk, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  EXTREME: 3,
};

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function pctDistance(spot: number, level: number): number {
  return Math.abs(spot - level) / spot;
}

function inZone(spot: number, start?: number | null, end?: number | null): boolean {
  if (!finite(start) || !finite(end)) return false;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return spot >= lo && spot <= hi;
}

function isShortGamma(regime?: string | null): boolean {
  return typeof regime === "string" && regime.toUpperCase().includes("SHORT");
}

function isLongGamma(regime?: string | null): boolean {
  return typeof regime === "string" && regime.toUpperCase().includes("LONG");
}

function isFragileTransition(marketMode?: string | null, institutionalBias?: string | null): boolean {
  return (
    marketMode === "FRAGILE_TRANSITION" ||
    institutionalBias === "FRAGILE_TRANSITION" ||
    institutionalBias === "NEUTRAL_CHOP"
  );
}

function normalizeComponentRisk(value?: string | null): ComponentRisk {
  const v = (value ?? "").toUpperCase();
  if (v === "EXTREME") return "EXTREME";
  if (v === "HIGH") return "HIGH";
  if (v === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function maxRisk(...risks: Array<TradingStateRisk | ComponentRisk>): TradingStateRisk {
  let best: TradingStateRisk = "LOW";
  for (const risk of risks) {
    if (RISK_RANK[risk as TradingStateRisk] > RISK_RANK[best]) {
      best = risk as TradingStateRisk;
    }
  }
  return best;
}

function confidenceBandFromScore(score: number): TradingStateConfidence {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function capStatus(current: TradingStateStatus, max: TradingStateStatus): TradingStateStatus {
  if (current === "AVOID") return "AVOID";
  return STATUS_RANK[current] <= STATUS_RANK[max] ? current : max;
}

function capExecution(
  current: TradingStateExecution,
  max: TradingStateExecution,
): TradingStateExecution {
  const rank: Record<TradingStateExecution, number> = {
    "NO TRADE": 0,
    "PROBE ONLY": 1,
    "REDUCED SIZE": 2,
    "NORMAL SIZE": 3,
  };
  return rank[current] <= rank[max] ? current : max;
}

function addFactor(factors: TradingStateFactor[], factor: TradingStateFactor): void {
  factors.push(factor);
}

function deriveBias(
  bullish: number,
  bearish: number,
  factors: TradingStateFactor[],
): TradingStateBias {
  const delta = bullish - bearish;
  if (delta >= 2) {
    addFactor(factors, { id: "bias-long", label: "Bullish alignment", effect: "bullish", weight: delta });
    return "LONG";
  }
  if (delta <= -2) {
    addFactor(factors, { id: "bias-short", label: "Bearish alignment", effect: "bearish", weight: Math.abs(delta) });
    return "SHORT";
  }
  addFactor(factors, { id: "bias-neutral", label: "Mixed or weak alignment", effect: "neutral", weight: 0 });
  return "NEUTRAL";
}

function deriveRawStatus(
  bias: TradingStateBias,
  nearestLevelPct: number | null,
  triggerConfirmed: boolean,
): TradingStateStatus {
  if (bias === "NEUTRAL") return "WAIT";
  if (nearestLevelPct == null || nearestLevelPct > APPROACH_LEVEL_PCT) return "WATCH";
  if (nearestLevelPct <= NEAR_LEVEL_PCT && triggerConfirmed) return "ACTIVE";
  if (nearestLevelPct <= APPROACH_LEVEL_PCT && triggerConfirmed) return "READY";
  return "WATCH";
}

function deriveExecution(
  status: TradingStateStatus,
  risk: TradingStateRisk,
  confidence: TradingStateConfidence,
): TradingStateExecution {
  if (status === "WAIT" || status === "AVOID" || confidence === "LOW") return "NO TRADE";
  if (status === "WATCH") return confidence === "MEDIUM" ? "PROBE ONLY" : "NO TRADE";
  if (risk === "EXTREME") return "NO TRADE";
  if (risk === "HIGH") return "PROBE ONLY";
  if (status === "READY" || status === "ACTIVE") {
    if (confidence === "HIGH" && (risk === "LOW" || risk === "MEDIUM")) return "NORMAL SIZE";
    return "REDUCED SIZE";
  }
  return "NO TRADE";
}

export function formatTradeStateDriver(status: TradingStateStatus): string {
  switch (status) {
    case "WAIT":
      return "Trade state: WAIT — waiting for clarity";
    case "WATCH":
      return "Trade state: WATCH — waiting for confirmation";
    case "READY":
      return "Trade state: READY — conditions aligned";
    case "ACTIVE":
      return "Trade state: ACTIVE — setup in progress";
    case "AVOID":
      return "Trade state: AVOID — conditions unfavorable";
  }
}

export type TradingStateReasonInput = {
  bias: TradingStateBias;
  status: TradingStateStatus;
  blockers: string[];
  supportiveFactors: string[];
  componentVolatilityRisk: ComponentRisk;
  fragile: boolean;
};

function biasLeadPhrase(bias: TradingStateBias, supportiveFactors: string[]): string | null {
  const belowLocal = supportiveFactors.some((f) => /below local flip/i.test(f));
  const belowGlobal = supportiveFactors.some((f) => /below global flip/i.test(f));
  const aboveLocal = supportiveFactors.some((f) => /above local flip/i.test(f));
  const aboveGlobal = supportiveFactors.some((f) => /above global flip/i.test(f));

  if (bias === "SHORT" && belowLocal && belowGlobal) return "Bearish below both flips";
  if (bias === "LONG" && aboveLocal && aboveGlobal) return "Bullish above both flips";
  if (bias === "SHORT") return "Bearish structure";
  if (bias === "LONG") return "Bullish structure";
  return null;
}

function summarizeConfirmationBlockers(input: TradingStateReasonInput): string {
  const parts: string[] = [];
  if (input.fragile || input.blockers.some((b) => /fragile transition/i.test(b))) {
    parts.push("fragile transition");
  }
  if (
    input.componentVolatilityRisk === "HIGH" ||
    input.componentVolatilityRisk === "EXTREME" ||
    input.blockers.some((b) => /volatility risk high/i.test(b))
  ) {
    parts.push("high volatility");
  }
  if (parts.length >= 2) return `${parts[0]} and ${parts[1]}`;
  if (parts.length === 1) return parts[0];
  const meaningful = input.blockers.find(
    (b) => !/market condition developing|confidence only|complete market data/i.test(b),
  );
  return meaningful ? meaningful.toLowerCase() : "unclear structure";
}

export function buildTradingStateReason(input: TradingStateReasonInput): string {
  if (input.blockers.some((b) => /complete market data/i.test(b))) {
    return "Waiting for complete market data.";
  }

  const needsConfirmation =
    input.status === "WAIT" || input.status === "WATCH" || input.blockers.length > 0;
  const confirmBlockers = summarizeConfirmationBlockers(input);

  if (input.bias === "NEUTRAL") {
    if (needsConfirmation) {
      if (/high volatility/.test(confirmBlockers)) {
        return "Conflicting signals and high volatility require confirmation.";
      }
      return "Conflicting signals require confirmation.";
    }
    return "Monitoring structure; awaiting clearer alignment.";
  }

  const lead = biasLeadPhrase(input.bias, input.supportiveFactors);

  if (input.status === "READY" || input.status === "ACTIVE") {
    const support = input.supportiveFactors
      .slice(0, 2)
      .map((s) => s.toLowerCase())
      .join(", ");
    return `${lead ?? "Aligned structure"}${support ? ` with ${support}` : ""}.`;
  }

  if (input.status === "AVOID") {
    return "Conflicting scenarios and elevated volatility.";
  }

  if (needsConfirmation && lead) {
    if (confirmBlockers) {
      return `${lead}, but ${confirmBlockers} require confirmation.`;
    }
    return `${lead}; awaiting confirmation.`;
  }

  return "Monitoring structure; awaiting clearer alignment.";
}

function buildOperationalDrivers(
  status: TradingStateStatus,
  fragile: boolean,
  componentVolatilityRisk: ComponentRisk,
  supportiveFactors: string[],
): string[] {
  const drivers: string[] = [formatTradeStateDriver(status)];
  if (fragile) drivers.push("Regime: fragile transition");
  if (componentVolatilityRisk === "HIGH" || componentVolatilityRisk === "EXTREME") {
    drivers.push("Volatility risk: high");
  }
  for (const factor of supportiveFactors) {
    if (/price (below|above) (local|global) flip/i.test(factor)) {
      drivers.push(factor);
    }
  }
  if (drivers.length === 1) drivers.push("Monitoring structure");
  return drivers;
}

export function deriveTradingState(input: TradingStateInput): TerminalOperationalSnapshot {
  const factors: TradingStateFactor[] = [];
  const dataQuality = input.dataQuality ?? "complete";
  const regimeState = input.marketMode ?? "FRAGILE_TRANSITION";
  const regimeDisplay = regimeState.replace(/_/g, " ");

  if (!finite(input.spot) || input.spot <= 0 || !input.gammaRegime) {
    return finalizeSnapshot({
      status: "WAIT",
      bias: "NEUTRAL",
      risk: "MEDIUM",
      execution: "NO TRADE",
      confidence: "LOW",
      reason: "Waiting for complete market data.",
      factors: [{ id: "incomplete", label: "Missing spot or gamma regime", effect: "neutral", weight: 0 }],
      dataQuality: "incomplete",
      scores: { bullish: 0, bearish: 0, risk: 0, alignment: 0 },
      regimeState,
      regimeDisplay,
      marketCondition: "WEAK",
      flowState: "STABLE",
      componentVolatilityRisk: "MEDIUM",
      componentVacuumRisk: "LOW",
      componentTransitionRisk: "LOW",
      confidenceScore: 0,
      confidenceBand: "LOW",
      waitingForClarity: true,
      supportiveFactors: [],
      blockers: ["Incomplete market data"],
      readinessBlockers: ["Incomplete market data"],
      drivers: [formatTradeStateDriver("WAIT")],
      nearestLevelPct: null,
      triggerConfirmed: false,
    });
  }

  const spot = input.spot;
  let bullish = 0;
  let bearish = 0;
  let alignment = 0;
  const supportiveFactors: string[] = [];
  const blockers: string[] = [];
  const readinessBlockers: string[] = [];

  if (input.scenarioBias === "BULLISH") {
    bullish += 2;
    alignment += 1;
    supportiveFactors.push("Bullish scenario alignment");
    addFactor(factors, { id: "scenario-bull", label: "Primary scenario bullish", effect: "bullish", weight: 2 });
  } else if (input.scenarioBias === "BEARISH") {
    bearish += 2;
    alignment += 1;
    supportiveFactors.push("Bearish scenario alignment");
    addFactor(factors, { id: "scenario-bear", label: "Primary scenario bearish", effect: "bearish", weight: 2 });
  }

  if (finite(input.localFlip)) {
    if (spot > input.localFlip) {
      bullish += 1;
      alignment += 1;
      supportiveFactors.push("Price above local flip");
      addFactor(factors, { id: "above-local-flip", label: "Above local flip", effect: "bullish", weight: 1 });
    } else if (spot < input.localFlip) {
      bearish += 1;
      alignment += 1;
      supportiveFactors.push("Price below local flip");
      addFactor(factors, { id: "below-local-flip", label: "Below local flip", effect: "bearish", weight: 1 });
    }
  }

  if (finite(input.globalFlip)) {
    if (spot > input.globalFlip) {
      bullish += 1;
      supportiveFactors.push("Price above global flip");
      addFactor(factors, { id: "above-global-flip", label: "Above global flip", effect: "bullish", weight: 1 });
    } else if (spot < input.globalFlip) {
      bearish += 1;
      supportiveFactors.push("Price below global flip");
      addFactor(factors, { id: "below-global-flip", label: "Below global flip", effect: "bearish", weight: 1 });
    }
  }

  if (finite(input.dealerPivot)) {
    if (spot > input.dealerPivot) {
      bullish += 1;
      addFactor(factors, { id: "above-pivot", label: "Above dealer pivot", effect: "bullish", weight: 1 });
    } else {
      bearish += 1;
      addFactor(factors, { id: "below-pivot", label: "Below dealer pivot", effect: "bearish", weight: 1 });
    }
  }

  if (input.vannaBias === "BULLISH") {
    bullish += 1;
    addFactor(factors, { id: "vanna-bull", label: "Vanna bias bullish", effect: "bullish", weight: 1 });
  } else if (input.vannaBias === "BEARISH") {
    bearish += 1;
    addFactor(factors, { id: "vanna-bear", label: "Vanna bias bearish", effect: "bearish", weight: 1 });
  }

  const inTransition =
    inZone(spot, input.transitionZoneStart, input.transitionZoneEnd) ||
    inZone(spot, input.localTransitionZoneStart, input.localTransitionZoneEnd);

  const fragile = isFragileTransition(input.marketMode, input.institutionalBias);

  let componentVolatilityRisk: ComponentRisk = "MEDIUM";
  const volRisk = (input.volatilityRisk ?? "").toUpperCase();
  if (isShortGamma(input.gammaRegime) || volRisk === "HIGH") componentVolatilityRisk = "HIGH";
  else if (isLongGamma(input.gammaRegime) && volRisk !== "HIGH") componentVolatilityRisk = "LOW";
  else if (volRisk === "MEDIUM") componentVolatilityRisk = "MEDIUM";

  const componentVacuumRisk = normalizeComponentRisk(input.vacuumRisk);
  const componentTransitionRisk: ComponentRisk =
    fragile || inTransition ? "HIGH" : "LOW";

  let marketCondition: MarketCondition = "WEAK";
  if (isLongGamma(input.gammaRegime) && input.gammaPressurePositive) {
    marketCondition = "CONFIRMED";
  } else if (input.gammaRegime || input.gammaPressurePositive !== undefined) {
    marketCondition = "DEVELOPING";
  }

  const flowState: FlowState =
    isShortGamma(input.gammaRegime) || componentVolatilityRisk === "HIGH" ? "VOLATILE" : "STABLE";

  const levelRefs = [input.dealerPivot, input.localFlip, input.globalFlip, input.callWall, input.putWall].filter(finite);
  let nearestLevelPct: number | null = null;
  for (const level of levelRefs) {
    const d = pctDistance(spot, level);
    if (nearestLevelPct == null || d < nearestLevelPct) nearestLevelPct = d;
  }

  const bias = deriveBias(bullish, bearish, factors);
  if (bias !== "NEUTRAL") alignment += 1;
  if (bullish > 0 && bearish > 0) alignment = Math.max(0, alignment - 2);

  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      input.marketModeConfidence != null
        ? Math.round(input.marketModeConfidence)
        : alignment * 15 + 25,
    ),
  );
  let confidenceBand = confidenceBandFromScore(confidenceScore);
  if (dataQuality === "stale" && confidenceBand === "HIGH") confidenceBand = "MEDIUM";
  if (dataQuality === "incomplete") confidenceBand = "LOW";

  const triggerConfirmed =
    nearestLevelPct != null &&
    nearestLevelPct <= NEAR_LEVEL_PCT &&
    confidenceScore >= 70 &&
    marketCondition === "CONFIRMED";

  if (fragile) {
    blockers.push("Fragile transition regime");
    readinessBlockers.push("Fragile transition regime");
  }
  if (marketCondition === "DEVELOPING") {
    blockers.push("Market condition developing");
    readinessBlockers.push("Market condition developing");
  }
  if (componentVolatilityRisk === "HIGH") {
    blockers.push("Volatility risk high");
    readinessBlockers.push("Volatility risk high");
  }
  if (confidenceScore < 70) {
    blockers.push(`Confidence only ${confidenceScore}%`);
    readinessBlockers.push(`Confidence only ${confidenceScore}%`);
  }
  if (inTransition) {
    blockers.push("Inside transition zone");
    readinessBlockers.push("Inside transition zone");
  }
  if (componentVacuumRisk === "HIGH" || componentVacuumRisk === "EXTREME") {
    blockers.push("Vacuum risk elevated");
    readinessBlockers.push("Vacuum risk elevated");
  }
  if (bias === "NEUTRAL") {
    readinessBlockers.push("No directional bias");
  }
  if (nearestLevelPct == null || nearestLevelPct > APPROACH_LEVEL_PCT) {
    readinessBlockers.push("Price away from operative levels");
  }

  let status = deriveRawStatus(bias, nearestLevelPct, triggerConfirmed);
  if (dataQuality !== "complete") status = "WAIT";

  let risk = maxRisk(componentVolatilityRisk, componentVacuumRisk, componentTransitionRisk);
  if (fragile && componentVolatilityRisk === "HIGH" && risk === "MEDIUM") {
    risk = "HIGH";
  }

  let waitingForClarity =
    readinessBlockers.length > 0 ||
    status === "WAIT" ||
    (status === "WATCH" && !triggerConfirmed);

  if (waitingForClarity) {
    status = capStatus(status, "WATCH");
  }
  if (fragile && !triggerConfirmed) {
    status = capStatus(status, "WATCH");
  }
  if (marketCondition === "DEVELOPING" && !triggerConfirmed) {
    status = capStatus(status, "WATCH");
  }
  if (confidenceBand !== "HIGH" && !triggerConfirmed) {
    status = capStatus(status, "WATCH");
  }

  if (risk === "EXTREME") status = "AVOID";

  let execution = deriveExecution(status, risk, confidenceBand);
  if (waitingForClarity) {
    execution = capExecution(execution, "PROBE ONLY");
  }
  if (fragile && !triggerConfirmed) {
    execution = capExecution(execution, "PROBE ONLY");
  }

  const drivers = buildOperationalDrivers(status, fragile, componentVolatilityRisk, supportiveFactors);

  const reason = buildTradingStateReason({
    bias,
    status,
    blockers,
    supportiveFactors,
    componentVolatilityRisk,
    fragile,
  });

  return finalizeSnapshot({
    status,
    bias,
    risk,
    execution,
    confidence: confidenceBand,
    reason,
    factors,
    dataQuality,
    scores: { bullish, bearish, risk: RISK_RANK[risk], alignment },
    regimeState,
    regimeDisplay,
    marketCondition,
    flowState,
    componentVolatilityRisk,
    componentVacuumRisk,
    componentTransitionRisk,
    confidenceScore,
    confidenceBand,
    waitingForClarity,
    supportiveFactors,
    blockers,
    readinessBlockers,
    drivers,
    nearestLevelPct,
    triggerConfirmed,
  });
}

function finalizeSnapshot(snapshot: TerminalOperationalSnapshot): TerminalOperationalSnapshot {
  let { status, execution, waitingForClarity } = snapshot;
  if (waitingForClarity && (status === "READY" || status === "ACTIVE")) {
    status = "WATCH";
    execution = capExecution(execution, "PROBE ONLY");
    waitingForClarity = true;
  }
  return { ...snapshot, status, execution, waitingForClarity };
}

/** Map terminal snapshot → engine input (no extra fetches). */
export function buildTradingStateInput(snapshot: {
  market?: {
    gammaRegime?: string;
    totalGex?: number;
    gammaFlip?: number | null;
    transitionZoneStart?: number | null;
    transitionZoneEnd?: number | null;
    gammaAcceleration?: string;
    timestamp?: Date | string;
  } | null;
  exposure?: { vannaBias?: string; gammaPressure?: string } | null;
  positioning?: {
    dealerPivot?: number;
    callWall?: number;
    putWall?: number;
    tradingPlaybook?: { currentPlaybook?: { volatilityRisk?: string; directionalBias?: string } };
    dealerHedgingFlowMap?: { hedgingFlowStrength?: string };
    marketModeEngine?: {
      marketMode?: string;
      marketModeConfidence?: number;
    };
    institutionalBiasEngine?: { institutionalBias?: string };
  } | null;
  options?: {
    totalGex?: number;
    gammaFlipGlobal?: number | null;
    gammaFlipLocal?: number | null;
    localTransitionZoneStart?: number | null;
    localTransitionZoneEnd?: number | null;
    asOf?: string | null;
  } | null;
  ticker?: { price?: number; timestamp?: number } | null;
  tickerStatus?: "fresh" | "stale" | "unavailable";
  scenarios?: Array<{ type?: string; probability?: number; thesis?: string }>;
  vacuumRisk?: string | null;
}): TradingStateInput {
  const spot = snapshot.ticker?.price;
  let dataQuality: TradingStateDataQuality = "complete";
  if (!finite(spot) || spot <= 0 || !snapshot.market?.gammaRegime) {
    dataQuality = "incomplete";
  } else if (snapshot.tickerStatus === "stale" || snapshot.tickerStatus === "unavailable") {
    dataQuality = "stale";
  }

  let scenarioBias: "BULLISH" | "BEARISH" | "NEUTRAL" | null = null;
  const scenarios = snapshot.scenarios ?? [];
  if (scenarios.length > 0) {
    const primary = [...scenarios].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))[0];
    const thesis = (primary.thesis ?? "").toLowerCase();
    if (/bull|upside|rally|reclaim|break above|acceptance above/.test(thesis)) scenarioBias = "BULLISH";
    else if (/bear|downside|sell|break below|acceptance below|reject/.test(thesis)) scenarioBias = "BEARISH";
    else scenarioBias = "NEUTRAL";
  }

  const playbookBias = snapshot.positioning?.tradingPlaybook?.currentPlaybook?.directionalBias;
  if (scenarioBias === "NEUTRAL" || scenarioBias == null) {
    if (playbookBias === "LONG" || playbookBias === "BULLISH") scenarioBias = "BULLISH";
    else if (playbookBias === "SHORT" || playbookBias === "BEARISH") scenarioBias = "BEARISH";
  }

  return {
    spot,
    gammaRegime: snapshot.market?.gammaRegime ?? null,
    totalGex: snapshot.market?.totalGex ?? snapshot.options?.totalGex ?? null,
    globalFlip: snapshot.options?.gammaFlipGlobal ?? snapshot.market?.gammaFlip ?? null,
    localFlip: snapshot.options?.gammaFlipLocal ?? null,
    transitionZoneStart: snapshot.market?.transitionZoneStart ?? null,
    transitionZoneEnd: snapshot.market?.transitionZoneEnd ?? null,
    localTransitionZoneStart: snapshot.options?.localTransitionZoneStart ?? null,
    localTransitionZoneEnd: snapshot.options?.localTransitionZoneEnd ?? null,
    dealerPivot: snapshot.positioning?.dealerPivot ?? null,
    callWall: snapshot.positioning?.callWall ?? null,
    putWall: snapshot.positioning?.putWall ?? null,
    scenarioBias,
    volatilityRisk:
      snapshot.positioning?.tradingPlaybook?.currentPlaybook?.volatilityRisk ??
      (snapshot.market?.gammaAcceleration === "HIGH" ? "HIGH" : null),
    gammaAcceleration: snapshot.market?.gammaAcceleration ?? null,
    vannaBias: snapshot.exposure?.vannaBias ?? null,
    hedgeFlowIntensity:
      snapshot.positioning?.dealerHedgingFlowMap?.hedgingFlowStrength === "HIGH"
        ? "HIGH"
        : snapshot.positioning?.dealerHedgingFlowMap?.hedgingFlowStrength === "MEDIUM"
          ? "MEDIUM"
          : null,
    marketMode: snapshot.positioning?.marketModeEngine?.marketMode ?? null,
    marketModeConfidence: snapshot.positioning?.marketModeEngine?.marketModeConfidence ?? null,
    institutionalBias: snapshot.positioning?.institutionalBiasEngine?.institutionalBias ?? null,
    vacuumRisk: snapshot.vacuumRisk ?? null,
    gammaPressurePositive: snapshot.exposure?.gammaPressure?.startsWith("+") ?? false,
    dataQuality,
  };
}

export function formatTradingStateLabel(value: string): string {
  return value.replace(/_/g, " ");
}
