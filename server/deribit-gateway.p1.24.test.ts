// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DeribitOptionsGateway,
  PINNING_PROXIMITY_RATIO,
  relativeDistanceFromSpot,
} from "./deribit-gateway";

const IV = 50;
const EXPIRY = "27SEP26";

function makeOption(spot: number, ratio: number) {
  return {
    strike: spot * ratio,
    expiry: EXPIRY,
    optionType: "call",
    openInterest: 100,
    ivMark: IV,
    ivBid: undefined,
    ivAsk: undefined,
  };
}

async function summaryFor(spot: number, ratio: number) {
  return DeribitOptionsGateway.getSummary([makeOption(spot, ratio)] as any, spot, "LIVE_DERIBIT");
}

test("P1.24 relative pinning distance is dimensionless and boundary-safe", () => {
  assert.equal(PINNING_PROXIMITY_RATIO, 0.0125);

  assert.equal(relativeDistanceFromSpot(81_000, 80_000), PINNING_PROXIMITY_RATIO);
  assert.ok(relativeDistanceFromSpot(80_999, 80_000) < PINNING_PROXIMITY_RATIO);
  assert.ok(relativeDistanceFromSpot(81_001, 80_000) > PINNING_PROXIMITY_RATIO);
  assert.equal(relativeDistanceFromSpot(80_000, 80_000), 0);

  assert.equal(relativeDistanceFromSpot(80_000, 0), Number.POSITIVE_INFINITY);
  assert.equal(relativeDistanceFromSpot(80_000, -1), Number.POSITIVE_INFINITY);
  assert.equal(relativeDistanceFromSpot(80_000, Number.NaN), Number.POSITIVE_INFINITY);
  assert.equal(relativeDistanceFromSpot(80_000, Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
});

test("P1.24 equivalent proportional structures keep the same pinning decision across 40k, 80k, 120k", async () => {
  const scales = [40_000, 80_000, 120_000];

  for (const ratio of [1.01, 1.02]) {
    const summaries = [] as any[];
    for (const spot of scales) {
      summaries.push(await summaryFor(spot, ratio));
    }

    const first = summaries[0];
    for (const summary of summaries.slice(1)) {
      assert.ok(Math.abs(summary.pinningStrength - first.pinningStrength) < 1e-12);
      assert.ok(Math.abs(summary.totalGex - first.totalGex) < 1e-12);
      assert.equal(summary.gammaFlip, first.gammaFlip);
      assert.equal(summary.gammaRegime, first.gammaRegime);
      assert.deepEqual(summary.shortGammaZones, first.shortGammaZones);
    }

    if (ratio === 1.01) {
      assert.equal(first.pinningStrength, 1);
      assert.equal(relativeDistanceFromSpot(40_000 * ratio, 40_000) <= PINNING_PROXIMITY_RATIO, true);
      assert.equal(relativeDistanceFromSpot(80_000 * ratio, 80_000) <= PINNING_PROXIMITY_RATIO, true);
      assert.equal(relativeDistanceFromSpot(120_000 * ratio, 120_000) <= PINNING_PROXIMITY_RATIO, true);
    } else {
      assert.equal(first.pinningStrength, 0.3);
      assert.equal(relativeDistanceFromSpot(40_000 * ratio, 40_000) <= PINNING_PROXIMITY_RATIO, false);
      assert.equal(relativeDistanceFromSpot(80_000 * ratio, 80_000) <= PINNING_PROXIMITY_RATIO, false);
      assert.equal(relativeDistanceFromSpot(120_000 * ratio, 120_000) <= PINNING_PROXIMITY_RATIO, false);
    }
  }
});

test("P1.24 frozen snapshot remains non-pinning under the relative threshold", () => {
  const spot = 73_038.53;
  const magnet = 72_000;
  const callWall = 80_000;
  const putWall = 75_000;

  const magnetDistance = relativeDistanceFromSpot(magnet, spot);
  const callWallDistance = relativeDistanceFromSpot(callWall, spot);
  const putWallDistance = relativeDistanceFromSpot(putWall, spot);

  assert.ok(Math.abs(magnetDistance - (1_038.53 / 73_038.53)) < 1e-15);
  assert.ok(magnetDistance > PINNING_PROXIMITY_RATIO);
  assert.ok(callWallDistance > PINNING_PROXIMITY_RATIO);
  assert.ok(putWallDistance > PINNING_PROXIMITY_RATIO);
});
