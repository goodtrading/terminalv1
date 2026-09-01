import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MemStorage, type OptionsSummaryUpdate } from "./storage";

function makeStorage(): MemStorage {
  return Object.create(MemStorage.prototype) as MemStorage;
}

function setReady(storage: MemStorage) {
  const s = storage as any;
  s.marketState = { id: 1, gammaRegime: "SHORT GAMMA", totalGex: -1, gammaFlip: null, distanceToFlip: null, transitionZoneStart: null, transitionZoneEnd: null, gammaAcceleration: "NEUTRAL", timestamp: new Date() };
  s.optionsPositioning = { id: 1, callWall: 0, putWall: 0, oiConcentration: 0, dealerPivot: 65000, timestamp: new Date() };
  s.keyLevels = { id: 1, gammaMagnets: [], shortGammaPocketStart: null, shortGammaPocketEnd: null, deepRiskPocketStart: null, deepRiskPocketEnd: null, timestamp: new Date() };
  s.dealerExposure = { id: 1, vannaExposure: 0, vannaBias: "NEUTRAL", charmExposure: 0, charmBias: "NEUTRAL", gammaPressure: "+0.00", gammaConcentration: 0, timestamp: new Date() };
  return storage;
}

test("P0.4 bootstrap leaves dealer flow unavailable when analytics are missing", () => {
  const storage = makeStorage();
  const summary: OptionsSummaryUpdate = { totalGex: 123, gammaMagnets: [], shortGammaZones: [{ startStrike: 64200, endStrike: 65850 }] };

  (storage as any).bootstrapShellFromDeribitSummary(summary, 65000);

  assert.equal((storage as any).dealerHedgingFlow.hedgeFlowBias, null);
  assert.equal((storage as any).dealerHedgingFlow.hedgeFlowIntensity, null);
  assert.equal((storage as any).dealerHedgingFlow.accelerationRisk, null);
  assert.equal((storage as any).dealerHedgingFlow.flowTriggerUp, null);
  assert.equal((storage as any).dealerHedgingFlow.flowTriggerDown, null);
});

test("P0.4 preserves already-populated dealer analytics when bootstrap is bypassed", () => {
  const storage = setReady(makeStorage());
  const realDealerFlow = {
    id: 1,
    hedgeFlowBias: "BUYING",
    hedgeFlowIntensity: "MEDIUM",
    accelerationRisk: "HIGH",
    flowTriggerUp: 70123,
    flowTriggerDown: 68987,
    timestamp: new Date(),
  };
  (storage as any).dealerHedgingFlow = realDealerFlow;

  storage.updateFromDeribitSummary({ totalGex: 99, gammaMagnets: [] }, 65000);

  assert.deepEqual((storage as any).dealerHedgingFlow, realDealerFlow);
});
