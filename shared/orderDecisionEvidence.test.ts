import assert from "node:assert/strict";
import test from "node:test";
import { createOrderDecisionEvidence, unavailableDecisionMarketContext, type OrderDecisionEvidence } from "./orderDecisionEvidence";

test("captures immutable decision time and exact decimal BBO context", () => {
  const evidence = createOrderDecisionEvidence({
    decisionAt: new Date("2026-09-16T12:00:00.123Z"),
    marketSource: "LOCAL_BBO",
    marketSourceTimestamp: new Date("2026-09-16T11:59:59.900Z"),
    bestBid: "64000.12345678",
    bestAsk: "64001.12345678",
    marketEvidenceQuality: "EXACT_OBSERVED",
  });
  assert.equal(evidence.decisionAt.toISOString(), "2026-09-16T12:00:00.123Z");
  assert.equal(evidence.bestBid, "64000.12345678");
  assert.equal(evidence.bestAsk, "64001.12345678");
  assert.notEqual(evidence.decisionAt, evidence.marketSourceTimestamp);
});

test("represents unavailable market context without sentinel values", () => {
  const evidence: OrderDecisionEvidence = createOrderDecisionEvidence({
    decisionAt: new Date("2026-09-16T12:00:00.123Z"),
    ...unavailableDecisionMarketContext(),
  });
  assert.equal(evidence.marketEvidenceQuality, "UNAVAILABLE");
  assert.equal(evidence.bestBid, null);
  assert.equal(evidence.bestAsk, null);
  assert.equal(evidence.marketSourceTimestamp, null);
});
