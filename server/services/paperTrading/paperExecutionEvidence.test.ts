import assert from "node:assert/strict";
import test from "node:test";
import { adaptLegacyPaperFillEvidence, type LegacyPaperFillEvidence } from "./paperExecutionEvidence";
import type { PaperFill } from "./paperTypes";

function fill(overrides: Partial<PaperFill> = {}): PaperFill {
  return {
    id: "fill-a",
    tradeId: "trade-1",
    orderId: "order-1",
    symbol: "BTC-USDT",
    venue: "paper",
    marketType: "perpetual",
    side: "long",
    action: "open",
    price: 100,
    quantity: 2,
    notionalUsdt: 200,
    feeUsdt: 0,
    slippageUsdt: 0,
    timestamp: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

test("uses the existing persisted PaperFill.id as canonical executionId", () => {
  const result = adaptLegacyPaperFillEvidence(fill());
  assert.equal(result.status, "AVAILABLE");
  if (result.status !== "AVAILABLE") return;
  assert.equal(result.executionId, "fill-a");
  assert.equal(result.orderId, "order-1");
  assert.equal(result.tradeId, "trade-1");
});

test("does not use orderId or tradeId as execution identity", () => {
  const result = adaptLegacyPaperFillEvidence(fill({ id: "" }));
  assert.deepEqual(result, { status: "UNAVAILABLE", reason: "MISSING_PERSISTED_FILL_ID" });
});

test("marks legacy PAPER evidence as simulated and not Nautilus", () => {
  const result = adaptLegacyPaperFillEvidence(fill());
  assert.equal(result.status, "AVAILABLE");
  if (result.status !== "AVAILABLE") return;
  assert.deepEqual(result.provenance, {
    source: "PAPER_SIMULATOR",
    environment: "PAPER",
    authority: "SIMULATED",
  });
  assert.notEqual(result.provenance.source, "NAUTILUS_PAPER");
});

test("round-tripping a persisted fill preserves executionId and simulated provenance", () => {
  const before = adaptLegacyPaperFillEvidence(fill());
  const after = adaptLegacyPaperFillEvidence(JSON.parse(JSON.stringify(fill())) as PaperFill);
  assert.deepEqual(after, before);
});

test("distinct fills from one order remain distinct executions", () => {
  const first = adaptLegacyPaperFillEvidence(fill({ id: "fill-a" }));
  const second = adaptLegacyPaperFillEvidence(fill({ id: "fill-b" }));
  assert.equal(first.status, "AVAILABLE");
  assert.equal(second.status, "AVAILABLE");
  if (first.status !== "AVAILABLE" || second.status !== "AVAILABLE") return;
  assert.notEqual(first.executionId, second.executionId);
  assert.equal(first.orderId, second.orderId);
  assert.equal(first.tradeId, second.tradeId);
});

test("repeated reads do not mutate the executionId", () => {
  const persisted = fill();
  const first = adaptLegacyPaperFillEvidence(persisted);
  const second = adaptLegacyPaperFillEvidence(persisted);
  assert.deepEqual(second, first);
  assert.equal(persisted.id, "fill-a");
});

test("keeps legacy liquidity role unavailable and does not infer it from order type", () => {
  for (const orderType of ["market", "limit"] as const) {
    const result = adaptLegacyPaperFillEvidence(fill({ action: orderType === "market" ? "open" : "increase" }));
    assert.equal(result.status, "AVAILABLE");
    if (result.status === "AVAILABLE") assert.equal(result.liquidityRole, "UNKNOWN");
  }
});

test("preserves fee, price, quantity, and timestamp semantics", () => {
  const input = fill({ price: 100.25, quantity: 0.125, feeUsdt: 1.5, timestamp: "2026-09-17T12:00:01.000Z" });
  const result = adaptLegacyPaperFillEvidence(input);
  assert.equal(result.status, "AVAILABLE");
  if (result.status !== "AVAILABLE") return;
  assert.equal(result.price, input.price);
  assert.equal(result.quantity, input.quantity);
  assert.equal(result.feeUsdt, input.feeUsdt);
  assert.equal(result.timestamp, input.timestamp);
});

const _typeCheck: LegacyPaperFillEvidence | null = null;
void _typeCheck;
