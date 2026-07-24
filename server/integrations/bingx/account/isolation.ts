import type {
  BingxAccountMode,
  BingxAccountSnapshot,
  BingxTradingActionEvent,
} from "../../../../shared/goodTradingAiBingxAccount";

export type IsolatedVenueLabel =
  | "REAL — READ ONLY"
  | "PAPER"
  | "SIMULATED"
  | "MANUAL";

export function venueLabelForMode(mode: BingxAccountMode): IsolatedVenueLabel {
  switch (mode) {
    case "REAL_BINGX_READ_ONLY":
      return "REAL — READ ONLY";
    case "PAPER_TRADING":
      return "PAPER";
    case "SIMULATED":
      return "SIMULATED";
    case "MANUAL":
      return "MANUAL";
  }
}

/** Refuse merging paper and real collections. */
export function assertSameAccountMode(
  items: Array<{ accountMode: BingxAccountMode }>,
  expected: BingxAccountMode = "REAL_BINGX_READ_ONLY",
): void {
  for (const item of items) {
    if (item.accountMode !== expected) {
      throw new Error(
        `Account mode isolation violation: expected ${expected}, got ${item.accountMode}`,
      );
    }
  }
}

export function isolateRealSnapshot(
  snapshot: BingxAccountSnapshot,
): BingxAccountSnapshot {
  assertSameAccountMode(
    [
      ...snapshot.balances,
      ...snapshot.positions,
      ...snapshot.openOrders,
      ...snapshot.recentOrders,
      ...snapshot.recentFills,
    ],
    "REAL_BINGX_READ_ONLY",
  );
  if (snapshot.accountMode !== "REAL_BINGX_READ_ONLY") {
    throw new Error("Snapshot accountMode must be REAL_BINGX_READ_ONLY");
  }
  return snapshot;
}

export function assertTimelineIsolation(
  events: BingxTradingActionEvent[],
): void {
  assertSameAccountMode(events, "REAL_BINGX_READ_ONLY");
  for (const e of events) {
    if (e.source !== "BINGX_ACCOUNT_READ_ONLY") {
      throw new Error("Timeline source isolation violation");
    }
    if (e.mentorEligible !== false || e.aiConsumptionEnabled !== false) {
      throw new Error("Timeline AI flags must remain false");
    }
  }
}
