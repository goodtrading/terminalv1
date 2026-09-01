// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  aggregateLiveStructuralExposure,
  DeribitOptionsGateway,
} from "./deribit-gateway";

const EPS = 1e-12;

function option(optionType: "call" | "put", vannaExposure: number | null, charmExposure: number | null) {
  return {
    strike: 65_000,
    expiry: "27SEP26",
    optionType,
    openInterest: 100,
    ivMark: 50,
    ivBid: undefined,
    ivAsk: undefined,
    gammaExposure: 0,
    vannaExposure,
    charmExposure,
  };
}

function aggregateLikeGateway(rows: any[], field: "vannaExposure" | "charmExposure") {
  const values = rows
    .map((row) => Number(row[field]))
    .filter((value) => Number.isFinite(value));
  const signedNet = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  const grossAbs = values.length > 0 ? values.reduce((sum, value) => sum + Math.abs(value), 0) : null;
  const directionalRatio = grossAbs != null && grossAbs > 0 && signedNet != null ? signedNet / grossAbs : null;
  return { signedNet, grossAbs, directionalRatio };
}

function makeLiveRows() {
  return [
    {
      instrument_name: "BTC-27SEP26-65000-C",
      open_interest: 100,
      underlying_price: 65_000,
      mark_iv: 50,
      bid_iv: undefined,
      ask_iv: undefined,
      best_bid_price: 1.1,
      best_ask_price: 1.2,
      best_bid_amount: 10,
      best_ask_amount: 11,
    },
    {
      instrument_name: "BTC-27SEP26-70000-P",
      open_interest: 120,
      underlying_price: 64_850,
      mark_iv: undefined,
      bid_iv: 54,
      ask_iv: 56,
      best_bid_price: 1.1,
      best_ask_price: 1.2,
      best_bid_amount: 10,
      best_ask_amount: 11,
    },
    {
      instrument_name: "BTC-30NOV26-72000-P",
      open_interest: 80,
      underlying_price: 66_000,
      mark_iv: 48,
      best_bid_price: 1.1,
      best_ask_price: 1.2,
      best_bid_amount: 10,
      best_ask_amount: 11,
    },
    {
      instrument_name: "BTC-27SEP26-62000-C",
      open_interest: 0,
      underlying_price: 65_100,
      mark_iv: 60,
      best_bid_price: 1.1,
      best_ask_price: 1.2,
      best_bid_amount: 10,
      best_ask_amount: 11,
    },
    {
      instrument_name: "BTC-15AUG26-64000-C",
      open_interest: 75,
      underlying_price: 65_000,
      mark_iv: 55,
      best_bid_price: 1.1,
      best_ask_price: 1.2,
      best_bid_amount: 10,
      best_ask_amount: 11,
    },
  ];
}

function withMockedFetch(resultRows: any[]) {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ result: resultRows }),
  })) as typeof fetch;
  (Date as any).now = () => Date.UTC(2026, 7, 30, 8, 0, 0);
  (DeribitOptionsGateway as any).liveCache = null;

  return {
    async run() {
      const ingestion = await DeribitOptionsGateway.ingestOptions();
      const summary = await DeribitOptionsGateway.getSummary(ingestion.options, 65_000, ingestion.source);
      return { ingestion, summary };
    },
    restore() {
      (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
      (Date as any).now = originalDateNow;
      (DeribitOptionsGateway as any).liveCache = null;
    },
  };
}

