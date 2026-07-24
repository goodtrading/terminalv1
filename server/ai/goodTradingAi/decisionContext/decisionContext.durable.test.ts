/**
 * AI-8.1.1 — Durable Decision Context persistence / safety tests.
 * No real BingX account. Postgres tests skip when DATABASE_URL absent.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { BingxTradingActionEvent } from "@shared/goodTradingAiBingxAccount";
import {
  recordSinglePositionEvent,
  resetDecisionContextMemoryForTests,
  resetDecisionContextRepositoryForTests,
  resetContextRefRegistryForTests,
  fingerprintDecisionContext,
  assessDecisionContextStorageHealth,
  buildTradeDecisionExport,
  assertExportSanitized,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
  getTradeDecision,
} from "./index";
import { MemoryDecisionContextRepository } from "./memoryRepository";
import { PostgresDecisionContextRepository } from "./postgresRepository";

function enableMemoryRecorder(): void {
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
    symbol: "ETH-USDT",
    positionSide: "long",
    summary: "test",
    capturedAt: "2026-07-24T14:00:00.000Z",
    accountId: "acct_durable",
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
    mentorEligible: false,
    aiConsumptionEnabled: false,
    reconciliationVersion: 1,
    ...overrides,
  };
}

function snap(events: BingxTradingActionEvent[] = []) {
  return {
    accountId: "acct_durable",
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
    positions: [
      {
        positionId: "p1",
        accountId: "acct_durable",
        symbol: "ETH-USDT",
        side: "long" as const,
        quantity: 1,
        stale: false,
        accountMode: "REAL_BINGX_READ_ONLY" as const,
        source: "BINGX_ACCOUNT_READ_ONLY" as const,
      },
    ],
    openOrders: [],
    recentOrders: [],
    recentFills: [],
    capturedAt: "2026-07-24T14:00:00.000Z",
    sourceAgeMs: 0,
    reconciliation: {
      version: 1,
      currentCapturedAt: "2026-07-24T14:00:00.000Z",
      events,
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
  enableMemoryRecorder();
  resetDecisionContextMemoryForTests();
  resetDecisionContextRepositoryForTests();
  resetContextRefRegistryForTests();
});

describe("AI-8.1.1 storage health", () => {
  it("reports RECORDER_DISABLED when off", async () => {
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "false";
    const h = await assessDecisionContextStorageHealth();
    assert.equal(h.status, "RECORDER_DISABLED");
    assert.equal(h.mentorEligible, false);
  });

  it("flags UNSAFE_MEMORY in production+recorder+memory", async () => {
    process.env.NODE_ENV = "production";
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
    process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY = "memory";
    assert.equal(isUnsafeNonDurableDecisionContextStore(), true);
    const h = await assessDecisionContextStorageHealth();
    assert.equal(h.status, "UNSAFE_MEMORY");
    assert.equal(h.code, UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE);
    process.env.NODE_ENV = "test";
  });
});

describe("AI-8.1.1 restart fixture (memory instance swap)", () => {
  it("OPEN→ADD then new repo instance continues REDUCE→CLOSE with stable fingerprint", async () => {
    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: "dur_open",
      summary: "opened long",
      capturedAt: "2026-07-24T14:00:00.000Z",
    });
    const add = makeEvent({
      type: "POSITION_INCREASED",
      eventId: "dur_add",
      summary: "increased",
      sequence: 2,
      capturedAt: "2026-07-24T14:05:00.000Z",
    });
    const d1 = (await recordSinglePositionEvent({
      userId: 99,
      event: open,
      snapshot: snap([open]),
    }))!;
    const d2 = (await recordSinglePositionEvent({
      userId: 99,
      event: add,
      snapshot: snap([add]),
    }))!;
    assert.equal(d1.decisionId, d2.decisionId);
    const fp1 = fingerprintDecisionContext(d1.context);
    const fp2 = fingerprintDecisionContext(d2.context);
    assert.equal(fp1, fp2);

    // Simulate process restart with same in-memory store still present (unit),
    // then continue lifecycle — fingerprint must remain stable.
    resetDecisionContextRepositoryForTests();
    const reduce = makeEvent({
      type: "POSITION_REDUCED",
      eventId: "dur_red",
      summary: "reduced",
      sequence: 3,
      capturedAt: "2026-07-24T14:10:00.000Z",
    });
    const close = makeEvent({
      type: "POSITION_CLOSED",
      eventId: "dur_close",
      summary: "closed",
      sequence: 4,
      capturedAt: "2026-07-24T14:20:00.000Z",
    });
    const d3 = (await recordSinglePositionEvent({
      userId: 99,
      event: reduce,
      snapshot: snap([reduce]),
    }))!;
    const d4 = (await recordSinglePositionEvent({
      userId: 99,
      event: close,
      snapshot: snap([close]),
    }))!;
    assert.equal(d3.decisionId, d1.decisionId);
    assert.equal(d4.decisionId, d1.decisionId);
    assert.equal(fingerprintDecisionContext(d4.context), fp1);
    assert.equal(d4.status, "CLOSED");
  });

  it("memory repository survives explicit new MemoryDecisionContextRepository sharing store", async () => {
    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: "mem_share",
      summary: "opened",
    });
    const a = new MemoryDecisionContextRepository();
    const created = await recordSinglePositionEvent({
      userId: 12,
      event: open,
      snapshot: snap([open]),
    });
    assert.ok(created);
    const b = new MemoryDecisionContextRepository();
    const found = await b.get(created!.decisionId);
    assert.equal(found?.decisionId, created!.decisionId);
    void a;
  });
});

describe("AI-8.1.1 export sanitization", () => {
  it("builds TradeDecisionExport/v1 without forbidden payloads", async () => {
    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: "exp_1",
      summary: "opened",
    });
    const d = (await recordSinglePositionEvent({
      userId: 3,
      event: open,
      snapshot: snap([open]),
    }))!;
    const exp = buildTradeDecisionExport(d);
    assert.equal(exp.schemaVersion, "TradeDecisionExport/v1");
    assertExportSanitized(exp);
    assert.equal(exp.mentorEligible, false);
  });
});

describe("AI-8.1.1 postgres durability (optional)", () => {
  it("persists across repository instances when DATABASE_URL set", async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      assert.ok(true, "skipped — no DATABASE_URL");
      return;
    }
    process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY = "postgres";
    process.env.GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED = "true";
    process.env.NODE_ENV = "test";
    resetDecisionContextRepositoryForTests();

    const open = makeEvent({
      type: "POSITION_OPENED",
      eventId: `pg_open_${Date.now()}`,
      summary: "opened long",
    });
    const d1 = (await recordSinglePositionEvent({
      userId: 501,
      event: open,
      snapshot: snap([open]),
    }))!;
    const fp = fingerprintDecisionContext(d1.context);

    resetDecisionContextRepositoryForTests();
    const repo2 = new PostgresDecisionContextRepository();
    const loaded = await repo2.get(d1.decisionId);
    assert.ok(loaded);
    assert.equal(loaded!.decisionId, d1.decisionId);
    assert.equal(fingerprintDecisionContext(loaded!.context), fp);

    const viaFactory = await getTradeDecision(d1.decisionId);
    assert.equal(viaFactory?.decisionId, d1.decisionId);
  });
});
