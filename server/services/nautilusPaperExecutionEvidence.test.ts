import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptNautilusPaperExecutionEvidence,
  type NautilusPaperFillWire,
} from "./nautilusPaperExecutionEvidence";

const base = (overrides: Partial<NautilusPaperFillWire> = {}): NautilusPaperFillWire => ({
  fillId: "trade-1",
  clientOrderId: "client-1",
  venueOrderId: "order-1",
  instrument: { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP" },
  side: "BUY",
  price: "100.000000000000000001",
  quantity: "0.000000000000000123",
  timestamp: 1_700_000_000_123,
  fee: "0",
  feeAsset: "USDT",
  liquidity: "MAKER",
  ...overrides,
});

test("adapts exact factual Nautilus fill evidence with simulated provenance", () => {
  const result = adaptNautilusPaperExecutionEvidence(base());
  assert.deepEqual(result, {
    executionId: "trade-1",
    environment: "PAPER",
    source: "NAUTILUS_PAPER",
    side: "BUY",
    price: "100.000000000000000001",
    quantity: "0.000000000000000123",
    eventTime: 1_700_000_000_123,
    fee: { value: "0", asset: "USDT", quality: "SIMULATED_CONFIGURED_FEE" },
    liquidityRole: "MAKER",
    orderReferences: { clientOrderId: "client-1", venueOrderId: "order-1" },
  });
});

test("requires factual fill identity and never substitutes order identities", () => {
  for (const fillId of [undefined, ""]) {
    assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ fillId })), /fillId/);
  }
  assert.notEqual(base().fillId, base().venueOrderId);
  assert.notEqual(base().fillId, base().clientOrderId);
});

test("preserves distinct fill identities for one client order", () => {
  const a = adaptNautilusPaperExecutionEvidence(base({ fillId: "trade-a" }));
  const b = adaptNautilusPaperExecutionEvidence(base({ fillId: "trade-b" }));
  assert.equal(a.orderReferences.clientOrderId, b.orderReferences.clientOrderId);
  assert.notEqual(a.executionId, b.executionId);
});

test("fails closed for invalid evidence", () => {
  assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ price: "1e-8" })), /price/);
  assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ quantity: "0" })), /quantity/);
  assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ side: "HOLD" as "BUY" })), /side/);
  assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ timestamp: -1 })), /timestamp/);
  assert.throws(() => adaptNautilusPaperExecutionEvidence(base({ fee: "bad" })), /fee/);
});

test("maps only simulator liquidity and defaults missing values to UNKNOWN", () => {
  assert.equal(adaptNautilusPaperExecutionEvidence(base({ liquidity: "TAKER" })).liquidityRole, "TAKER");
  assert.equal(adaptNautilusPaperExecutionEvidence(base({ liquidity: undefined })).liquidityRole, "UNKNOWN");
  assert.equal(adaptNautilusPaperExecutionEvidence(base({ liquidity: "LIMIT" })).liquidityRole, "UNKNOWN");
});

test("is deterministic", () => {
  assert.deepEqual(adaptNautilusPaperExecutionEvidence(base()), adaptNautilusPaperExecutionEvidence(base()));
});
