import { normalizeLiquidityContext } from "@/lib/normalizeLiquidityContext";
import { buildIntelligenceFromSessionReport } from "./buildIntelligenceFromSessionReport";
import { buildMockSessionReport } from "./sessionReportMockFallback";
import {
  isLongGamma,
  isShortGamma,
  resolveGammaRegimeLabel,
  structureFromCandles,
} from "./sessionReportGammaUtils";
import { buildLiquidityEvents } from "./sessionReportLiquidity";
import { isNear, num, resolveLocalFlip } from "./sessionReportLevelUtils";
import {
  activeTradingPrice,
  decisionLevelPrice,
  resolveSessionLevelHierarchy,
} from "./sessionLevelHierarchy";
import { inferSessionEdge } from "./sessionReportEdge";
import { inferSessionRisks } from "./sessionReportRisks";
import { buildSessionResolution } from "./sessionReportResolution";
import { buildReportSnapshot } from "./sessionReportSnapshot";
import type {
  BuildSessionReportOptions,
  MarketClarity,
  SessionLevelHierarchy,
  SessionReportResult,
  SessionTerminalInput,
} from "./sessionReportTypes";

function inferBias(
  terminal: SessionTerminalInput,
  spot: number | null,
  localFlip: number | null,
  gammaLabel: string,
): string {
  const positioning = terminal.positioning as Record<string, unknown> | undefined;
  const biasEngine = positioning?.institutionalBiasEngine as Record<string, unknown> | undefined;
  const instBias = String(biasEngine?.institutionalBias ?? "").replace(/_/g, " ");
  if (instBias && instBias !== "UNDEFINED" && instBias.length > 2) {
    return instBias;
  }

  const baseScenario = terminal.scenarios?.find((s) => s.type === "BASE");
  if (baseScenario?.thesis && baseScenario.thesis.length > 10) {
    return baseScenario.thesis.slice(0, 80);
  }

  if (spot != null && localFlip != null) {
    if (isNear(spot, localFlip, 0.25)) return "Two-sided / Flip Test";
    if (spot < localFlip) return "Bearish / Below Flip";
    if (spot > localFlip) return "Bullish / Above Flip";
  }

  if (isShortGamma(gammaLabel)) return "Reactive / Directional";
  if (isLongGamma(gammaLabel)) return "Mean Reversion Bias";
  return "Monitoring";
}

function inferVolatility(
  gammaLabel: string,
  vacuumActive: boolean,
  positioning: Record<string, unknown> | undefined,
): string {
  if (vacuumActive) return "Repricing Risk";
  const volExp = positioning?.volatilityExpansionDetector as Record<string, unknown> | undefined;
  if (String(volExp?.volExpansionState ?? "").toUpperCase() === "EXPANDING") {
    return "Expansion Risk";
  }
  if (isShortGamma(gammaLabel)) return "Expansion Risk";
  if (isLongGamma(gammaLabel)) return "Compression";
  return "Unknown";
}

function inferRegimeStatus(
  risks: { primaryRisk: string; secondaryRisk: string | null },
  gammaLabel: string,
  vacuumActive: boolean,
): string {
  if (vacuumActive || risks.primaryRisk === "Fast Repricing") return "Vacuum Risk";
  if (risks.secondaryRisk === "Magnet Rotation") return "Magnet Rotation";
  if (risks.secondaryRisk === "Flip Acceptance") return "Reactive Auction";
  if (isShortGamma(gammaLabel) && risks.primaryRisk === "Expansion Volatility") {
    return "Reactive Auction";
  }
  if (isLongGamma(gammaLabel)) return "Compression Auction";
  return "Monitoring";
}