test("P2.2 structural normalization helper computes net, gross and ratio contracts", () => {
  const allPositive = aggregateLiveStructuralExposure([option("call", 25, 10), option("put", 75, 30)] as any, "vannaExposure");
  assert.equal(allPositive.signedNet, 100);
  assert.equal(allPositive.grossAbs, 100);
  assert.equal(allPositive.directionalRatio, 1);
  assert.equal(allPositive.callSignedContribution, 25);
  assert.equal(allPositive.putSignedContribution, 75);
  assert.equal(allPositive.validRows, 2);
  assert.equal(allPositive.totalEligibleRows, 2);

  const allNegative = aggregateLiveStructuralExposure([option("call", -40, -12), option("put", -60, -18)] as any, "vannaExposure");
  assert.equal(allNegative.signedNet, -100);
  assert.equal(allNegative.grossAbs, 100);
  assert.equal(allNegative.directionalRatio, -1);
  assert.equal(allNegative.callSignedContribution, -40);
  assert.equal(allNegative.putSignedContribution, -60);

  const balanced = aggregateLiveStructuralExposure([option("call", 50, 8), option("put", -50, -8)] as any, "vannaExposure");
  assert.equal(balanced.signedNet, 0);
  assert.equal(balanced.grossAbs, 100);
  assert.equal(balanced.directionalRatio, 0);

  const plus75Minus25 = aggregateLiveStructuralExposure([option("call", 75, 11), option("put", -25, -3)] as any, "vannaExposure");
  assert.equal(plus75Minus25.signedNet, 50);
  assert.equal(plus75Minus25.grossAbs, 100);
  assert.equal(plus75Minus25.directionalRatio, 0.5);

  const plus25Minus75 = aggregateLiveStructuralExposure([option("call", 25, 3), option("put", -75, -11)] as any, "vannaExposure");
  assert.equal(plus25Minus75.signedNet, -50);
  assert.equal(plus25Minus75.grossAbs, 100);
  assert.equal(plus25Minus75.directionalRatio, -0.5);

  const zeroValid = aggregateLiveStructuralExposure([option("call", 0, 0), option("put", 0, 0)] as any, "vannaExposure");
  assert.equal(zeroValid.signedNet, 0);
  assert.equal(zeroValid.grossAbs, 0);
  assert.equal(zeroValid.directionalRatio, null);
  assert.equal(zeroValid.validRows, 2);

  const unavailable = aggregateLiveStructuralExposure([] as any, "vannaExposure");
  assert.equal(unavailable.signedNet, null);
  assert.equal(unavailable.grossAbs, null);
  assert.equal(unavailable.directionalRatio, null);
  assert.equal(unavailable.validRows, 0);

  for (const factor of [0.5, 2, 10]) {
    const scaled = aggregateLiveStructuralExposure(
      [option("call", 75 * factor, 10), option("put", -25 * factor, -3)] as any,
      "vannaExposure",
    );
    assert.ok(Math.abs((scaled.signedNet ?? 0) - 50 * factor) < EPS);
    assert.ok(Math.abs((scaled.grossAbs ?? 0) - 100 * factor) < EPS);
    assert.ok(Math.abs((scaled.directionalRatio ?? 0) - 0.5) < EPS);
  }

  const charm = aggregateLiveStructuralExposure([option("call", 12, 75), option("put", -3, -25)] as any, "charmExposure");
  assert.equal(charm.signedNet, 50);
  assert.equal(charm.grossAbs, 100);
  assert.equal(charm.directionalRatio, 0.5);
  assert.equal(charm.callSignedContribution, 75);
  assert.equal(charm.putSignedContribution, -25);
});

