import assert from "node:assert/strict";
import test from "node:test";

import { computeGravityMap, type GravityMapInput } from "./lib/gravityMapEngine";

function buildFixture(
  spotPrice: number,
  strikes: GravityMapInput["strikes"],
  extras: Partial<Omit<GravityMapInput, "spotPrice" | "strikes">> = {},
): GravityMapInput {
  return {
    spotPrice,
    gammaFlip: spotPrice,
    transitionZoneStart: spotPrice * 0.995,
    transitionZoneEnd: spotPrice * 1.005,
    gammaMagnets: [spotPrice],
    shortGammaPocketStart: spotPrice * 0.99,
    shortGammaPocketEnd: spotPrice * 1.01,
    callWall: spotPrice * 1.02,
    putWall: spotPrice * 0.98,
    dealerPivot: spotPrice,
    strikes,
    liquidityHeatZones: [
      { priceStart: spotPrice * 0.999, priceEnd: spotPrice * 1.001, side: "both", totalQuantity: 25 },
    ],
    dealerFlowDirection: "NEUTRAL",
    liquidityPressure: "BALANCED",
    gammaAccelerationZones: [],
    topMagnets: [{ strike: spotPrice, totalGex: 1000 }],
    ...extras,
  };
}

function makeStrikes(spotPrice: number, relativeDistances: number[], options?: { reverse?: boolean; outlier?: boolean }) {
  const strikes = relativeDistances.map((rel, index) => ({
    strike: Math.round(spotPrice * (1 + rel)),
    totalGex: 1000 - index * 3,
    totalOiContracts: 100 - index,
  }));

  if (options?.outlier) {
    strikes.push({
      strike: Math.round(spotPrice * 1.119),
      totalGex: 100_000,
      totalOiContracts: 10_000,
    });
  }

  if (options?.reverse) strikes.reverse();
  return strikes;
}

function zoneSnapshot(signal: ReturnType<typeof computeGravityMap>) {
  return {
    semanticType: signal.semanticType,
    status: signal.status,
    primary: signal.primaryMagnet?.price ?? null,
    primaryLevel: signal.primaryGravityLevel?.price ?? null,
    secondary: signal.secondaryMagnet?.price ?? null,
    secondaryLevel: signal.secondaryGravityLevel?.price ?? null,
    bias: signal.bias,
    summary: signal.summary,
    metadata: signal.metadata,
    repulsions: signal.repulsionZones.map((z) => z.price),
    accelerations: signal.accelerationZones.map((z) => z.price),
    topScores: signal.debug?.topScores,
  };
}

function candidateComparator(spotPrice: number) {
  return (a: { strike: number }, b: { strike: number }) => {
    const da = Math.abs(a.strike - spotPrice) / spotPrice;
    const db = Math.abs(b.strike - spotPrice) / spotPrice;
    if (da !== db) return da - db;
    return a.strike - b.strike;
  };
}

function selectEligible(spotPrice: number, strikes: GravityMapInput["strikes"]) {
  return strikes
    .filter((s) => Math.abs(s.strike - spotPrice) <= spotPrice * 0.24)
    .map((s) => ({ strike: s.strike, totalGex: s.totalGex, totalOiContracts: s.totalOiContracts }))
    .sort(candidateComparator(spotPrice))
    .slice(0, 50)
    .map((s) => s.strike);
}

