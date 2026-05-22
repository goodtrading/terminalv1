/**
 * Phase 5C blocker checks — no BingX HTTP calls.
 * Run: npm run test:live-submit-blockers
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLiveOrderSubmitBody } from "./liveOrderSubmitParse";
import {
  validateLiveSubmitConfirmation,
  validateLiveSubmitEnvFlags,
  validateLiveSubmitPreviewRisk,
  validateLiveSubmitReadiness,
  validateLiveSubmitShape,
} from "./liveOrderSubmitGuards";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";
import type { LiveOrderSubmitRequest } from "./liveOrderSubmitTypes";

const ENV_BACKUP: Record<string, string | undefined> = {};

function saveEnv(keys: string[]): void {
  for (const k of keys) {
    ENV_BACKUP[k] = process.env[k];
  }
}

function restoreEnv(keys: string[]): void {
  for (const k of keys) {
    if (ENV_BACKUP[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_BACKUP[k];
  }
}

function setLiveOffEnv(): void {
  process.env.BINGX_ENABLE_LIVE_TRADING = "false";
  process.env.BINGX_ENABLE_API_TRADING = "false";
  process.env.BINGX_ENABLE_ORDER_SUBMIT = "false";
  process.env.BINGX_ALLOW_MARKET_ORDERS = "false";
  process.env.LIVE_TRADING_KILL_SWITCH = "false";
}

function setLiveOnEnv(): void {
  process.env.BINGX_ENABLE_LIVE_TRADING = "true";
  process.env.BINGX_ENABLE_API_TRADING = "true";
  process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
  process.env.BINGX_ALLOW_MARKET_ORDERS = "false";
  process.env.LIVE_TRADING_KILL_SWITCH = "false";
}

const baseRequest: LiveOrderSubmitRequest = {
  exchange: "bingx",
  symbol: "BTC-USDT",
  side: "buy",
  type: "limit",
  notionalUsdt: 2,
  limitPrice: 50000,
  stopLossPrice: 49000,
  confirmationText: LIVE_LIMIT_CONFIRMATION_TEXT,
};

const ENV_KEYS = [
  "BINGX_ENABLE_LIVE_TRADING",
  "BINGX_ENABLE_API_TRADING",
  "BINGX_ENABLE_ORDER_SUBMIT",
  "BINGX_ALLOW_MARKET_ORDERS",
  "LIVE_TRADING_KILL_SWITCH",
];

saveEnv(ENV_KEYS);

test("A — live flags off blocks env validation", () => {
  setLiveOffEnv();
  const blockers = validateLiveSubmitEnvFlags();
  assert.ok(blockers.some((b) => b.includes("BINGX_ENABLE_LIVE_TRADING")));
  restoreEnv(ENV_KEYS);
});

test("B — missing confirmationText rejected at parse", () => {
  const parsed = parseLiveOrderSubmitBody({
    ...baseRequest,
    confirmationText: "",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /confirmationText/i);
  }
});

test("C — incorrect confirmationText blocked", () => {
  const blockers = validateLiveSubmitConfirmation({
    ...baseRequest,
    confirmationText: "CONFIRM LIVE",
  });
  assert.ok(blockers.length > 0);
});

test("D — market type rejected at parse", () => {
  const parsed = parseLiveOrderSubmitBody({
    ...baseRequest,
    type: "market",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /market/i);
  }
});

test("E — missing stop loss blocked", () => {
  const blockers = validateLiveSubmitShape({
    ...baseRequest,
    stopLossPrice: 0,
  });
  assert.ok(blockers.some((b) => /stop loss/i.test(b)));
});

test("F — notional over max blocked in preview risk", () => {
  const blockers = validateLiveSubmitPreviewRisk({
    blocked: true,
    validated: false,
    blockers: ["Max order size exceeded (5 USDT > 2 USDT)"],
    risk: { riskGuardPassed: false },
  });
  assert.ok(blockers.some((b) => /Max order size/i.test(b)));
});

test("G — account risk over max blocked in preview risk", () => {
  const blockers = validateLiveSubmitPreviewRisk({
    blocked: true,
    validated: false,
    blockers: ["Max account risk exceeded (1% > 0.5%)"],
    risk: { riskGuardPassed: false },
  });
  assert.ok(blockers.some((b) => /account risk/i.test(b)));
});

test("H — kill switch blocks env validation", () => {
  setLiveOnEnv();
  process.env.LIVE_TRADING_KILL_SWITCH = "true";
  const blockers = validateLiveSubmitEnvFlags();
  assert.ok(blockers.some((b) => /kill switch/i.test(b)));
  process.env.LIVE_TRADING_KILL_SWITCH = "false";
  restoreEnv(ENV_KEYS);
});

test("I — readiness not ready_for_live blocks", () => {
  const blockers = validateLiveSubmitReadiness({
    status: "ready_for_dry_run",
    readyForLive: false,
    blockers: ["No BingX connection"],
  });
  assert.ok(blockers.some((b) => /not ready_for_live/i.test(b)));
});

test("live env on passes env guard when kill switch off", () => {
  setLiveOnEnv();
  const blockers = validateLiveSubmitEnvFlags();
  assert.equal(blockers.length, 0);
  restoreEnv(ENV_KEYS);
});

restoreEnv(ENV_KEYS);
