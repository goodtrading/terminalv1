import {
  LIQUIDITY_EVENTS,
  MARKET_REGIME,
  MARKET_STRUCTURE,
  REPORT_SNAPSHOT,
  SESSION_SUMMARY,
} from "../reportsMockData";
import { buildReportSnapshot } from "./sessionReportSnapshot";
import type { SessionReportResult } from "./sessionReportTypes";

/** Controlled mock when terminal data is unavailable. */
export function buildMockSessionReport(): SessionReportResult {
  const levelHierarchy = {
    intradayDecision: {
      price: null,
      type: "Local Flip" as const,
      distancePct: null,
      distanceLabel: "N/A",
      relation: "N/A" as const,
      levelStatus: "Awaiting live data",
    },
    activeTrading: {
      price: null,
      type: "N/A",
      distancePct: null,
      distanceLabel: "N/A",
      direction: "N/A" as const,
      condition: "N/A",
      levelStatus: "No valid intraday magnet detected",
      valid: false,
    },
    macroGravity: {
      price: null,
      type: "Macro Gravity Level" as const,
      distancePct: null,
      distanceLabel: "N/A",
      relation: "N/A" as const,
      levelStatus: "Awaiting live data",
    },
    localFlip: null,
  };

  const snapshot = buildReportSnapshot({
    spot: null,
    localFlip: null,
    decisionPrice: null,
    testingFlip: false,
    gammaLabel: MARKET_REGIME.mainRegime,
    levelHierarchy,
    marketClarity: "Low",
    mainRisk: REPORT_SNAPSHOT.mainRisk,
    edge: {
      bestEdge: "No Clear Edge",
      bestEdgeCondition: null,
      alternativeEdge: null,
    },
    liquidityEventsCount: 0,
    hasRealFlow: false,
    structuralLiquidityOnly: false,
    confirmedOrderflow: false,
    structureOhlc: false,
    resolutionLive: false,
    usedMockFallback: true,
  });

  return {
    dataMode: "mock",
    spot: null,
    usedMockFallback: true,
    snapshot,
    regime: {
      gammaState: MARKET_REGIME.mainRegime,
      bias: MARKET_REGIME.bias,
      volatilityState: MARKET_REGIME.volatility,
      localFlip: null,
      status: MARKET_REGIME.statusBadge,
      levelHierarchy,
    },
    structure: {
      high: null,
      low: null,
      open: null,
      last: null,
      rangePct: null,
      currentLocation: MARKET_STRUCTURE.location,
      marketBehavior: MARKET_STRUCTURE.behavior,
      isLive: false,
    },
    risks: {
      primaryRisk: REPORT_SNAPSHOT.mainRisk,
      secondaryRisk: null,
    },
    liquidityEvents: LIQUIDITY_EVENTS.map((label) => ({
      label,
      type: "generic" as const,
      importance: "medium" as const,
    })),
    resolution:
      "Session report preview — connect terminal state for live resolution text. No prices shown until live data is available.",
    sessionSummary: {
      sessionBias: SESSION_SUMMARY.sessionBias,
      gammaState: SESSION_SUMMARY.gammaState,
      intradayDecision: "N/A",
      activeTradingMagnet: "N/A",
      localFlip: MARKET_REGIME.localFlip,
      volatilityState: SESSION_SUMMARY.volatilityState,
    },
    intelligence: {
      whatHappened:
        "Awaiting live terminal state. Session narrative will use the intraday decision level, active trading magnet, and macro gravity hierarchy when connected.",
      whyHappened: [
        "Terminal state not loaded or unavailable.",
        "No live levels displayed to avoid stale hardcoded prices.",
      ],
      bestOpportunity: "Enable live session data via /api/terminal/state.",
      mainRisk: "Unknown until live",
      tomorrowFocus: [
        "Open Reports after terminal loads market state.",
        "Confirm SESSION LIVE badge before acting on levels.",
      ],
      institutionalTakeaway:
        "Mock fallback active — do not use hardcoded preview levels for decisions.",
      usesLiveData: false,
    },
  };
}
