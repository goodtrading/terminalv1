import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateLiveStructuralExposure,
} from "./deribit-gateway";
import { buildDealerHedgeSensitivity } from "./dealer-hedge-sensitivity";

const emptyLiveRows = [
  { optionType: "call" as const, vannaExposure: null, charmExposure: null },
  { optionType: "put" as const, vannaExposure: null, charmExposure: null },
];

test("P2.2 dealer hedge sensitivity contract preserves gamma units and source semantics", () => {
  const positive = buildDealerHedgeSensitivity({ source: "LIVE_DERIBIT", totalGex: 100_000 });
  const negative = buildDealerHedgeSensitivity({ source: "LIVE_DERIBIT", totalGex: -100_000 });
  const noData = buildDealerHedgeSensitivity({ totalGex: null });

  assert.equal(positive.gammaUsdPerDollar, 100_000);
  assert.equal(negative.gammaUsdPerDollar, -100_000);
  assert.equal(positive.source, "LIVE_DERIBIT");
  assert.equal(negative.source, "LIVE_DERIBIT");
  assert.equal(noData.gammaUsdPerDollar, null);
  assert.equal(noData.source, "NO_DATA");
});

test("P2.2 dealer hedge sensitivity structural aggregation keeps net gross ratio semantics", () => {
  const vanna = aggregateLiveStructuralExposure(
    [
      { optionType: "call", vannaExposure: 80, charmExposure: 0 },
      { optionType: "put", vannaExposure: -30, charmExposure: 0 },
    ],
    "vannaExposure",
  );

  const charm = aggregateLiveStructuralExposure(
    [
      { optionType: "call", vannaExposure: 0, charmExposure: -25 },
      { optionType: "put", vannaExposure: 0, charmExposure: -50 },
    ],
    "charmExposure",
  );

  assert.equal(vanna.signedNet, 50);
  assert.equal(vanna.grossAbs, 110);
  assert.equal(vanna.directionalRatio, 50 / 110);
  assert.equal(charm.signedNet, -75);
  assert.equal(charm.grossAbs, 75);
  assert.equal(charm.directionalRatio, -1);
});

test("P2.2 dealer hedge sensitivity distinguishes unavailable from valid zero and scales linearly", () => {
  const unavailable = aggregateLiveStructuralExposure(emptyLiveRows, "vannaExposure");
  const zero = aggregateLiveStructuralExposure(
    [
      { optionType: "call", vannaExposure: 50, charmExposure: 0 },
      { optionType: "put", vannaExposure: -50, charmExposure: 0 },
    ],
    "vannaExposure",
  );
  const scaled = aggregateLiveStructuralExposure(
    [
      { optionType: "call", vannaExposure: 100, charmExposure: 0 },
      { optionType: "put", vannaExposure: -100, charmExposure: 0 },
    ],
    "vannaExposure",
  );

  assert.equal(unavailable.signedNet, null);
  assert.equal(unavailable.grossAbs, null);
  assert.equal(unavailable.directionalRatio, null);
  assert.equal(unavailable.validRows, 0);
  assert.equal(unavailable.totalEligibleRows, 2);

  assert.equal(zero.signedNet, 0);
  assert.equal(zero.grossAbs, 100);
  assert.equal(zero.directionalRatio, 0);

  assert.equal(scaled.signedNet, zero.signedNet == null ? null : zero.signedNet * 2);
  assert.equal(scaled.grossAbs, zero.grossAbs == null ? null : zero.grossAbs * 2);
  assert.equal(scaled.directionalRatio, zero.directionalRatio);
});
