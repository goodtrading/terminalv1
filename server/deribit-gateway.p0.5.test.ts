import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway, type NormalizedOption } from "./deribit-gateway";

const sampleOptions: NormalizedOption[] = [
  { strike: 65000, expiry: "30SEP26", optionType: "call", openInterest: 100, ivBid: 0.5, ivAsk: 0.6, gammaExposure: 1, vannaExposure: 1, charmExposure: 1 },
  { strike: 64000, expiry: "30SEP26", optionType: "put", openInterest: 80, ivBid: 0.55, ivAsk: 0.65, gammaExposure: 1, vannaExposure: 1, charmExposure: 1 },
];

test("P0.5 analytics error path returns dealerHedgingFlowMap null instead of synthetic dealer flow defaults", async () => {
  const original = (DeribitOptionsGateway as any).getBacktestMetrics;
  (DeribitOptionsGateway as any).getBacktestMetrics = () => { throw new Error("boom"); };

  try {
    const summary = await DeribitOptionsGateway.getSummary(sampleOptions, 65000, "LIVE_DERIBIT");
    assert.equal(summary.dealerHedgingFlowMap, null);
    assert.equal(summary.marketModeEngine?.marketMode, "FRAGILE_TRANSITION");
    assert.equal(summary.marketModeEngine?.marketModeConfidence, 0);
  } finally {
    (DeribitOptionsGateway as any).getBacktestMetrics = original;
  }
});

test("P0.5 valid analytics preserve the computed dealer hedging flow map", async () => {
  const summary = await DeribitOptionsGateway.getSummary(sampleOptions, 65000, "LIVE_DERIBIT");

  assert.deepEqual(summary.dealerHedgingFlowMap, {
    hedgingFlowDirection: "SELLING",
    hedgingFlowStrength: "LOW",
    hedgingAccelerationRisk: "LOW",
    hedgingTriggerZone: "Near call wall at 65k",
    hedgingFlowSummary: ["Dealers likely sell rallies", "Hedging flow caps upside"],
  });
});
