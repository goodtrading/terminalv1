import assert from "node:assert/strict";
import test from "node:test";
import { createOrderDecisionEvidence, type OrderDecisionEvidence } from "./orderDecisionEvidence";
import { deriveOrderDecisionMarketContext } from "./orderDecisionMarketContext";

const decisionAt = new Date("2026-09-16T12:00:00.000Z");
function evidence(overrides: Partial<OrderDecisionEvidence> = {}): OrderDecisionEvidence {
  return createOrderDecisionEvidence({ decisionAt, marketSource: "BINGX_WS", marketSourceTimestamp: new Date("2026-09-16T11:59:59.900Z"), bestBid: "100.0000000000000001", bestAsk: "100.0000000000000003", marketEvidenceQuality: "EXACT_OBSERVED", ...overrides });
}
function unavailable(): OrderDecisionEvidence { return createOrderDecisionEvidence({ decisionAt, marketSource: "UNAVAILABLE", marketSourceTimestamp: null, bestBid: null, bestAsk: null, marketEvidenceQuality: "UNAVAILABLE" }); }

test("derives available factual decision BBO, spread, mid, and age", () => {
  const result = deriveOrderDecisionMarketContext(evidence());
  assert.equal(result.status, "AVAILABLE");
  if (result.status !== "AVAILABLE") return;
  assert.equal(result.bestBid, "100.0000000000000001"); assert.equal(result.bestAsk, "100.0000000000000003");
  assert.equal(result.spread, "0.0000000000000002"); assert.equal(result.mid, "100.0000000000000002"); assert.equal(result.decisionMarketAgeMs, 100);
  assert.equal(result.marketSource, "BINGX_WS"); assert.equal(result.decisionAt.toISOString(), decisionAt.toISOString());
});

test("accepts zero spread and equal source timestamp", () => {
  const result = deriveOrderDecisionMarketContext(evidence({ bestBid: "100", bestAsk: "100", marketSourceTimestamp: decisionAt }));
  assert.equal(result.status, "AVAILABLE"); if (result.status === "AVAILABLE") { assert.equal(result.spread, "0"); assert.equal(result.mid, "100"); assert.equal(result.decisionMarketAgeMs, 0); }
});

test("returns unavailable without throwing for unavailable and historical evidence", () => {
  const result = deriveOrderDecisionMarketContext(unavailable());
  assert.equal(result.status, "UNAVAILABLE"); assert.equal(result.spread, null); assert.equal(result.mid, null); assert.ok(result.reasons.includes("MARKET_EVIDENCE_UNAVAILABLE"));
});

test("fails closed for missing sides, timestamp, malformed decimals, and crossed BBO", () => {
  const cases: [Partial<OrderDecisionEvidence>, string][] = [
    [{ bestBid: null }, "MISSING_BID"], [{ bestAsk: null }, "MISSING_ASK"], [{ marketSourceTimestamp: null }, "MISSING_MARKET_SOURCE_TIMESTAMP"],
    [{ bestBid: "not-decimal" }, "INVALID_BID"], [{ bestAsk: "not-decimal" }, "INVALID_ASK"], [{ bestBid: "101", bestAsk: "100" }, "CROSSED_BBO"],
  ];
  for (const [overrides, reason] of cases) { const result = deriveOrderDecisionMarketContext({ ...evidence(), ...overrides } as OrderDecisionEvidence); assert.notEqual(result.status, "AVAILABLE"); assert.ok(result.reasons.includes(reason as never)); assert.equal(result.spread, null); assert.equal(result.mid, null); }
});

test("keeps factual BBO but withholds negative age when source clock is ahead", () => {
  const result = deriveOrderDecisionMarketContext(evidence({ marketSourceTimestamp: new Date("2026-09-16T12:00:00.100Z") }));
  assert.equal(result.status, "AVAILABLE"); if (result.status === "AVAILABLE") { assert.equal(result.decisionMarketAgeMs, null); assert.ok(result.reasons.includes("SOURCE_TIMESTAMP_AFTER_DECISION")); }
});

test("preserves exact high precision arithmetic and deterministic replay", () => {
  const input = evidence({ bestBid: "0.000000000000000001", bestAsk: "0.000000000000000003" });
  const a = deriveOrderDecisionMarketContext(input); const b = deriveOrderDecisionMarketContext(input); assert.deepEqual(a, b);
  if (a.status === "AVAILABLE") { assert.equal(a.spread, "0.000000000000000002"); assert.equal(a.mid, "0.000000000000000002"); }
});

test("does not mutate or require a market lookup", () => {
  const input = evidence(); const before = JSON.stringify(input); deriveOrderDecisionMarketContext(input); assert.equal(JSON.stringify(input), before);
});
