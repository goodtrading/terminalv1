// @ts-nocheck

import assert from "node:assert/strict";
import test from "node:test";

import { DeribitOptionsGateway } from "./deribit-gateway.ts";

function makeOption(overrides: Record<string, unknown>) {
  return {
    strike: 65000,
    expiry: "12JUL26",
    optionType: "call",
    openInterest: 100,
    ivMark: 0.65,
    gammaExposure: 1200,
    ...overrides,
  };
}

test("empty summary is explicit no-data and does not invent liquidation / squeeze inputs", async () => {
  const summary = await DeribitOptionsGateway.getSummary([], 65000, "LIVE_DERIBIT");

  assert.equal(summary.liquidationConfluence, null);
  assert.equal(summary.liquidityCascadeEngine, null);
  assert.equal(summary.squeezeProbabilityEngine, null);
  assert.equal(summary.institutionalBiasEngine, null);
  assert.equal(summary.tradeDecisionEngine, null);
  assert.equal(summary.marketModeEngine, null);
  assert.equal(summary.dealerHedgingFlowMap, null);

  const raw = JSON.stringify(summary);
  assert.ok(!raw.includes("71.0k"));
  assert.ok(!raw.includes("70.0k - 70.5k"));
  assert.ok(!raw.includes("0.0001"));
  assert.ok(!raw.includes("0.05"));
});

test("valid options summary still computes GEX and leaves liquidation unavailable", async () => {
  const options = [
    makeOption({ strike: 64000, optionType: "call", openInterest: 140, ivMark: 0.62, gammaExposure: 1800 }),
    makeOption({ strike: 66000, optionType: "put", openInterest: 115, ivMark: 0.68, gammaExposure: 1500 }),
  ];

  const summary = await DeribitOptionsGateway.getSummary(options as any, 65000, "LIVE_DERIBIT");

  assert.equal(summary.totalGex == null, false);
  assert.equal(summary.liquidationConfluence, null);
  assert.ok(summary.gammaCurveEngine != null);
  assert.ok(summary.marketRegime != null);
});
