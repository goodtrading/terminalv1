import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bingxAccountSnapshotSchema,
  traderActionContextSchema,
  canUseBingxAccountForMentor,
  canUseBingxActionsForLearning,
  BINGX_UI_BADGES,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  classifyBingxEndpoint,
  isPrivateReadAllowed,
  isPrivateWriteEndpoint,
  BINGX_PATHS,
  assertBingxWriteAllowed,
  BingxAccountError,
  BINGX_WRITE_OPERATION_BLOCKED,
  reconcileAccountSnapshots,
  deriveCompleteness,
  assertSameAccountMode,
  buildTraderActionContext,
  assertAiBoundaryDisabled,
  venueLabelForMode,
} from "./index";
import {
  normalizeBalances,
  normalizePositions,
  normalizeOpenOrders,
  normalizeFills,
  normalizeOrderHistory,
  toPublicOrder,
  toPublicFill,
} from "./normalizers";
import { appendSignature, signBingxQuery, buildSignedQuery } from "./signer";
import { redactForLog, maskApiKey, pseudonymizeId } from "./redact";
import { clearTimelineForTests, appendTimelineEvents, getTimeline } from "./timeline";
import type { BingxAccountSnapshot } from "../../../../shared/goodTradingAiBingxAccount";

describe("BINGX-1 allowlist + write guard", () => {
  it("classifies private read paths", () => {
    assert.equal(classifyBingxEndpoint("GET", BINGX_PATHS.BALANCE), "PRIVATE_READ");
    assert.equal(isPrivateReadAllowed("GET", BINGX_PATHS.POSITIONS), true);
    assert.equal(isPrivateReadAllowed("GET", BINGX_PATHS.ALL_FILLS), true);
  });

  it("classifies write paths and blocks them", () => {
    assert.equal(
      classifyBingxEndpoint("POST", "/openApi/swap/v2/trade/order"),
      "PRIVATE_WRITE",
    );
    assert.equal(
      isPrivateWriteEndpoint("POST", "/openApi/swap/v2/trade/order"),
      true,
    );
    assert.throws(
      () => assertBingxWriteAllowed("POST", "/openApi/swap/v2/trade/order"),
      (err: unknown) =>
        err instanceof BingxAccountError &&
        err.code === BINGX_WRITE_OPERATION_BLOCKED,
    );
    assert.throws(
      () => assertBingxWriteAllowed("place_order"),
      (err: unknown) =>
        err instanceof BingxAccountError &&
        err.code === BINGX_WRITE_OPERATION_BLOCKED,
    );
  });
});

describe("BINGX-1 signing + redaction", () => {
  it("signs deterministically without leaking secret in query builder", () => {
    const qs = buildSignedQuery({ b: 2, a: 1, timestamp: 1000, recvWindow: 5000 });
    assert.equal(qs, "a=1&b=2&recvWindow=5000&timestamp=1000");
    const sig = signBingxQuery(qs, "test-secret");
    assert.equal(sig.length, 64);
    const { query } = appendSignature({ symbol: "BTC-USDT" }, "test-secret", 1_700_000_000_000);
    assert.match(query, /signature=[a-f0-9]{64}/);
    assert.doesNotMatch(query, /test-secret/);
  });

  it("redacts secrets and masks keys", () => {
    assert.equal(maskApiKey("ABCDEFGHIJKLMNOP"), "ABCDEF****MNOP");
    const redacted = redactForLog({
      apiSecret: "super-secret",
      apiKey: "keyvalue",
      ok: true,
    }) as Record<string, unknown>;
    assert.equal(redacted.apiSecret, "[REDACTED]");
    assert.equal(redacted.apiKey, "[REDACTED]");
    assert.equal(redacted.ok, true);
  });

  it("pseudonymizes ids stably", () => {
    const a = pseudonymizeId("order", "12345", "u1");
    const b = pseudonymizeId("order", "12345", "u1");
    const c = pseudonymizeId("order", "12345", "u2");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^order_/);
  });
});

