/**
 * Phase B1 — live submit freeze (no adapter HTTP; early return only).
 * Run: npm run test:bingx-freeze-submit
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  assertBingxWriteNotFrozen,
  BINGX_READ_ONLY_FREEZE_CODE,
  isBingxReadOnlyFreezeActive,
  isBingxWriteActionBlocked,
} from "./bingxReadOnlyFreeze";
import { checkLiveTradingActionAllowed } from "../../execution/liveTradingGuard";

const ENV_BACKUP = process.env.BINGX_READ_ONLY_FREEZE;

afterEach(() => {
  if (ENV_BACKUP === undefined) delete process.env.BINGX_READ_ONLY_FREEZE;
  else process.env.BINGX_READ_ONLY_FREEZE = ENV_BACKUP;
});

test("freeze active when env unset", () => {
  delete process.env.BINGX_READ_ONLY_FREEZE;
  assert.equal(isBingxReadOnlyFreezeActive(), true);
});

test("freeze active when env true", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  assert.equal(isBingxReadOnlyFreezeActive(), true);
});

test("freeze active when env 1", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "1";
  assert.equal(isBingxReadOnlyFreezeActive(), true);
});

test("assertBingxWriteNotFrozen returns stable code under live flags", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  process.env.BINGX_ENABLE_LIVE_TRADING = "true";
  process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
  const r = assertBingxWriteNotFrozen();
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, BINGX_READ_ONLY_FREEZE_CODE);
    assert.ok(r.blockers.includes(BINGX_READ_ONLY_FREEZE_CODE));
  }
});

test("cancel, close, leverage, margin mode blocked under freeze", () => {
  process.env.BINGX_READ_ONLY_FREEZE = "true";
  for (const action of ["cancel_order", "close_position"] as const) {
    const r = checkLiveTradingActionAllowed(action);
    assert.equal(r.allowed, false);
    if (!r.allowed) {
      assert.ok(r.blockers.includes(BINGX_READ_ONLY_FREEZE_CODE));
    }
  }
  assert.equal(isBingxWriteActionBlocked("set_leverage"), true);
  assert.equal(isBingxWriteActionBlocked("set_margin_mode"), true);
});