test("P2.2 live summary adds structural fields without changing signed net exposure", async () => {
  const mock = withMockedFetch(makeLiveRows());
  try {
    const { ingestion, summary } = await mock.run();

    assert.equal(ingestion.source, "LIVE_DERIBIT");
    assert.equal(ingestion.options.length, 4);

    const vannaExpected = aggregateLikeGateway(ingestion.options, "vannaExposure");
    const charmExpected = aggregateLikeGateway(ingestion.options, "charmExposure");

    assert.equal(summary.liveVannaExposure, summary.totalVanna);
    assert.equal(summary.liveCharmExposure, summary.totalCharm);
    assert.ok(Math.abs((summary.liveVannaExposure ?? 0) - (vannaExpected.signedNet ?? 0)) < EPS);
    assert.ok(Math.abs((summary.liveCharmExposure ?? 0) - (charmExpected.signedNet ?? 0)) < EPS);

    assert.ok(Math.abs((summary.liveVannaGrossAbsExposure ?? 0) - (vannaExpected.grossAbs ?? 0)) < 1e-9);
    assert.ok(Math.abs((summary.liveCharmGrossAbsExposure ?? 0) - (charmExpected.grossAbs ?? 0)) < 1e-9);
    assert.ok(Math.abs((summary.liveVannaDirectionalRatio ?? 0) - (vannaExpected.directionalRatio ?? 0)) < 1e-12);
    assert.ok(Math.abs((summary.liveCharmDirectionalRatio ?? 0) - (charmExpected.directionalRatio ?? 0)) < 1e-12);

    assert.equal(summary.dealerHedgeSensitivity.source, "LIVE_DERIBIT");
    assert.equal(summary.dealerHedgeSensitivity.gammaUsdPerDollar, summary.totalGex);
    assert.equal(summary.dealerHedgeSensitivity.vannaUsdPerVolPoint, summary.liveVannaExposure);
    assert.equal(summary.dealerHedgeSensitivity.vannaGrossAbsUsdPerVolPoint, summary.liveVannaGrossAbsExposure);
    assert.equal(summary.dealerHedgeSensitivity.vannaDirectionalRatio, summary.liveVannaDirectionalRatio);
    assert.equal(summary.dealerHedgeSensitivity.charmUsdPerDay, summary.liveCharmExposure);
    assert.equal(summary.dealerHedgeSensitivity.charmGrossAbsUsdPerDay, summary.liveCharmGrossAbsExposure);
    assert.equal(summary.dealerHedgeSensitivity.charmDirectionalRatio, summary.liveCharmDirectionalRatio);
    assert.equal(summary.dealerHedgeSensitivity.vannaValidRows, summary.liveVannaValidRows);
    assert.equal(summary.dealerHedgeSensitivity.vannaTotalEligibleRows, summary.liveVannaTotalEligibleRows);
    assert.equal(summary.dealerHedgeSensitivity.charmValidRows, summary.liveCharmValidRows);
    assert.equal(summary.dealerHedgeSensitivity.charmTotalEligibleRows, summary.liveCharmTotalEligibleRows);

    const stressByType = new Map(summary.dealerHedgeStressScenarios.map((scenario: any) => [scenario.scenarioType, scenario] as const));
    assert.equal(stressByType.size, 4);
    assert.equal(stressByType.get("SPOT_UP_1PCT")?.deltaIvVolPoints, 0);
    assert.equal(stressByType.get("SPOT_UP_1PCT")?.deltaDays, 0);
    assert.equal(stressByType.get("VOL_UP_1PT")?.deltaSpotUsd, 0);
    assert.equal(stressByType.get("TIME_DECAY_1D")?.deltaSpotUsd, 0);
    assert.equal(stressByType.get("SPOT_UP_1PCT")?.hedgeAction, stressByType.get("SPOT_UP_1PCT")?.requiredHedgeTradeUsd != null ? (stressByType.get("SPOT_UP_1PCT")?.requiredHedgeTradeUsd! > 0 ? "BUY" : stressByType.get("SPOT_UP_1PCT")?.requiredHedgeTradeUsd! < 0 ? "SELL" : "NEUTRAL") : null);
    assert.equal(stressByType.get("VOL_UP_1PT")?.gammaOptionDeltaChangeUsd, 0);
    assert.equal(stressByType.get("TIME_DECAY_1D")?.vannaOptionDeltaChangeUsd, 0);
    assert.equal(stressByType.get("SPOT_UP_1PCT")?.source, "LIVE_DERIBIT");

    assert.ok(summary.dealerHedgeState);
    assert.deepEqual(summary.dealerHedgeState.sensitivity, summary.dealerHedgeSensitivity);
    assert.deepEqual(summary.dealerHedgeState.standardizedStress, summary.dealerHedgeStressScenarios);
    assert.deepEqual(summary.dealerHedgeState.metadata, {
      structuralPositioningProxy: true,
      observedDealerFlow: false,
      expectedFlowForecast: false,
    });
    assert.equal(summary.dealerHedgeState.structuralPressure?.score, summary.dealerFlowScore);
    assert.equal(summary.dealerHedgeState.structuralPressure?.bias, summary.dealerHedgingFlowMap?.hedgingFlowDirection);

    assert.equal(summary.liveVannaValidRows, ingestion.options.filter((o: any) => o.vannaExposure != null).length);
    assert.equal(summary.liveCharmValidRows, ingestion.options.filter((o: any) => o.charmExposure != null).length);
    assert.equal(summary.liveVannaTotalEligibleRows, ingestion.options.length);
    assert.equal(summary.liveCharmTotalEligibleRows, ingestion.options.length);

    assert.ok(Math.abs((summary.liveVannaCallSignedContribution ?? 0) + (summary.liveVannaPutSignedContribution ?? 0) - (summary.liveVannaExposure ?? 0)) < 1e-9);
    assert.ok(Math.abs((summary.liveCharmCallSignedContribution ?? 0) + (summary.liveCharmPutSignedContribution ?? 0) - (summary.liveCharmExposure ?? 0)) < 1e-9);
  } finally {
    mock.restore();
  }
});