describe("BINGX-1 normalizers", () => {
  it("normalizes balances/positions/orders/fills", () => {
    const balances = normalizeBalances([
      {
        asset: "USDT",
        balance: "1000",
        availableMargin: "800",
        unrealizedProfit: "12.5",
      },
    ]);
    assert.equal(balances[0]?.walletBalance, 1000);
    assert.equal(balances[0]?.accountMode, "REAL_BINGX_READ_ONLY");

    const positions = normalizePositions(
      [
        {
          symbol: "BTC-USDT",
          positionSide: "LONG",
          positionAmt: "0.01",
          avgPrice: "60000",
          markPrice: "61000",
          leverage: 10,
          marginMode: "cross",
        },
      ],
      "account_abc",
      "u1",
      false,
    );
    assert.equal(positions.length, 1);
    assert.equal(positions[0]?.side, "long");
    assert.equal(positions[0]?.quantity, 0.01);

    const orders = normalizeOpenOrders(
      [
        {
          orderId: "999",
          symbol: "BTC-USDT",
          side: "SELL",
          type: "LIMIT",
          status: "NEW",
          price: "62000",
          origQty: "0.01",
          executedQty: "0",
          reduceOnly: true,
        },
      ],
      "account_abc",
      "u1",
      false,
    );
    assert.equal(orders[0]?.reduceOnly, true);
    const pub = toPublicOrder(orders[0]!);
    assert.equal("exchangeOrderId" in pub, false);

    const fills = normalizeFills(
      [
        {
          fillId: "f1",
          orderId: "999",
          symbol: "BTC-USDT",
          side: "BUY",
          price: "60000",
          qty: "0.01",
          commission: "0.1",
          commissionAsset: "USDT",
          filledTime: Date.now(),
        },
      ],
      "account_abc",
      "u1",
    );
    assert.equal(fills[0]?.price, 60000);
    assert.equal("exchangeFillId" in toPublicFill(fills[0]!), false);
  });

  it("handles malformed rows without inventing actions", () => {
    assert.deepEqual(normalizeBalances([{}]), []);
    assert.deepEqual(normalizePositions([{ foo: 1 }], "a", "s", false), []);
    assert.deepEqual(normalizeFills([{ symbol: "BTC-USDT" }], "a", "s"), []);
  });
});

