import type {
  BingxAccountSnapshot,
  TraderActionContext,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  canUseBingxAccountForMentor,
  canUseBingxActionsForLearning,
} from "../../../../shared/goodTradingAiBingxAccount";

/**
 * AI boundary — sanitized future contract only.
 * Not wired to Mentor chat, Market Snapshot, or Decision Graph in this phase.
 */
export function buildTraderActionContext(
  snapshot: BingxAccountSnapshot,
): TraderActionContext {
  const openPositions = snapshot.positions.filter(
    (p) => p.side !== "flat" && p.quantity > 0,
  );
  const grossNotional = openPositions.reduce(
    (sum, p) => sum + (p.notional ?? 0),
    0,
  );
  const netUnrealizedPnl = openPositions.reduce(
    (sum, p) => sum + (p.unrealizedPnl ?? 0),
    0,
  );
  const recent = (snapshot.reconciliation?.events ?? []).slice(-50);
  const lastConfirmed = [...recent]
    .reverse()
    .find((e) => e.confidence === "CONFIRMED");

  return {
    accountMode: snapshot.accountMode,
    source: "BINGX_ACCOUNT_READ_ONLY",
    currentExposure: {
      positionCount: openPositions.length,
      grossNotional: grossNotional || undefined,
      netUnrealizedPnl:
        openPositions.some((p) => p.unrealizedPnl != null)
          ? netUnrealizedPnl
          : undefined,
    },
    positionState: openPositions.slice(0, 50),
    recentActionEvents: recent,
    openRiskSummary: {
      openOrderCount: snapshot.openOrders.length,
      hasStopObserved: openPositions.some((p) => p.stopLossPrice != null),
      hasTakeProfitObserved: openPositions.some(
        (p) => p.takeProfitPrice != null,
      ),
    },
    lastConfirmedActionAt: lastConfirmed?.capturedAt,
    dataQuality: snapshot.completeness,
    stalenessMs: snapshot.sourceAgeMs,
    mentorEligible: false,
    aiConsumptionEnabled: false,
    canUseBingxAccountForMentor: canUseBingxAccountForMentor(),
    canUseBingxActionsForLearning: canUseBingxActionsForLearning(),
  };
}

export function assertAiBoundaryDisabled(): void {
  if (canUseBingxAccountForMentor() !== false) {
    throw new Error("canUseBingxAccountForMentor must be false");
  }
  if (canUseBingxActionsForLearning() !== false) {
    throw new Error("canUseBingxActionsForLearning must be false");
  }
}