test("gravity candidate selection is deterministic across input permutations", () => {
  const spot = 100_000;
  const baseDistances = [
    0.001, 0.002, 0.003, 0.004, 0.005,
    0.006, 0.007, 0.008, 0.009, 0.010,
    0.011, 0.012, 0.013, 0.014, 0.015,
    0.016, 0.017, 0.018, 0.019, 0.020,
    0.021, 0.022, 0.023, 0.024, 0.025,
    0.026, 0.027, 0.028, 0.029, 0.030,
    0.031, 0.032, 0.033, 0.034, 0.035,
    0.036, 0.037, 0.038, 0.039, 0.040,
    0.041, 0.042, 0.043, 0.044, 0.045,
    0.046, 0.047, 0.048, 0.049, 0.050,
    0.051, 0.052, 0.053, 0.054, 0.055,
  ];

  const ascending = makeStrikes(spot, baseDistances, { outlier: true });
  const descending = [...ascending].reverse();
  const rotated = [...ascending.slice(17), ...ascending.slice(0, 17)];
  const evensOdds = [...ascending.filter((_, index) => index % 2 === 0), ...ascending.filter((_, index) => index % 2 === 1)];

  const inputA = buildFixture(spot, ascending);
  const inputB = buildFixture(spot, descending);
  const inputC = buildFixture(spot, rotated);
  const inputD = buildFixture(spot, evensOdds);

  const outA = computeGravityMap(inputA);
  const outB = computeGravityMap(inputB);
  const outC = computeGravityMap(inputC);
  const outD = computeGravityMap(inputD);

  const selectedA = selectEligible(spot, ascending);
  const selectedB = selectEligible(spot, descending);
  const selectedC = selectEligible(spot, rotated);
  const selectedD = selectEligible(spot, evensOdds);

  assert.equal(selectedA.length, 50);
  assert.deepEqual(selectedA, selectedB);
  assert.deepEqual(selectedA, selectedC);
  assert.deepEqual(selectedA, selectedD);
  assert.deepEqual(zoneSnapshot(outA), zoneSnapshot(outB));
  assert.deepEqual(zoneSnapshot(outA), zoneSnapshot(outC));
  assert.deepEqual(zoneSnapshot(outA), zoneSnapshot(outD));
});

test("gravity candidate selection breaks distance ties by ascending strike", () => {
  const spot = 100_000;
  const strikes = [
    { strike: 101_000, totalGex: 1200, totalOiContracts: 120 },
    { strike: 99_000, totalGex: 1200, totalOiContracts: 120 },
    { strike: 102_000, totalGex: 1100, totalOiContracts: 110 },
    { strike: 98_000, totalGex: 1100, totalOiContracts: 110 },
  ].reverse();

  const signal = computeGravityMap(buildFixture(spot, strikes));
  const selected = selectEligible(spot, strikes);

  assert.equal(signal.status, "ACTIVE");
  assert.equal(signal.primaryMagnet?.price, 99_000);
  assert.deepEqual(selected.slice(0, 2), [99_000, 101_000]);
});

test("gravity candidate selection freezes <=50 eligible rows and excludes the 51st nearest outlier", () => {
  const spot = 100_000;
  const strikes = makeStrikes(spot, Array.from({ length: 50 }, (_, i) => 0.001 + i * 0.002), { outlier: true });
  const ascending = [...strikes].sort((a, b) => a.strike - b.strike);
  const descending = [...ascending].reverse();

  const a = computeGravityMap(buildFixture(spot, ascending));
  const b = computeGravityMap(buildFixture(spot, descending));

  assert.deepEqual(zoneSnapshot(a), zoneSnapshot(b));
  assert.equal(selectEligible(spot, ascending).length, 50);
  assert.equal(selectEligible(spot, descending).length, 50);
  assert.ok(!selectEligible(spot, ascending).includes(Math.round(spot * 1.119)));
});

test("gravity candidate selection stays inactive on zero/null inputs", () => {
  assert.equal(computeGravityMap({
    spotPrice: 100_000,
    gammaFlip: null,
    transitionZoneStart: null,
    transitionZoneEnd: null,
    gammaMagnets: [],
    shortGammaPocketStart: null,
    shortGammaPocketEnd: null,
    callWall: null,
    putWall: null,
    dealerPivot: null,
    strikes: [],
    liquidityHeatZones: [],
    dealerFlowDirection: "NEUTRAL",
    liquidityPressure: "BALANCED",
    gammaAccelerationZones: [],
    topMagnets: [],
  }).status, "INACTIVE");
});

