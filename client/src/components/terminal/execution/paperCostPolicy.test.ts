import assert from "node:assert/strict";
import test from "node:test";
import { PAPER_COST_POLICY } from "@shared/trading/paperCostPolicy";
import { DEFAULT_EXIT_ESTIMATE } from "./canonicalNetPnl";
import { resolvePaperChartFeeBps } from "../paperChart/paperTradeOverlayHelpers";
import { DEFAULT_PAPER_SETTINGS } from "../../../../../server/services/paperTrading/paperTypes";
test("one DEFAULT_ZERO drives Paper settings, risk and NET exit costs", () => {
  assert.deepEqual(PAPER_COST_POLICY, { id: "DEFAULT_ZERO", makerFeeBps: 0, takerFeeBps: 0, slippageBps: 0 });
  assert.deepEqual(DEFAULT_EXIT_ESTIMATE, { feeBps: 0, slippageBps: 0 });
  assert.deepEqual(resolvePaperChartFeeBps(), { makerFeeBps: 0, takerFeeBps: 0, slippageBps: 0 });
  for (const key of ["makerFeeBps", "takerFeeBps", "slippageBps"] as const) assert.equal(DEFAULT_PAPER_SETTINGS[key], 0);
});