describe("BINGX-1 reconciliation", () => {
  function baseSnapshot(
    overrides: Partial<BingxAccountSnapshot> = {},
  ): BingxAccountSnapshot {
    return {
      accountId: "account_test",
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
      capturedAt: new Date().toISOString(),
      sourceAgeMs: 0,
      mentorEligible: false,
      aiConsumptionEnabled: false,
      canUseForMentor: false,
      canUseForLearning: false,
      ...overrides,
    };
  }

  it("detects open / increase / reduce / close / flip", () => {
    const prev = baseSnapshot({
      positions: [
        {
          positionId: "p1",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "long",
          quantity: 1,
          stale: false,
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const increased = baseSnapshot({
      positions: [
        {
          positionId: "p1",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "long",
          quantity: 2,
          stale: false,
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
      capturedAt: "2026-01-01T00:01:00.000Z",
    });
    const inc = reconcileAccountSnapshots(prev, increased, 1);
    assert.ok(inc.events.some((e) => e.type === "POSITION_INCREASED"));

    const reduced = baseSnapshot({
      positions: [
        {
          positionId: "p1",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "long",
          quantity: 0.5,
          stale: false,
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
      capturedAt: "2026-01-01T00:02:00.000Z",
    });
    const red = reconcileAccountSnapshots(increased, reduced, 2);
    assert.ok(red.events.some((e) => e.type === "POSITION_REDUCED"));

    const closed = baseSnapshot({
      positions: [],
      capturedAt: "2026-01-01T00:03:00.000Z",
    });
    const clo = reconcileAccountSnapshots(reduced, closed, 3);
    assert.ok(clo.events.some((e) => e.type === "POSITION_CLOSED"));

    const flipped = baseSnapshot({
      positions: [
        {
          positionId: "p2",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "short",
          quantity: 1,
          stale: false,
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
      capturedAt: "2026-01-01T00:04:00.000Z",
    });
    const flip = reconcileAccountSnapshots(prev, flipped, 4);
    assert.ok(flip.events.some((e) => e.type === "POSITION_FLIPPED"));
  });

  it("marks external cancel when order disappears without fill", () => {
    const prev = baseSnapshot({
      openOrders: [
        {
          orderId: "order_abc",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "buy",
          type: "limit",
          status: "open",
          stale: false,
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const cur = baseSnapshot({
      openOrders: [],
      recentFills: [],
      capturedAt: "2026-01-01T00:01:00.000Z",
    });
    const r = reconcileAccountSnapshots(prev, cur, 1);
    assert.ok(r.events.some((e) => e.type === "ORDER_CANCELLED_EXTERNALLY"));
  });

  it("does not treat fill alone as position intention", () => {
    const prev = baseSnapshot({
      capturedAt: "2026-01-01T00:00:00.000Z",
      recentFills: [],
    });
    const cur = baseSnapshot({
      capturedAt: "2026-01-01T00:01:00.000Z",
      recentFills: [
        {
          fillId: "fill_1",
          accountId: "account_test",
          symbol: "BTC-USDT",
          side: "buy",
          price: 1,
          quantity: 1,
          timestamp: "2026-01-01T00:01:00.000Z",
          accountMode: "REAL_BINGX_READ_ONLY",
          source: "BINGX_ACCOUNT_READ_ONLY",
        },
      ],
    });
    const r = reconcileAccountSnapshots(prev, cur, 1);
    assert.ok(!r.events.some((e) => e.type.startsWith("POSITION_")));
    assert.ok(r.notes.some((n) => /fill observed/i.test(n)));
  });
});

describe("BINGX-1 isolation + AI boundary", () => {
  it("keeps mentor/learning false and isolates modes", () => {
    assert.equal(canUseBingxAccountForMentor(), false);
    assert.equal(canUseBingxActionsForLearning(), false);
    assertAiBoundaryDisabled();
    assert.equal(venueLabelForMode("REAL_BINGX_READ_ONLY"), "REAL — READ ONLY");
    assert.equal(venueLabelForMode("PAPER_TRADING"), "PAPER");
    assert.throws(() =>
      assertSameAccountMode(
        [{ accountMode: "PAPER_TRADING" }],
        "REAL_BINGX_READ_ONLY",
      ),
    );
  });

  it("builds TraderActionContext with AI flags false", () => {
    const snap = bingxAccountSnapshotSchema.parse({
      accountId: "account_x",
      exchange: "bingx",
      accountMode: "REAL_BINGX_READ_ONLY",
      source: "BINGX_ACCOUNT_READ_ONLY",
      completeness: "PARTIAL",
      health: {
        status: "degraded",
        connected: true,
        configured: true,
        permissionsClassification: "read_only",
        stale: false,
        warnings: ["fills:BINGX_TRANSPORT_ERROR"],
      },
      balances: [],
      positions: [],
      openOrders: [],
      recentOrders: [],
      recentFills: [],
      capturedAt: new Date().toISOString(),
      sourceAgeMs: 10,
      mentorEligible: false,
      aiConsumptionEnabled: false,
      canUseForMentor: false,
      canUseForLearning: false,
    });
    const ctx = buildTraderActionContext(snap);
    const parsed = traderActionContextSchema.parse(ctx);
    assert.equal(parsed.mentorEligible, false);
    assert.equal(parsed.aiConsumptionEnabled, false);
    assert.equal(parsed.canUseBingxAccountForMentor, false);
  });
});

describe("BINGX-1 read model + timeline", () => {
  it("derives completeness states", () => {
    assert.equal(
      deriveCompleteness({
        balanceOk: true,
        positionsOk: true,
        openOrdersOk: true,
        historyOk: true,
        fillsOk: true,
      }),
      "COMPLETE",
    );
    assert.equal(
      deriveCompleteness({
        balanceOk: true,
        positionsOk: true,
        openOrdersOk: true,
        historyOk: false,
        fillsOk: false,
      }),
      "PARTIAL",
    );
    assert.equal(
      deriveCompleteness({
        balanceOk: false,
        positionsOk: true,
        openOrdersOk: true,
        historyOk: true,
        fillsOk: true,
      }),
      "DEGRADED",
    );
    assert.equal(
      deriveCompleteness({
        balanceOk: false,
        positionsOk: false,
        openOrdersOk: false,
        historyOk: false,
        fillsOk: false,
      }),
      "UNAVAILABLE",
    );
  });

  it("stores bounded timeline without AI flags", () => {
    clearTimelineForTests();
    const events = appendTimelineEvents(1, "account_t", [
      {
        eventId: "e1",
        sequence: 0,
        type: "POSITION_OPENED",
        confidence: "DERIVED",
        summary: "opened",
        capturedAt: new Date().toISOString(),
        accountId: "account_t",
        accountMode: "REAL_BINGX_READ_ONLY",
        source: "BINGX_ACCOUNT_READ_ONLY",
        mentorEligible: false,
        aiConsumptionEnabled: false,
        reconciliationVersion: 1,
      },
    ]);
    assert.equal(events.length, 1);
    assert.equal(getTimeline(1, "account_t").length, 1);
  });
});

describe("N8.3R source truth preservation", () => {
  it("preserves order facts and distinguishes absent booleans and remaining origin", () => {
    const [explicit] = normalizeOpenOrders([{
      orderId: "native-order-1", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "NEW",
      origQty: "2", executedQty: "0", remainingQty: "2", clientOrderId: "client-1",
      timeInForce: "IOC", reduceOnly: false, postOnly: true, createTime: 1_700_000_000_000,
    }], "account", "salt", false);
    assert.equal(explicit?.privateTruth.sourceClientOrderId, "client-1");
    assert.equal(explicit?.privateTruth.sourceTimeInForce, "IOC");
    assert.equal(explicit?.privateTruth.sourceReduceOnly, false);
    assert.equal(explicit?.privateTruth.sourcePostOnly, true);
    assert.equal(explicit?.privateTruth.reduceOnlyPresent, true);
    assert.equal(explicit?.privateTruth.postOnlyPresent, true);
    assert.equal(explicit?.privateTruth.remainingQuantityOrigin, "BROKER_REPORTED");
    assert.equal(explicit?.privateTruth.createdAtOrigin, "BROKER");
    assert.equal(explicit?.privateTruth.updatedAtOrigin, "MISSING");

    const [derived] = normalizeOpenOrders([{
      orderId: "native-order-2", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "NEW",
      origQty: "2", executedQty: "1",
    }], "account", "salt", false);
    assert.equal(derived?.privateTruth.reduceOnlyPresent, false);
    assert.equal(derived?.privateTruth.sourceReduceOnly, undefined);
    assert.equal(derived?.privateTruth.postOnlyPresent, false);
    assert.equal(derived?.privateTruth.remainingQuantityOrigin, "DERIVED_ORIGINAL_MINUS_EXECUTED");
    assert.equal(derived?.privateTruth.sourceClientOrderId, undefined);
    assert.equal(derived?.privateTruth.sourceTimeInForce, undefined);
    assert.equal((toPublicOrder(explicit!) as Record<string, unknown>).privateTruth, undefined);
  });

  it("preserves factual fill identity candidates and timestamp provenance", () => {
    const [fill, trade, generic, fallback] = normalizeFills([
      { fillId: "f1", symbol: "BTC-USDT", side: "BUY", price: "10", qty: "1", filledTime: 1_700_000_000_000, fee: "0", feeAsset: "USDT" },
      { tradeId: "t1", symbol: "BTC-USDT", side: "SELL", price: "11", qty: "1", timestamp: 1_700_000_000_001 },
      { id: "g1", symbol: "BTC-USDT", side: "BUY", price: "12", qty: "1", time: 1_700_000_000_002 },
      { orderId: "o1", symbol: "BTC-USDT", side: "SELL", price: "13", qty: "1" },
    ], "account", "salt");
    assert.equal(fill?.privateTruth.fillIdBasis, "FILL_ID");
    assert.equal(fill?.privateTruth.sourceFillId, "f1");
    assert.equal(fill?.privateTruth.sourceTimestamp, "2023-11-14T22:13:20.000Z");
    assert.equal(fill?.privateTruth.timestampOrigin, "BROKER");
    assert.equal(fill?.privateTruth.feePresent, true);
    assert.equal(fill?.privateTruth.quantitySource, "qty");
    assert.equal(fill?.privateTruth.priceSource, "price");
    assert.equal(trade?.privateTruth.fillIdBasis, "TRADE_ID");
    assert.equal(generic?.privateTruth.fillIdBasis, "GENERIC_ID");
    assert.equal(fallback?.privateTruth.fillIdBasis, "ORDER_ID_FALLBACK");
    assert.equal(fallback?.privateTruth.sourceOrderId, "o1");
    assert.equal(fallback?.privateTruth.sourceTimestamp, undefined);
    assert.equal(fallback?.privateTruth.timestampOrigin, "LOCAL_FALLBACK");
    assert.equal((toPublicFill(fill!) as Record<string, unknown>).privateTruth, undefined);
  });

  it("keeps history truth private and preserves explicit fee zero versus absence", () => {
    const [history] = normalizeOrderHistory([{
      orderId: "h1", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "FILLED",
      origQty: 1, executedQty: 1, clientOrderID: "client-h", postOnly: false,
    }], "account", "salt");
    assert.equal(history?.privateTruth.sourceClientOrderId, "client-h");
    assert.equal(history?.privateTruth.sourcePostOnly, false);
    assert.equal(Object.keys(history ?? {}).includes("privateTruth"), false);

    const [zero, absent] = normalizeFills([
      { fillId: "z", symbol: "BTC-USDT", side: "BUY", price: 1, qty: 1, fee: 0 },
      { fillId: "a", symbol: "BTC-USDT", side: "BUY", price: 1, qty: 1 },
    ], "account", "salt");
    assert.equal(zero?.privateTruth.feePresent, true);
    assert.equal(absent?.privateTruth.feePresent, false);
    assert.equal(zero?.fee, 0);
    assert.equal(absent?.fee, undefined);
  });
});

describe("BINGX-1 UI badges contract", () => {
  it("exposes required badges and no write affordance labels", () => {
    assert.ok(BINGX_UI_BADGES.includes("BINGX REAL"));
    assert.ok(BINGX_UI_BADGES.includes("READ ONLY"));
    assert.ok(BINGX_UI_BADGES.includes("NOT CONNECTED TO AI"));
  });
});