test("gravity semantic contract exposes truthful relative structural score metadata", () => {
  const signal = computeGravityMap(buildFixture(100_000, [
    { strike: 100_000, totalGex: 1_000, totalOiContracts: 100 },
    { strike: 101_000, totalGex: 900, totalOiContracts: 90 },
  ], { gammaFlip: null, gammaMagnets: [], transitionZoneStart: null, transitionZoneEnd: null, shortGammaPocketStart: null, shortGammaPocketEnd: null, callWall: null, putWall: null, topMagnets: [], liquidityHeatZones: [{ priceStart: 200_000, priceEnd: 201_000, side: "far", totalQuantity: 1 }] }));

  assert.equal(signal.semanticType, "RELATIVE_STRUCTURAL_SCORE");
  assert.equal(signal.metadata.calibratedProbability, false);
  assert.equal(signal.metadata.predictionHorizon, null);
  assert.equal(signal.metadata.historicallyCalibrated, false);
  assert.equal((signal.primaryGravityLevel?.gravityScore ?? 0) >= 0, true);
  assert.equal((signal.primaryGravityLevel?.gravityScore ?? 0) <= 100, true);
  assert.equal('probability' in (signal as any), false);
});

test("gravity semantic contract preserves legacy magnet aliases while exposing gravity-level aliases", () => {
  const signal = computeGravityMap(buildFixture(100_000, [
    { strike: 99_000, totalGex: 10_000, totalOiContracts: 100 },
    { strike: 100_000, totalGex: 9_000, totalOiContracts: 95 },
    { strike: 101_000, totalGex: 8_000, totalOiContracts: 90 },
  ], { gammaFlip: null, gammaMagnets: [], transitionZoneStart: null, transitionZoneEnd: null, shortGammaPocketStart: null, shortGammaPocketEnd: null, callWall: null, putWall: null, topMagnets: [], liquidityHeatZones: [{ priceStart: 200_000, priceEnd: 201_000, side: "far", totalQuantity: 1 }] }));

  assert.strictEqual(signal.primaryGravityLevel, signal.primaryMagnet);
  assert.strictEqual(signal.secondaryGravityLevel, signal.secondaryMagnet);
});

test("gravity semantic contract allows a NEUTRAL primary gravity level and keeps MAGNET metadata separate", () => {
  const signal = computeGravityMap(buildFixture(100_000, [
    { strike: 100_000, totalGex: 10_000, totalOiContracts: 120 },
    { strike: 100_500, totalGex: 5_000, totalOiContracts: 60 },
    { strike: 101_000, totalGex: 4_000, totalOiContracts: 40 },
  ], { gammaFlip: null, gammaMagnets: [], transitionZoneStart: null, transitionZoneEnd: null, shortGammaPocketStart: null, shortGammaPocketEnd: null, callWall: null, putWall: null, topMagnets: [], liquidityHeatZones: [{ priceStart: 200_000, priceEnd: 201_000, side: "far", totalQuantity: 1 }] }));

  assert.equal(signal.primaryGravityLevel?.type, "NEUTRAL");
  assert.strictEqual(signal.primaryGravityLevel, signal.primaryMagnet);
});

test("gravity semantic contract keeps MAGNET classification separate from ranking", () => {
  const signal = computeGravityMap(buildFixture(100_000, [
    { strike: 100_000, totalGex: 20_000, totalOiContracts: 200 },
    { strike: 100_300, totalGex: 100, totalOiContracts: 10 },
    { strike: 99_000, totalGex: 1_000, totalOiContracts: 10 },
  ], {
    gammaFlip: null,
    gammaMagnets: [100_300],
    transitionZoneStart: null,
    transitionZoneEnd: null,
    shortGammaPocketStart: null,
    shortGammaPocketEnd: null,
    callWall: null,
    putWall: null,
    topMagnets: [{ strike: 101_000, totalGex: 6_000 }],
    liquidityHeatZones: [{ priceStart: 200_000, priceEnd: 201_000, side: "far", totalQuantity: 1 }],
  }));

  assert.equal(signal.primaryGravityLevel?.price, 100_000);
  assert.equal(signal.primaryGravityLevel?.type, "NEUTRAL");
  assert.equal(signal.secondaryGravityLevel?.price, 100_300);
  assert.equal(signal.secondaryGravityLevel?.type, "MAGNET");
});
