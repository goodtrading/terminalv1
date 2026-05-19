import { isNear } from "./sessionReportLevelUtils";
import { computeSessionQualityScore, type SessionQualityInput } from "./sessionReportScoring";
import type { EdgeInference } from "./sessionReportEdge";
import { hierarchyHasFarMacroOnly } from "./sessionLevelHierarchy";
import type {
  MarketClarity,
  SessionLevelHierarchy,
  SessionReportSnapshot,
} from "./sessionReportTypes";

export type ReportSnapshotBuildInput = {
  spot: number | null;
  localFlip: number | null;
  decisionPrice: number | null;
  testingFlip: boolean;
  gammaLabel: string;
  levelHierarchy: SessionLevelHierarchy;
  marketClarity: MarketClarity;
  mainRisk: string;
  edge: EdgeInference;
  liquidityEventsCount: number;
  hasRealFlow: boolean;
  structuralLiquidityOnly: boolean;
  confirmedOrderflow: boolean;
  structureOhlc: boolean;
  resolutionLive: boolean;
  usedMockFallback: boolean;
};

/** Single source of truth for Report Snapshot metrics (all tabs read this). */
export function buildReportSnapshot(input: ReportSnapshotBuildInput): SessionReportSnapshot {
  const qualityInput = buildSessionQualityInput(input);
  const sessionQuality = computeSessionQualityScore(qualityInput);

  const bestEdgeCondition = normalizeBestEdgeCondition({
    edge: input.edge,
    spot: input.spot,
    localFlip: input.localFlip,
    decisionPrice: input.decisionPrice,
    testingFlip: input.testingFlip,
  });

  return {
    sessionQuality,
    marketClarity: input.marketClarity,
    bestEdge: input.edge.bestEdge,
    bestEdgeCondition,
    alternativeEdge: input.edge.alternativeEdge,
    mainRisk: input.mainRisk,
  };
}

export function buildSessionQualityInput(
  input: ReportSnapshotBuildInput,
): SessionQualityInput {
  const hasValidActiveMagnet = input.levelHierarchy.activeTrading.valid;
  const hasDecision = input.levelHierarchy.intradayDecision.price != null;

  return {
    spot: input.spot != null,
    gamma: input.gammaLabel !== "Unknown",
    flip: input.localFlip != null,
    magnet: hasValidActiveMagnet || hasDecision,
    structureOhlc: input.structureOhlc,
    liquidityEvents: input.liquidityEventsCount > 0,
    confirmedOrderflow: input.confirmedOrderflow,
    structuralLiquidityOnly:
      input.structuralLiquidityOnly && !(hasValidActiveMagnet && hasDecision),
    hasValidActiveMagnet,
    macroMagnetFarOnly: hierarchyHasFarMacroOnly(input.levelHierarchy, input.spot),
    resolutionLive: input.resolutionLive,
    usedMockFallback: input.usedMockFallback,
  };
}

export function normalizeBestEdgeCondition(input: {
  edge: EdgeInference;
  spot: number | null;
  localFlip: number | null;
  decisionPrice: number | null;
  testingFlip: boolean;
}): string | null {
  const { edge, spot, localFlip, decisionPrice, testingFlip } = input;

  if (edge.bestEdge === "No Clear Edge") return null;

  if (edge.bestEdge === "Vacuum Repricing") {
    const nearOrBelowFlip =
      spot != null &&
      localFlip != null &&
      (spot <= localFlip ||
        testingFlip ||
        (decisionPrice != null && isNear(spot, decisionPrice, 0.35)));
    if (nearOrBelowFlip) {
      return "Requires acceptance above local flip";
    }
    return edge.bestEdgeCondition ?? "Requires liquidity refill before continuation.";
  }

  if (
    edge.bestEdge === "Flip Rejection / Rotation" ||
    edge.bestEdge.includes("Flip Rejection")
  ) {
    return "Requires rejection confirmation";
  }

  if (edge.bestEdge === "Gamma Flip Reaction") {
    return "Requires acceptance above local flip";
  }

  return edge.bestEdgeCondition;
}
