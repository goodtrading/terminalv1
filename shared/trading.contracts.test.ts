import assert from "node:assert/strict";
import test from "node:test";
import {
  createGTTradingEventSchema,
  gtTradingEventEnvelopeSchema,
} from "./trading/events";
import {
  gtInstrumentRefSchema,
  makeGTInstrumentId,
} from "./trading/venue";
import {
  gtOrderIntentSchema,
  gtOrderStateSchema,
} from "./trading/orders";
import {
  gtPositionSchema,
} from "./trading/positions";
import {
  gtMarketTypeSchema,
} from "./trading/venue";

const chartVenue = {
  venue: "binance-spot",
  marketType: "spot",
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
} as const;

const executionVenue = {
  venue: "bingx-perp",
  marketType: "perpetual",
  symbol: "BTC-USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  exchangeNativeSymbol: "BTC-USDT",
} as const;

const now = 1_789_000_000_000;

test("chart venue and execution venue may differ", () => {
  const chartInstrument = gtInstrumentRefSchema.parse(chartVenue);
  const executionInstrument = gtInstrumentRefSchema.parse(executionVenue);

  assert.notDeepEqual(chartInstrument, executionInstrument);
  assert.notEqual(
    makeGTInstrumentId(chartInstrument),
    makeGTInstrumentId(executionInstrument),
  );
});

test("instrument identity includes venue and market type", () => {
  const spot = gtInstrumentRefSchema.parse(chartVenue);
  const perp = gtInstrumentRefSchema.parse({ ...chartVenue, marketType: "perpetual" });

  assert.notEqual(makeGTInstrumentId(spot), makeGTInstrumentId(perp));
  assert.equal(gtMarketTypeSchema.parse(spot.marketType), "spot");
});

test("market order does not require limit price", () => {
  const intent = gtOrderIntentSchema.parse({
    clientOrderId: "ord-001",
    instrument: chartVenue,
    side: "BUY",
    orderType: "MARKET",
    quantity: 1,
    reduceOnly: false,
    postOnly: false,
  });

  assert.equal(intent.orderType, "MARKET");
  assert.equal(intent.price, undefined);
});

test("limit order requires price", () => {
  assert.throws(() =>
    gtOrderIntentSchema.parse({
      clientOrderId: "ord-002",
      instrument: chartVenue,
      side: "SELL",
      orderType: "LIMIT",
      quantity: 1,
    }),
  );
});

test("stop order requires trigger", () => {
  assert.throws(() =>
    gtOrderIntentSchema.parse({
      clientOrderId: "ord-003",
      instrument: chartVenue,
      side: "BUY",
      orderType: "STOP_MARKET",
      quantity: 1,
    }),
  );
});

test("filled quantity cannot exceed requested quantity", () => {
  assert.throws(() =>
    gtOrderStateSchema.parse({
      clientOrderId: "ord-004",
      instrument: chartVenue,
      side: "BUY",
      orderType: "LIMIT",
      quantity: 10,
      filledQuantity: 12,
      remainingQuantity: 0,
      status: "PARTIALLY_FILLED",
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
});

test("order state representation supports partial fill", () => {
  const state = gtOrderStateSchema.parse({
    clientOrderId: "ord-005",
    instrument: chartVenue,
    side: "SELL",
    orderType: "LIMIT",
    quantity: 10,
    filledQuantity: 4,
    remainingQuantity: 6,
    averageFillPrice: 100_000,
    status: "PARTIALLY_FILLED",
    timestamps: {
      createdAt: now,
      updatedAt: now + 1,
      submittedAt: now + 2,
      acceptedAt: now + 3,
      firstFillAt: now + 4,
      lastFillAt: now + 5,
    },
  });

  assert.equal(state.status, "PARTIALLY_FILLED");
  assert.equal(state.remainingQuantity, 6);
});

test("position supports LONG SHORT and FLAT", () => {
  const long = gtPositionSchema.parse({
    instrument: chartVenue,
    side: "LONG",
    quantity: 1.5,
    averageEntryPrice: 100_000,
    realizedPnl: 0,
    unrealizedPnl: 12.5,
    updatedAt: now,
  });
  const short = gtPositionSchema.parse({
    instrument: chartVenue,
    side: "SHORT",
    quantity: 2,
    averageEntryPrice: 101_000,
    realizedPnl: -3,
    unrealizedPnl: 8.25,
    updatedAt: now,
  });
  const flat = gtPositionSchema.parse({
    instrument: chartVenue,
    side: "FLAT",
    quantity: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    updatedAt: now,
  });

  assert.equal(long.side, "LONG");
  assert.equal(short.side, "SHORT");
  assert.equal(flat.side, "FLAT");
});

test("trading event envelope always contains schemaVersion", () => {
  const eventSchema = createGTTradingEventSchema(gtOrderIntentSchema);
  const event = eventSchema.parse({
    schemaVersion: 1,
    eventId: "evt-001",
    eventType: "order.submitted",
    occurredAt: now,
    source: "bridge",
    payload: {
      clientOrderId: "ord-006",
      instrument: chartVenue,
      side: "BUY",
      orderType: "MARKET",
      quantity: 1,
    },
  });

  assert.equal(event.schemaVersion, 1);
});

test("serialization and deserialization preserves event payload", () => {
  const payload = gtOrderIntentSchema.parse({
    clientOrderId: "ord-007",
    instrument: executionVenue,
    side: "SELL",
    orderType: "LIMIT",
    quantity: 2,
    price: 102_500,
    timeInForce: "GTC",
    reduceOnly: true,
    postOnly: false,
    attachedOrders: [{ relation: "TP", price: 101_000, quantity: 2 }],
  });
  const eventSchema = gtTradingEventEnvelopeSchema;
  const event = eventSchema.parse({
    schemaVersion: 1,
    eventId: "evt-002",
    eventType: "order.created",
    occurredAt: now,
    source: "ui",
    payload,
  });
  const roundTrip = JSON.parse(JSON.stringify(event));
  const parsed = eventSchema.parse(roundTrip);

  assert.deepEqual(parsed, event);
  assert.deepEqual(parsed.payload, payload);
});
