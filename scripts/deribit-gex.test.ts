import assert from "node:assert/strict";
import test from "node:test";

import { findTopMagnets } from "./deribit-gex.js";

test("findTopMagnets keeps only positive signed GEX and sorts DESC with strike ASC tie-break", () => {
  const rows = [
    { strike: 82_000, totalGex: 11_300_000 },
    { strike: 85_000, totalGex: 22_420_000 },
    { strike: 80_000, totalGex: 82_530_000 },
    { strike: 81_000, totalGex: 22_420_000 },
    { strike: 79_000, totalGex: -5_000_000 },
  ];

  assert.deepEqual(findTopMagnets(rows as any, 3), [
    { strike: 80_000, totalGex: 82_530_000 },
    { strike: 81_000, totalGex: 22_420_000 },
    { strike: 85_000, totalGex: 22_420_000 },
  ]);
});

test("findTopMagnets excludes negative GEX rows and truncates to the requested top 3", () => {
  const rows = [
    { strike: 80_000, totalGex: 100 },
    { strike: 81_000, totalGex: 90 },
    { strike: 82_000, totalGex: 80 },
    { strike: 83_000, totalGex: 70 },
    { strike: 79_000, totalGex: -500 },
  ];

  assert.deepEqual(findTopMagnets(rows as any), [
    { strike: 80_000, totalGex: 100 },
    { strike: 81_000, totalGex: 90 },
    { strike: 82_000, totalGex: 80 },
  ]);
});