function inferCurrentLocation(
  spot: number | null,
  hierarchy: SessionLevelHierarchy,
): string {
  if (spot == null) return "Unknown location";

  const decision = hierarchy.intradayDecision;
  const localFlip = hierarchy.localFlip;
  const activePrice = activeTradingPrice(hierarchy);

  if (decision.price != null && decision.type === "Local Flip" && isNear(spot, decision.price, 0.35)) {
    return "Testing local flip";
  }

  if (localFlip != null) {
    if (isNear(spot, localFlip, 0.35)) return "Testing local flip";
    if (spot < localFlip) return "Below local flip";
    if (spot > localFlip) return "Above local flip";
  }

  if (activePrice != null && isNear(spot, activePrice, 0.35)) {
    return "Near active magnet";
  }

  return "Unknown location";
}

function inferMarketBehavior(
  gammaLabel: string,
  spot: number | null,
  hierarchy: SessionLevelHierarchy,
  vacuumActive: boolean,
  risks: { primaryRisk: string },
): string {
  const decision = hierarchy.intradayDecision;
  const testingFlip =
    spot != null &&
    decision.price != null &&
    decision.type === "Local Flip" &&
    isNear(spot, decision.price, 0.35);

  if (testingFlip && (vacuumActive || risks.primaryRisk === "Fast Repricing")) {
    return "Flip test with repricing risk";
  }

  if (testingFlip) {
    return "Fragile transition near local flip";
  }

  if (vacuumActive || risks.primaryRisk === "Fast Repricing") {
    return "Vacuum repricing risk";
  }

  const activePrice = activeTradingPrice(hierarchy);
  if (activePrice != null && spot != null && isNear(spot, activePrice, 0.35)) {
    return "Active magnet rotation";
  }

  if (isLongGamma(gammaLabel)) return "Mean reversion / compression";
  if (isShortGamma(gammaLabel) && spot != null && hierarchy.localFlip != null) {
    if (spot < hierarchy.localFlip) return "Reactive downside auction";
    if (spot > hierarchy.localFlip) return "Upside repricing risk";
  }
  return "Monitoring market structure";
}

function inferMarketClarity(flags: {
  gamma: boolean;
  flip: boolean;
  magnet: boolean;
  spot: boolean;
  liquidityEvents: boolean;
  keyLevel: boolean;
}): MarketClarity {
  if (flags.gamma && flags.flip && flags.magnet && flags.spot && flags.liquidityEvents) {
    return "High";
  }
  if (flags.gamma && flags.spot && (flags.keyLevel || flags.flip)) {
    return "Moderate";
  }
  return "Low";
}

