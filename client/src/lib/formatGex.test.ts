import assert from "node:assert/strict";
import test from "node:test";
import { formatGex } from "./formatGex.ts";

test("formatGex adaptive units", () => {
  assert.equal(formatGex(0), "0");
  assert.equal(formatGex(999), "999");
  assert.equal(formatGex(1_000), "1.0K");
  assert.equal(formatGex(-170_700), "-170.7K");
  assert.equal(formatGex(999_999), "1000.0K");
  assert.equal(formatGex(1_000_000), "1.00M");
  assert.equal(formatGex(-25_400_000), "-25.40M");
  assert.equal(formatGex(1_000_000_000), "1.00B");
});

test("formatGex missing or invalid values", () => {
  assert.equal(formatGex(null), "--");
  assert.equal(formatGex(undefined), "--");
  assert.equal(formatGex(NaN), "--");
});
