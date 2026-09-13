import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POSITION_PNL_DISPLAY,
  formatCanonicalNetPnlUsdt,
  formatNetPositionPct,
  togglePositionPnlDisplay,
} from "./positionPnlDisplay";

test("position PnL defaults to percent and toggles to dollars and back", () => {
  assert.equal(DEFAULT_POSITION_PNL_DISPLAY, "percent");
  assert.equal(togglePositionPnlDisplay("percent"), "dollars");
  assert.equal(togglePositionPnlDisplay("dollars"), "percent");
});

test("position PnL formatting preserves canonical dollar and percentage values", () => {
  assert.equal(formatNetPositionPct(0.1), "+0.10%");
  assert.equal(formatNetPositionPct(-0.05), "-0.05%");
  assert.equal(formatNetPositionPct(0), "0.00%");
  assert.equal(formatCanonicalNetPnlUsdt(0.14), "+$0.14");
  assert.equal(formatCanonicalNetPnlUsdt(-0.06), "-$0.06");
  assert.equal(formatCanonicalNetPnlUsdt(0), "$0.00");
  assert.equal(formatCanonicalNetPnlUsdt(null), "—");
});
test("small nonzero position return retains three decimal precision", () => {
  assert.equal(formatNetPositionPct(0.012), "+0.012%");
});
