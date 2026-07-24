/**
 * AI-8.1.3 — Baseline-safe reconciliation + recorder filtering.
 *
 * Guards the invariant that a connection's FIRST snapshot never fabricates
 * human trading actions: pre-existing positions/orders are captured as a
 * baseline (ACCOUNT_BASELINE_CAPTURED / EXISTING_*_BASELINE) and are never
 * recorder-eligible, so the Decision Context Recorder creates zero
 * TradeDecisions (falseTradeDecisionsCreated === 0).
 *
 * No real BingX account. Uses the in-memory recorder repository only.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { reconcileAccountSnapshots } from "./index";
import type { BingxAccountSnapshot } from "../../../../shared/goodTradingAiBingxAccount";
import {
  bingxTradingActionEventSchema,
  isBingxRecorderEligibleEvent,
  isBingxBaselineEventType,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  recordFromBingxReconciliation,
  resetDecisionContextMemoryForTests,
  resetDecisionContextRepositoryForTests,
  resetContextRefRegistryForTests,
} from "../../../ai/goodTradingAi/decisionContext";

function baseSnapshot(
  overrides: Partial<BingxAccountSnapshot> = {},
): BingxAccountSnapshot {
  return {
    accountId: "account_baseline",
    exchange: "bingx",
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
    completeness: "COMPLETE",
    health: {
      status: "healthy",
      connected: true,
      configured: true,
      permissionsClassification: "read_only",
      stale: false,
      warnings: [],
    },
    balances: [],
    positions: [],
    openOrders: [],
    recentOrders: [],
    recentFills: [],
    capturedAt: "2026-07-24T12:00:00.000Z",
    sourceAgeMs: 0,
    mentorEligible: false,
    aiConsumptionEnabled: false,
    canUseForMentor: false,
    canUseForLearning: false,
    ...overrides,
  };
}

function longPosition(
  symbol: string,
  quantity: number,
): BingxAccountSnapshot["positions"][number] {
  return {
    positionId: `pos_${symbol}`,
    accountId: "account_baseline",
    symbol,
    side: "long",
    quantity,
    stale: false,
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
  };
}

function openOrder(
  symbol: string,
): BingxAccountSnapshot["openOrders"][number] {
  return {
    orderId: `ord_${symbol}`,
    accountId: "account_baseline",
    symbol,
    side: "buy",
    type: "limit",
    status: "open",
    stale: false,
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
  };
}

function withReconciliation(
  previous: BingxAccountSnapshot | null,
  current: BingxAccountSnapshot,
  version: number,
): BingxAccountSnapshot {
  const reconciliation = reconcileAccountSnapshots(
    previous,
    current,
    version,
  );
  return { ...current, reconciliation };
}

describe("AI-8.1.3 baseline-safe reconciliation", () => {
  it("captures pre-existing positions/orders as baseline, not POSITION_OPENED", () => {
    const current = baseSnapshot({
      positions: [longPosition("BTC-USDT", 1), longPosition("ETH-USDT", 5)],
      openOrders: [openOrder("SOL-USDT")],
    });

    const result = reconcileAccountSnapshots(null, current, 1);

    // Never fabricate human actions on the first snapshot.
    assert.equal(
      result.events.some((e) => e.type === "POSITION_OPENED"),
      false,
      "must not emit POSITION_OPENED on initial baseline",
    );
    assert.equal(
      result.events.some((e) => e.type === "ORDER_OPENED"),
      false,
      "must not emit ORDER_OPENED on initial baseline",
    );

    // Exactly one account baseline marker.
    assert.equal(
      result.events.filter((e) => e.type === "ACCOUNT_BASELINE_CAPTURED").length,
      1,
    );
    assert.equal(
      result.events.filter((e) => e.type === "EXISTING_POSITION_BASELINE").length,
      2,
    );
    assert.equal(
      result.events.filter((e) => e.type === "EXISTING_OPEN_ORDER_BASELINE").length,
      1,
    );

    // Every baseline event is a non-action, non-recorder-eligible marker
    // and validates against the shared contract.
    for (const e of result.events) {
      if (isBingxBaselineEventType(e.type)) {
        assert.equal(e.baseline, true);
        assert.equal(e.isActionEvent, false);
        assert.equal(e.recorderEligible, false);
      }
      bingxTradingActionEventSchema.parse(e);
    }
  });

  it("yields zero recorder-eligible events for a baseline snapshot", () => {
    const current = baseSnapshot({
      positions: [longPosition("BTC-USDT", 1)],
      openOrders: [openOrder("SOL-USDT")],
    });
    const result = reconcileAccountSnapshots(null, current, 1);
    const eligible = result.events.filter((e) => isBingxRecorderEligibleEvent(e));
    assert.equal(eligible.length, 0);
  });

  it("recorder creates 0 TradeDecisions from a baseline snapshot", async () => {
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
    process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY = "memory";
    process.env.NODE_ENV = "test";
    resetDecisionContextMemoryForTests();
    resetDecisionContextRepositoryForTests();
    resetContextRefRegistryForTests();

    const baseline = withReconciliation(
      null,
      baseSnapshot({
        positions: [longPosition("BTC-USDT", 1), longPosition("ETH-USDT", 5)],
        openOrders: [openOrder("SOL-USDT")],
      }),
      1,
    );

    const created = await recordFromBingxReconciliation({
      userId: 4242,
      snapshot: baseline,
    });
    assert.equal(
      created.length,
      0,
      "falseTradeDecisionsCreated must be 0 for baseline",
    );
  });

  it("second identical refresh emits zero action events", () => {
    const first = baseSnapshot({
      positions: [longPosition("BTC-USDT", 1)],
      openOrders: [openOrder("SOL-USDT")],
    });
    const second = baseSnapshot({
      positions: [longPosition("BTC-USDT", 1)],
      openOrders: [openOrder("SOL-USDT")],
      capturedAt: "2026-07-24T12:05:00.000Z",
    });

    const result = reconcileAccountSnapshots(first, second, 2);
    const actionEvents = result.events.filter((e) => e.isActionEvent);
    assert.equal(actionEvents.length, 0);
    const eligible = result.events.filter((e) => isBingxRecorderEligibleEvent(e));
    assert.equal(eligible.length, 0);
  });

  it("a genuinely new position after baseline emits a recordable POSITION_OPENED", async () => {
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
    process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY = "memory";
    process.env.NODE_ENV = "test";
    resetDecisionContextMemoryForTests();
    resetDecisionContextRepositoryForTests();
    resetContextRefRegistryForTests();

    // Baseline first (existing BTC position) — must record nothing.
    const baseline = withReconciliation(
      null,
      baseSnapshot({ positions: [longPosition("BTC-USDT", 1)] }),
      1,
    );
    const baselineCreated = await recordFromBingxReconciliation({
      userId: 99,
      snapshot: baseline,
    });
    assert.equal(baselineCreated.length, 0);

    // Now a NEW ETH position appears — this IS a human action.
    const afterOpen = withReconciliation(
      baseSnapshot({ positions: [longPosition("BTC-USDT", 1)] }),
      baseSnapshot({
        positions: [longPosition("BTC-USDT", 1), longPosition("ETH-USDT", 3)],
        capturedAt: "2026-07-24T12:10:00.000Z",
      }),
      2,
    );

    const opened = afterOpen.reconciliation?.events.find(
      (e) => e.type === "POSITION_OPENED" && e.symbol === "ETH-USDT",
    );
    assert.ok(opened, "expected POSITION_OPENED for the new ETH position");
    assert.equal(opened?.isActionEvent, true);
    assert.equal(opened?.recorderEligible, true);
    assert.equal(opened?.baseline, false);

    const created = await recordFromBingxReconciliation({
      userId: 99,
      snapshot: afterOpen,
    });
    assert.equal(created.length, 1, "new position must create exactly 1 decision");
    assert.equal(created[0]?.symbol, "ETH-USDT");
  });
});
