/**
 * Phase B1 — read-only freeze guards (no BingX HTTP).
 * Run: npm run test:bingx-freeze
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertBingxWriteNotFrozen,
  BINGX_READ_ONLY_FREEZE_CODE,
  isBingxReadOnlyFreezeActive,
  isBingxWriteActionBlocked,
} from "./bingxReadOnlyFreeze";
import { checkLiveTradingActionAllowed } from "../../execution/liveTradingGuard";

const ENV_BACKUP = process.env.BINGX_READ_ONLY_FREEZE;

test("freeze default active when env unset", () => {
  delete process.env.BINGX_READ_ONLY_FREEZE;
  assert.equal(isBingxReadOnlyFreezeActive(), true);
});

test("freeze active when env true", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  assert.equal(isBingxReadOnlyFreezeActive(), true);
});

test("freeze off only when env explicitly false", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "false";
  assert.equal(isBingxReadOnlyFreezeActive(), false);
  process.env.BINGX_READ_ONLY_FREEZE = "true";
});

test("assertBingxWriteNotFrozen blocks with stable code", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  const r = assertBingxWriteNotFrozen();
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, BINGX_READ_ONLY_FREEZE_CODE);
    assert.ok(r.blockers.includes(BINGX_READ_ONLY_FREEZE_CODE));
  }
});

test("write actions blocked under freeze", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  assert.equal(isBingxWriteActionBlocked("submit_order"), true);
  assert.equal(isBingxWriteActionBlocked("cancel_order"), true);
  assert.equal(isBingxWriteActionBlocked("close_position"), true);
  assert.equal(isBingxWriteActionBlocked("set_leverage"), true);
});

test("live guard freeze beats live env flags", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  process.env.BINGX_ENABLE_LIVE_TRADING = "true";
  process.env.BINGX_ENABLE_API_TRADING = "true";
  process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
  process.env.LIVE_TRADING_KILL_SWITCH = "false";

  const r = checkLiveTradingActionAllowed("submit_order");
  assert.equal(r.allowed, false);
  assert.ok(r.blockers.includes(BINGX_READ_ONLY_FREEZE_CODE));
});

if (ENV_BACKUP === undefined) delete process.env.BINGX_READ_ONLY_FREEZE;
else process.env.BINGX_READ_ONLY_FREEZE = ENV_BACKUP;
