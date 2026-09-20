import assert from "node:assert/strict";
import test from "node:test";
import { formatKeyLevelRange } from "../../../lib/formatKeyLevelRange.ts";

test("key-level range shows unavailable state while loading", () => {
  assert.equal(formatKeyLevelRange(undefined, undefined), "—");
});

test("key-level range preserves unavailable null metrics", () => {
  assert.equal(formatKeyLevelRange(null, null), "—");
  assert.equal(formatKeyLevelRange(null, 64_700), "—");
  assert.equal(formatKeyLevelRange(63_200, null), "—");
});

test("key-level range preserves a legitimate zero", () => {
  assert.equal(formatKeyLevelRange(0, 0), "0 – 0");
});

test("key-level range formats positive values", () => {
  assert.equal(formatKeyLevelRange(63_200, 64_700), `${(63_200).toLocaleString()} – ${(64_700).toLocaleString()}`);
});

test("key-level range rejects non-numeric API values as unavailable", () => {
  assert.equal(formatKeyLevelRange("63200", 64_700), "—");
  assert.equal(formatKeyLevelRange(NaN, 64_700), "—");
});
