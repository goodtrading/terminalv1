import assert from "node:assert/strict";
import test from "node:test";

import { getDeribitOptionsSnapshot } from "./deribitOptionsSnapshot.js";

test("parsed topMagnets are normalized to positive signed GEX DESC with strike ASC tie-break", () => {
  const snapshot = getDeribitOptionsSnapshot();
  assert.equal(snapshot.topMagnets.length <= 3, true);
  assert.equal(snapshot.topMagnets.every((m) => m.totalGex > 0), true);

  for (let i = 1; i < snapshot.topMagnets.length; i++) {
    const prev = snapshot.topMagnets[i - 1];
    const curr = snapshot.topMagnets[i];
    assert.ok(
      prev.totalGex > curr.totalGex ||
        (prev.totalGex === curr.totalGex && prev.strike <= curr.strike),
      `expected descending GEX order, got ${prev.strike}:${prev.totalGex} before ${curr.strike}:${curr.totalGex}`,
    );
  }
});