function countLiveSignals(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

function formatLevelPrice(price: number | null): string {
  if (price == null) return "N/A";
  return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function finalizeReport(
  report: Omit<SessionReportResult, "intelligence">,
): SessionReportResult {
  return {
    ...report,
    intelligence: buildIntelligenceFromSessionReport(
      report as SessionReportResult,
    ),
  };
}

export function buildSessionReportFromTerminalState(
  options: BuildSessionReportOptions,
): SessionReportResult {
  const mock = buildMockSessionReport();
  const terminal = options.terminal;

  if (!terminal?.market) {
    if (import.meta.env.DEV) {
      console.warn("[Reports] Session report: no terminal state — mock fallback");
    }
    return mock;
  }

  const spot = num(terminal.ticker?.price);
  const positioning = terminal.positioning as Record<string, unknown> | undefined;
  const liq = normalizeLiquidityContext(terminal, spot ?? undefined);

  const gammaLabel = resolveGammaRegimeLabel(terminal);
  const localFlip = resolveLocalFlip(terminal);
  const nearestWallPrice = liq.nearestWall?.price ?? null;
  const levelHierarchy = resolveSessionLevelHierarchy(
    terminal,
    spot,
    liq.activeMagnet ?? null,
    nearestWallPrice,
  );

  const activeMagnet = activeTradingPrice(levelHierarchy);
  const decisionPrice = decisionLevelPrice(levelHierarchy);
  const vacuumActive =
    (liq.liquidityVoids?.length ?? 0) > 0 ||
    Boolean(
      (positioning?.liquidityHeatmap as Record<string, unknown> | undefined)?.liquidityVacuum,
    );

  const sweepActive =
    liq.sweep?.status != null &&
    liq.sweep.status !== "IDLE" &&
    liq.sweep.status !== "RESOLVED";
  const absorptionConfirmed =
    liq.absorption?.detected === true &&
    (liq.absorption.side === "BID" || liq.absorption.side === "ASK" || liq.absorption.side === "BOTH");
  const confirmedOrderflow = sweepActive || absorptionConfirmed;

  const candleStruct = options.candles?.length
    ? structureFromCandles(options.candles)
    : null;
  const structureLive = candleStruct != null;
  const high = candleStruct?.high ?? null;
  const low = candleStruct?.low ?? null;
  const open = candleStruct?.open ?? null;
  const last = spot ?? candleStruct?.last ?? null;
  const rangePct = candleStruct?.rangePct ?? null;
  const structureOhlc =
    structureLive && high != null && low != null && open != null && last != null;

  const liquidityBuild = buildLiquidityEvents({
    terminal,
    spot,
    hierarchy: levelHierarchy,
    gammaLabel,
    vacuumActive,
  });

  const risks = inferSessionRisks({
    gammaLabel,
    spot,
    localFlip,
    magnet: activeMagnet,
    vacuumActive,
  });

  const bias = inferBias(terminal, spot, localFlip, gammaLabel);
  const volatilityState = inferVolatility(gammaLabel, vacuumActive, positioning);
  const status = inferRegimeStatus(risks, gammaLabel, vacuumActive);
  const currentLocation = inferCurrentLocation(spot, levelHierarchy);
  const marketBehavior = inferMarketBehavior(
    gammaLabel,
    spot,
    levelHierarchy,
    vacuumActive,
    risks,
  );

  const testingFlip =
    spot != null &&
    decisionPrice != null &&
    levelHierarchy.intradayDecision.type === "Local Flip" &&
    isNear(spot, decisionPrice, 0.35);

  const edge = inferSessionEdge({
    sweepActive,
    absorptionBid: absorptionConfirmed,
    vacuumActive,
    spot,
    decisionPrice,
    activeMagnetPrice: activeMagnet,
    testingFlip,
  });

  const resolution = buildSessionResolution({
    spot,
    gammaLabel,
    currentLocation,
    hierarchy: levelHierarchy,
    risks,
    vacuumActive,
  });

  const structuralLiquidityOnly =
    liquidityBuild.events.length > 0 && !liquidityBuild.hasRealFlow;

  const signalFlags = {
    gamma: gammaLabel !== "Unknown",
    flip: localFlip != null,
    magnet: levelHierarchy.activeTrading.valid || decisionPrice != null,
    spot: spot != null,
    structureOhlc,
    liquidityEvents: liquidityBuild.events.length > 0,
    realFlow: liquidityBuild.hasRealFlow,
    keyLevel:
      (terminal.levels?.gammaMagnets?.length ?? 0) > 0 ||
      num(terminal.positioning?.callWall) != null,
  };

  const marketClarity = inferMarketClarity(signalFlags);
  const resolutionLive =
    resolution.length > 60 && spot != null && gammaLabel !== "Unknown";

  const snapshot = buildReportSnapshot({
    spot,
    localFlip,
    decisionPrice,
    testingFlip,
    gammaLabel,
    levelHierarchy,
    marketClarity,
    mainRisk: risks.primaryRisk,
    edge,
    liquidityEventsCount: liquidityBuild.events.length,
    hasRealFlow: liquidityBuild.hasRealFlow,
    structuralLiquidityOnly,
    confirmedOrderflow,
    structureOhlc,
    resolutionLive,
    usedMockFallback: false,
  });

  const liveCount = countLiveSignals({
    gamma: signalFlags.gamma,
    flip: signalFlags.flip,
    magnet: signalFlags.magnet,
    spot: signalFlags.spot,
    liquidity: signalFlags.liquidityEvents,
    structure: signalFlags.structureOhlc,
  });

  let dataMode: SessionReportResult["dataMode"] = "live";
  if (liveCount <= 1) dataMode = "mock";
  else if (liveCount < 4 || !structureOhlc) dataMode = "partial";

  const liquidityEvents =
    liquidityBuild.events.length > 0
      ? liquidityBuild.events
      : [
          {
            label: "No significant liquidity events detected.",
            type: "generic" as const,
            importance: "low" as const,
          },
        ];

  const baseResult = {
    dataMode,
    spot,
    usedMockFallback: false,
    snapshot,
    regime: {
      gammaState: gammaLabel,
      bias,
      volatilityState,
      localFlip,
      status,
      levelHierarchy,
    },
    structure: {
      high,
      low,
      open,
      last,
      rangePct,
      currentLocation,
      marketBehavior,
      isLive: structureLive,
    },
    risks,
    liquidityEvents,
    resolution,
    sessionSummary: {
      sessionBias: bias,
      gammaState: gammaLabel,
      intradayDecision: formatLevelPrice(levelHierarchy.intradayDecision.price),
      activeTradingMagnet: levelHierarchy.activeTrading.valid
        ? formatLevelPrice(levelHierarchy.activeTrading.price)
        : "N/A",
      localFlip: localFlip != null ? formatLevelPrice(localFlip) : "N/A",
      volatilityState,
    },
  };

  if (dataMode === "mock") {
    return mock;
  }

  if (dataMode === "partial") {
    return finalizeReport(mergePartial(baseResult, mock));
  }

  if (import.meta.env.DEV && liveCount < 5) {
    console.warn("[Reports] Session report: partial field coverage", {
      liveCount,
      sessionQuality: snapshot.sessionQuality,
      signalFlags,
    });
  }

  return finalizeReport(baseResult);
}

function mergePartial(
  live: Omit<SessionReportResult, "intelligence">,
  mock: SessionReportResult,
): Omit<SessionReportResult, "intelligence"> {
  const h = live.regime.levelHierarchy;
  const merged = {
    ...live,
    dataMode: "partial" as const,
    usedMockFallback: true,
    snapshot: buildReportSnapshot({
      spot: live.spot,
      localFlip: live.regime.localFlip,
      decisionPrice: h.intradayDecision.price,
      testingFlip:
        live.spot != null &&
        h.intradayDecision.price != null &&
        h.intradayDecision.type === "Local Flip" &&
        isNear(live.spot, h.intradayDecision.price, 0.35),
      gammaLabel: live.regime.gammaState,
      levelHierarchy: h,
      marketClarity:
        live.snapshot.marketClarity === "Low"
          ? mock.snapshot.marketClarity
          : live.snapshot.marketClarity,
      mainRisk: live.risks.primaryRisk,
      edge: {
        bestEdge:
          live.snapshot.bestEdge === "No Clear Edge"
            ? mock.snapshot.bestEdge
            : live.snapshot.bestEdge,
        bestEdgeCondition: live.snapshot.bestEdgeCondition,
        alternativeEdge: live.snapshot.alternativeEdge,
      },
      liquidityEventsCount: live.liquidityEvents.filter((e) => e.type !== "generic").length,
      hasRealFlow: live.liquidityEvents.some(
        (e) => e.type === "sweep" || e.type === "absorption",
      ),
      structuralLiquidityOnly:
        live.liquidityEvents.some((e) => e.isStructural || e.type === "structure") &&
        !live.liquidityEvents.some((e) => e.type === "sweep" || e.type === "absorption"),
      confirmedOrderflow: live.liquidityEvents.some(
        (e) => e.type === "sweep" || e.type === "absorption",
      ),
      structureOhlc: live.structure.isLive,
      resolutionLive: live.resolution.length > 80,
      usedMockFallback: true,
    }),
    structure: live.structure.isLive ? live.structure : mock.structure,
    liquidityEvents: live.liquidityEvents.some((e) => !e.label.includes("No significant"))
      ? live.liquidityEvents
      : mock.liquidityEvents,
    resolution: live.resolution.length > 80 ? live.resolution : live.resolution,
  };

  if (import.meta.env.DEV) {
    console.warn("[Reports] Session report: partial data merge (score capped at 75)");
  }

  return merged as Omit<SessionReportResult, "intelligence">;
}
