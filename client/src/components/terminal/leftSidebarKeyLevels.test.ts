import { strict as assert } from "node:assert";
import test from "node:test";
import { formatKeyLevelRange } from "./LeftSidebar";

test("formats a complete short gamma range", () => {
  assert.equal(formatKeyLevelRange(100, 200), "100 – 200");
});

test("returns placeholder when short gamma start is null", () => {
  assert.equal(formatKeyLevelRange(null, 200), "--");
});

test("returns placeholder when short gamma end is null", () => {
  assert.equal(formatKeyLevelRange(100, null), "--");
});

test("returns placeholder when both range endpoints are null", () => {
  assert.equal(formatKeyLevelRange(null, null), "--");
});

test("preserves a valid zero endpoint", () => {
  assert.equal(formatKeyLevelRange(0, 200), "0 – 200");
  assert.equal(formatKeyLevelRange(100, 0), "100 – 0");
});

test("returns placeholder for undefined or missing levels", () => {
  assert.equal(formatKeyLevelRange(undefined, 200), "--");
  assert.equal(formatKeyLevelRange(100, undefined), "--");
});
