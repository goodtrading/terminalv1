import assert from "node:assert/strict";
import test from "node:test";

import { buildDealerHedgeSensitivity } from "./dealer-hedge-sensitivity";
import { buildDealerHedgeStressScenarios } from "./dealer-hedge-stress";
import { buildDealerHedgeState } from "./dealer-hedge-state";

const sensitivity = buildDealerHedgeSensitivity({
  source: "LIVE_DERIBIT",
  totalGex: 1234,
  liveVannaExposure: 28,
  liveVannaGrossAbsExposure: 28,
  liveVannaDirectionalRatio: 1,
  liveVannaValidRows: 7,
  liveVannaTotalEligibleRows: 7,
  liveCharmExposure: 9,
  liveCharmGrossAbsExposure: 9,
  liveCharmDirectionalRatio: 1,
  liveCharmValidRows: 5,
  liveCharmTotalEligibleRows: 5,
});

const stress = buildDealerHedgeStressScenarios({
  spotPrice: 100_000,
  sensitivity,
});

test("P2 dealer hedge state keeps quantitative layers separate from structural pressure", () => {
  const state = buildDealerHedgeState({
    sensitivity,
    standardizedStress: stress,
    structuralPressure: {
      score: -0.91,
      bias: "SELLING",
      intensity: "HIGH",
      accelerationRisk: "HIGH",
      triggerZone: "Gamma cliff below spot at 97k",
      stressScore: 0.44,
    },
  });

  assert.equal(state.source, sensitivity.source);
  assert.strictEqual(state.sensitivity, sensitivity);
  assert.strictEqual(state.standardizedStress, stress);
  assert.deepEqual(state.metadata, {
    structuralPositioningProxy: true,
    observedDealerFlow: false,
    expectedFlowForecast: false,
  });
  assert.equal(state.structuralPressure?.score, -0.91);
  assert.equal(state.structuralPressure?.bias, "SELLING");
  assert.equal(state.structuralPressure?.intensity, "HIGH");
  assert.equal(state.structuralPressure?.accelerationRisk, "HIGH");
  assert.equal(state.structuralPressure?.triggerZone, "Gamma cliff below spot at 97k");
  assert.equal(state.structuralPressure?.stressScore, 0.44);
});

test("P2 dealer hedge state allows structural SELLING with scenario BUY on spot-down stress", () => {
  const state = buildDealerHedgeState({
    sensitivity,
    standardizedStress: stress,
    structuralPressure: {
      score: 0.12,
      bias: "SELLING",
      intensity: "MEDIUM",
      accelerationRisk: "LOW",
      triggerZone: "Around dealer pivot",
      stressScore: 0.18,
    },
  });

  const spotDown = state.standardizedStress.find((scenario) => scenario.scenarioType === "SPOT_DOWN_1PCT");
  assert.ok(spotDown);
  assert.equal(state.structuralPressure?.bias, "SELLING");
  assert.equal(spotDown?.hedgeAction, "BUY");
});

test("P2 dealer hedge state allows structural NEUTRAL with scenario BUY on vol-up stress", () => {
  const volBuySensitivity = buildDealerHedgeSensitivity({
    source: "LIVE_DERIBIT",
    totalGex: 1234,
    liveVannaExposure: -50_000_000,
    liveVannaGrossAbsExposure: 50_000_000,
    liveVannaDirectionalRatio: -1,
    liveVannaValidRows: 7,
    liveVannaTotalEligibleRows: 7,
    liveCharmExposure: -2_000_000,
    liveCharmGrossAbsExposure: 2_000_000,
    liveCharmDirectionalRatio: -1,
    liveCharmValidRows: 5,
    liveCharmTotalEligibleRows: 5,
  });
  const volBuyStress = buildDealerHedgeStressScenarios({
    spotPrice: 100_000,
    sensitivity: volBuySensitivity,
  });
  const state = buildDealerHedgeState({
    sensitivity: volBuySensitivity,
    standardizedStress: volBuyStress,
    structuralPressure: {
      score: 0,
      bias: "NEUTRAL",
      intensity: "LOW",
      accelerationRisk: "LOW",
      triggerZone: "None",
      stressScore: 0,
    },
  });

  const volUp = state.standardizedStress.find((scenario) => scenario.scenarioType === "VOL_UP_1PT");
  assert.ok(volUp);
  assert.equal(state.structuralPressure?.bias, "NEUTRAL");
  assert.equal(volUp?.hedgeAction, "BUY");
});
