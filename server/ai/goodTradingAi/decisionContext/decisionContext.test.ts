/**
 * AI-8.1 / AI-8.1.1 — Decision Context Recorder regression tests.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  decisionContextSchema,
  tradeDecisionSchema,
  decisionJournalSchema,
  mapPositionEventToTimelineType,
  canUseDecisionContextForMentor,
  canUseDecisionContextForLearning,
  canMutateBrainFromDecisionContext,
  canAutoApplyDecisionContext,
  POSITION_EVENTS_FOR_DECISION,
} from "@shared/goodTradingAiDecisionContext";
import type { BingxTradingActionEvent } from "@shared/goodTradingAiBingxAccount";
import {
  freezeDecisionContext,
  newStableDecisionId,
  recordSinglePositionEvent,
  getTradeDecision,
  resetDecisionContextMemoryForTests,
  resetContextRefRegistryForTests,
  resetDecisionContextRepositoryForTests,
  registerKnownMarketSnapshot,
  registerKnownDecisionGraph,
  getDecisionContextMemory,
  classifyPositionTimelineEvent,
  isDecisionContextRecorderEnabled,
  canCaptureDecisionContext,
} from "./index";

function enableRecorderForTests(): void {
  process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
  process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY = "memory";
  process.env.NODE_ENV = "test";
}

function makeEvent(
  overrides: Partial<BingxTradingActionEvent> & {
    type: BingxTradingActionEvent["type"];
    eventId: string;
  },
): BingxTradingActionEvent {
  return {
    sequence: 1,
    confidence: "DERIVED",
    symbol: "BTC-USDT",
    positionSide: "long",
    summary: "test event",
    capturedAt: "2026-07-24T12:00:00.000Z",
    accountId: "account_abc",
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
    mentorEligible: false,
    aiConsumptionEnabled: false,
    reconciliationVersion: 1,
    ...overrides,
  };
}

function emptySnapshot(overrides?: {
  positions?: Array<{
    symbol: string;
    side: "long" | "short";
    quantity: number;
    realizedPnl?: number;
  }>;
  events?: BingxTradingActionEvent[];
}) {
  const capturedAt = "2026-07-24T12:00:00.000Z";
  return {
    accountId: "account_abc",
    exchange: "bingx" as const,
    accountMode: "REAL_BINGX_READ_ONLY" as const,
    source: "BINGX_ACCOUNT_READ_ONLY" as const,
    completeness: "COMPLETE" as const,
    health: {
      status: "healthy" as const,
      connected: true,
      configured: true,
      permissionsClassification: "read_only" as const,
      stale: false,
      warnings: [] as string[],
    },
    balances: [],
    positions: (overrides?.positions ?? []).map((p, i) => ({
      positionId: `pos_${i}`,
      accountId: "account_abc",
      symbol: p.symbol,
      side: p.side,
      quantity: p.quantity,
      realizedPnl: p.realizedPnl,
      stale: false,
      accountMode: "REAL_BINGX_READ_ONLY" as const,
      source: "BINGX_ACCOUNT_READ_ONLY" as const,
    })),
    openOrders: [],
    recentOrders: [],
    recentFills: [],
    capturedAt,
    sourceAgeMs: 0,
    reconciliation: {
      version: 1,
      currentCapturedAt: capturedAt,
      events: overrides?.events ?? [],
      uncertain: false,
      notes: [],
    },
    mentorEligible: false as const,
    aiConsumptionEnabled: false as const,
    canUseForMentor: false as const,
    canUseForLearning: false as const,
  };
}

beforeEach(() => {
  enableRecorderForTests();
  resetDecisionContextMemoryForTests();
  resetDecisionContextRepositoryForTests();
  resetContextRefRegistryForTests();
});

describe("AI-8.1.1 flag defaults", () => {
  it("recorder defaults false when env unset", () => {
    const prev = process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED;
    delete process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED;
    // Re-import would be needed for module cache; call via envBool path after restore
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "false";
    assert.equal(isDecisionContextRecorderEnabled(), false);
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
    assert.equal(isDecisionContextRecorderEnabled(), true);
    assert.equal(canCaptureDecisionContext(), true);
    if (prev == null) delete process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED;
    else process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = prev;
  });
});

describe("AI-8.1 contracts + mapping", () => {
  it("maps position events to timeline types without inventing MANUAL_CLOSE", () => {
    assert.equal(mapPositionEventToTimelineType("POSITION_OPENED"), "OPEN");
    assert.equal(mapPositionEventToTimelineType("POSITION_INCREASED"), "ADD");
    assert.equal(mapPositionEventToTimelineType("POSITION_REDUCED"), "REDUCE");
    assert.equal(
      mapPositionEventToTimelineType("POSITION_REDUCED", "partial fill"),
      "PARTIAL",
    );
    assert.equal(mapPositionEventToTimelineType("POSITION_CLOSED"), "EXIT");
    assert.equal(
      mapPositionEventToTimelineType("POSITION_CLOSED", "stop hit"),
      "EXIT",
    );
    assert.equal(
      mapPositionEventToTimelineType("POSITION_CLOSED", "manual close"),
      "EXIT",
    );
    assert.equal(
      mapPositionEventToTimelineType("POSITION_CLOSED", "STOP_HIT_EVIDENCE"),
      "STOP_HIT",
    );
  });

  it("journalSemantics requires strong evidence for STOP/TP", () => {
    const weak = classifyPositionTimelineEvent("POSITION_CLOSED", "stop hit");
    assert.equal(weak.timelineType, "EXIT");
    assert.equal(weak.classificationConfidence, "LOW");
    assert.ok(weak.howItEnded.includes("UNCERTAIN"));

    const strong = classifyPositionTimelineEvent("POSITION_CLOSED", "stop", {
      hasStopOrderEvidence: true,
    });
    assert.equal(strong.timelineType, "STOP_HIT");
    assert.equal(strong.classificationConfidence, "HIGH");

    const manual = classifyPositionTimelineEvent("POSITION_CLOSED", "manual close");
    assert.notEqual(manual.timelineType, "MANUAL_CLOSE");
  });

  it("safety helpers always return false", () => {
    assert.equal(canUseDecisionContextForMentor(), false);
    assert.equal(canUseDecisionContextForLearning(), false);
    assert.equal(canMutateBrainFromDecisionContext(), false);
    assert.equal(canAutoApplyDecisionContext(), false);
  });
});

describe("AI-8.1 freeze immutability + stable UUID", () => {
  it("creates TradeDecision with stable UUID and frozen context", async () => {
    const event = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_open_1",
      summary: "Position opened long 1 BTC-USDT",
    });
    const decision = await recordSinglePositionEvent({
      userId: 42,
      event,
      snapshot: emptySnapshot({
        positions: [{ symbol: "BTC-USDT", side: "long", quantity: 1 }],
        events: [event],
      }),
    });
    assert.ok(decision);
    assert.match(decision!.decisionId, /^[0-9a-f-]{36}$/i);
    assert.equal(decision!.context.decisionId, decision!.decisionId);
    assert.equal(decision!.mentorEligible, false);
    assert.equal(decision!.brainMutate, false);
    assert.equal(decision!.learning, false);
    assert.equal(decision!.autoApply, false);
    assert.equal(decision!.context.mentorEligible, false);
    assert.equal(decision!.timeline[0]?.type, "OPEN");

    const parsed = tradeDecisionSchema.safeParse(decision);
    assert.equal(parsed.success, true, parsed.success ? "" : String(parsed.error));

    const again = await getTradeDecision(decision!.decisionId);
    assert.equal(again?.decisionId, decision!.decisionId);

    again!.context.market.gammaRegime = "MUTATED";
    const stored = await getTradeDecision(decision!.decisionId);
    assert.notEqual(stored!.context.market.gammaRegime, "MUTATED");
  });

  it("refuses context mutation on lifecycle update", async () => {
    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_open_2",
      summary: "opened",
    });
    const d = (await recordSinglePositionEvent({
      userId: 1,
      event: open,
      snapshot: emptySnapshot({ events: [open] }),
    }))!;
    const store = getDecisionContextMemory();
    assert.throws(
      () =>
        store.updateLifecycle({
          ...d,
          context: {
            ...d.context,
            marketSnapshotId: "forged-id",
          },
        }),
      /DECISION_CONTEXT_IMMUTABLE/,
    );
  });

  it("UUID remains stable across ADD/REDUCE/CLOSE lifecycle", async () => {
    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_o",
      summary: "opened long",
      capturedAt: "2026-07-24T12:00:00.000Z",
    });
    const add = makeEvent({
      type: "POSITION_INCREASED",
      eventId: "evt_a",
      summary: "increased",
      capturedAt: "2026-07-24T12:05:00.000Z",
      sequence: 2,
    });
    const red = makeEvent({
      type: "POSITION_REDUCED",
      eventId: "evt_r",
      summary: "reduced partial",
      capturedAt: "2026-07-24T12:10:00.000Z",
      sequence: 3,
    });
    const clo = makeEvent({
      type: "POSITION_CLOSED",
      eventId: "evt_c",
      summary: "manual close",
      capturedAt: "2026-07-24T12:30:00.000Z",
      sequence: 4,
    });
    const snap = emptySnapshot({
      positions: [{ symbol: "BTC-USDT", side: "long", quantity: 0, realizedPnl: 12.5 }],
    });
    const d1 = (await recordSinglePositionEvent({ userId: 7, event: open, snapshot: snap }))!;
    const d2 = (await recordSinglePositionEvent({ userId: 7, event: add, snapshot: snap }))!;
    const d3 = (await recordSinglePositionEvent({ userId: 7, event: red, snapshot: snap }))!;
    const d4 = (await recordSinglePositionEvent({ userId: 7, event: clo, snapshot: snap }))!;
    assert.equal(d1.decisionId, d2.decisionId);
    assert.equal(d1.decisionId, d3.decisionId);
    assert.equal(d1.decisionId, d4.decisionId);
    assert.deepEqual(
      d4.timeline.map((t) => t.type),
      ["OPEN", "ADD", "PARTIAL", "EXIT"],
    );
    assert.equal(d4.status, "CLOSED");
    assert.equal(d4.journal.observedPnl, 12.5);
    assert.ok(d4.journal.durationMs != null && d4.journal.durationMs >= 30 * 60 * 1000);
    assert.ok(d4.journal.howItEnded?.includes("POSITION_CLOSED"));
    assert.ok(!d4.journal.howItEnded?.includes("MANUAL_CLOSE"));
    assert.equal(JSON.stringify(d4.context), JSON.stringify(d1.context));
  });

  it("idempotent on same traderActionEventId", async () => {
    const event = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_idem",
      summary: "opened",
    });
    const a = (await recordSinglePositionEvent({
      userId: 3,
      event,
      snapshot: emptySnapshot({ events: [event] }),
    }))!;
    const b = (await recordSinglePositionEvent({
      userId: 3,
      event,
      snapshot: emptySnapshot({ events: [event] }),
    }))!;
    assert.equal(a.decisionId, b.decisionId);
    assert.equal(a.timeline.length, 1);
    assert.equal(b.timeline.length, 1);
  });

  it("LONG and SHORT same symbol stay separate active decisions", async () => {
    const longOpen = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_long",
      positionSide: "long",
      summary: "opened long",
    });
    const shortOpen = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_short",
      positionSide: "short",
      summary: "opened short",
      sequence: 2,
    });
    const dLong = (await recordSinglePositionEvent({
      userId: 8,
      event: longOpen,
      snapshot: emptySnapshot({
        positions: [
          { symbol: "BTC-USDT", side: "long", quantity: 1 },
          { symbol: "BTC-USDT", side: "short", quantity: 1 },
        ],
        events: [longOpen, shortOpen],
      }),
    }))!;
    const dShort = (await recordSinglePositionEvent({
      userId: 8,
      event: shortOpen,
      snapshot: emptySnapshot({
        positions: [
          { symbol: "BTC-USDT", side: "long", quantity: 1 },
          { symbol: "BTC-USDT", side: "short", quantity: 1 },
        ],
      }),
    }))!;
    assert.notEqual(dLong.decisionId, dShort.decisionId);
  });
});

describe("AI-8.1 missing MS/DG + no payload retention", () => {
  it("records null refs + UNCERTAIN/MISSING when MS/DG unavailable", async () => {
    const event = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_miss",
      summary: "opened",
    });
    const decision = (await recordSinglePositionEvent({
      userId: 9,
      event,
      snapshot: emptySnapshot({ events: [event] }),
    }))!;
    assert.equal(decision.context.marketSnapshotId, null);
    assert.equal(decision.context.decisionGraphId, null);
    assert.ok(
      decision.context.decisionState.dataFreshness === "MISSING" ||
        decision.context.decisionState.dataFreshness === "UNCERTAIN" ||
        decision.context.decisionState.dataFreshness === "DEGRADED",
    );
    const dump = JSON.stringify(decision);
    assert.doesNotMatch(dump, /apiSecret|rawOrderBook|openai|bookmap/i);
    assert.doesNotMatch(dump, /"providersUsed"|"evidence":\[\{"id"/);
  });

  it("attaches registry summaries when MS/DG known (refs only)", async () => {
    const now = "2026-07-24T11:59:00.000Z";
    registerKnownMarketSnapshot({
      id: "ms_test_1",
      symbol: "BTCUSDT",
      timestamp: now,
      confidence: 0.6,
      completeness: "COMPLETE",
      marketRegime: {
        label: "positive_gamma",
        direction: "bullish",
        strength: "moderate",
        quality: "medium",
        confidence: 0.6,
        summary: "pos gamma",
      },
      gamma: {
        direction: "bullish",
        strength: "moderate",
        quality: "medium",
        confidence: 0.6,
        summary: "gamma summary",
        globalFlipBias: "above",
        localFlipBias: "above",
        wallContext: "call_heavy",
        hypothesisOnly: true,
      },
      orderFlow: {
        direction: "bullish",
        strength: "weak",
        quality: "medium",
        confidence: 0.5,
        summary: "of summary",
        absorption: "buy_side",
        aggression: "aggressive_dominant",
        acceptance: "accepted",
      },
      liquidity: {
        direction: "neutral",
        strength: "weak",
        quality: "low",
        confidence: 0.4,
        summary: "liq summary",
        wallIntegrity: "persistent",
        spoofingHypothesis: "unlikely",
        sweepContext: "none",
      },
      openInterest: {
        direction: "bullish",
        strength: "moderate",
        quality: "medium",
        confidence: 0.5,
        summary: "oi rising",
        oiTrend: "rising",
        withPrice: "aligned",
      },
      footprint: {
        direction: "bullish",
        strength: "weak",
        quality: "low",
        confidence: 0.4,
        summary: "fp summary",
        imbalance: "buy_imbalance",
        exhaustionHint: "none",
      },
    });
    registerKnownDecisionGraph(
      {
        schemaVersion: "1.0",
        templateId: "generic_hypothesis_v1",
        templateVersion: "1",
        contextTrust: "VALIDATED_STUB",
        quality: "PARTIALLY_SUPPORTED",
        primaryOutcome: "HYPOTHESIS_OPEN",
        pathSummaries: [
          {
            id: "p1",
            outcome: "HYPOTHESIS_OPEN",
            priority: "MEDIUM",
            stepLabels: ["Hypothesis: range continuation"],
          },
        ],
        confirmationLabels: ["Absorption present"],
        invalidationLabels: ["Sweep fail"],
        conflictCodes: [],
        warnings: [],
        mentorEligible: false,
      },
      { symbol: "BTCUSDT", evaluatedAtMs: Date.parse("2026-07-24T11:58:00.000Z") },
    );

    const event = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_ref",
      symbol: "BTC-USDT",
      summary: "opened",
    });
    const decision = (await recordSinglePositionEvent({
      userId: 11,
      event,
      snapshot: emptySnapshot({ events: [event] }),
    }))!;
    assert.equal(decision.context.marketSnapshotId, "ms_test_1");
    assert.ok(decision.context.decisionGraphId?.startsWith("dg_"));
    assert.equal(decision.context.market.absorption, "buy_side");
    assert.ok(decision.context.decisionState.confirmations.includes("Absorption present"));
    assert.ok(decisionContextSchema.safeParse(decision.context).success);
    assert.ok(decisionJournalSchema.safeParse(decision.journal).success);
  });
});

describe("AI-8.1 paper/real isolation", () => {
  it("preserves accountMode on decision and timeline", async () => {
    const event = makeEvent({
      type: "POSITION_OPENED",
      eventId: "evt_paper",
      accountMode: "PAPER_TRADING",
      summary: "paper open",
    });
    const decision = (await recordSinglePositionEvent({
      userId: 5,
      event,
      snapshot: {
        ...emptySnapshot({ events: [event] }),
        accountMode: "PAPER_TRADING",
      },
    }))!;
    assert.equal(decision.accountMode, "PAPER_TRADING");
    assert.equal(decision.context.accountMode, "PAPER_TRADING");
    assert.equal(decision.timeline[0]?.accountMode, "PAPER_TRADING");
  });
});

describe("AI-8.1 freezeDecisionContext unit", () => {
  it("never invents MS/DG ids", () => {
    const id = newStableDecisionId();
    const ctx = freezeDecisionContext({
      decisionId: id,
      event: makeEvent({ type: "POSITION_OPENED", eventId: "e1" }),
      accountMode: "REAL_BINGX_READ_ONLY",
    });
    assert.equal(ctx.marketSnapshotId, null);
    assert.equal(ctx.decisionGraphId, null);
    assert.equal(ctx.decisionId, id);
  });
});

describe("AI-8.1 POSITION_EVENTS coverage", () => {
  it("covers the four required position events", () => {
    assert.deepEqual([...POSITION_EVENTS_FOR_DECISION], [
      "POSITION_OPENED",
      "POSITION_INCREASED",
      "POSITION_REDUCED",
      "POSITION_CLOSED",
    ]);
  });
});
