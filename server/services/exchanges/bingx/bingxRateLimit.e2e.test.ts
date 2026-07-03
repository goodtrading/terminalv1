/**
 * B1.2 — rate limit scopes end-to-end (middleware chain, no BingX HTTP).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { bingxRateLimit, resetBingxRateLimitsForTests } from "../../../middleware/bingxRateLimit";
import { assertBingxWriteNotFrozen } from "./bingxReadOnlyFreeze";
import { checkLiveTradingActionAllowed } from "../../execution/liveTradingGuard";

afterEach(() => {
  resetBingxRateLimitsForTests();
  process.env.BINGX_READ_ONLY_FREEZE = "true";
});

function mockReq(userId: number): Request {
  return {
    saasUser: { id: userId, email: `u${userId}@test`, role: "member" },
    query: { userId: String(userId + 9999) },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
}

function mockRes(): Response & {
  statusCode: number;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    body: undefined as Record<string, unknown> | undefined,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as Record<string, unknown>;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res as Response & typeof res;
}

function runScope(scope: string, max: number, userId: number): number {
  const mw = bingxRateLimit({ scope, max, windowMs: 60_000 });
  let ok = 0;
  for (let i = 0; i < max + 1; i += 1) {
    const res = mockRes();
    mw(mockReq(userId), res, () => {
      ok += 1;
    });
    if (res.statusCode === 429) {
      assert.equal(res.body?.code, "BINGX_RATE_LIMITED");
      assert.ok(res.headers["Retry-After"]);
      return ok;
    }
  }
  return ok;
}

const SCOPES: Array<{ scope: string; max: number }> = [
  { scope: "bingx.connect", max: 3 },
  { scope: "bingx.connections", max: 30 },
  { scope: "bingx.snapshot", max: 15 },
  { scope: "bingx.health", max: 12 },
  { scope: "bingx.account", max: 15 },
  { scope: "bingx.delete", max: 5 },
  { scope: "live.readiness", max: 30 },
  { scope: "live.preview", max: 10 },
  { scope: "live.submit", max: 2 },
  { scope: "live.symbol-rules", max: 30 },
];

for (const { scope, max } of SCOPES) {
  test(`${scope}: allows ${max}/min then 429`, () => {
    const passed = runScope(scope, max, 7000 + max);
    assert.equal(passed, max);
  });
}

test("user A limit does not block user B on same scope", () => {
  resetBingxRateLimitsForTests();
  const mw = bingxRateLimit({ scope: "bingx.snapshot", max: 1, windowMs: 60_000 });
  mw(mockReq(801), mockRes(), () => undefined);
  const blocked = mockRes();
  mw(mockReq(801), blocked, () => undefined);
  assert.equal(blocked.statusCode, 429);

  let userBOk = false;
  mw(mockReq(802), mockRes(), () => {
    userBOk = true;
  });
  assert.equal(userBOk, true);
});

test("live submit frozen even when live env flags on", () => {
  process.env.BINGX_ENABLE_LIVE_TRADING = "true";
  process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
  const freeze = assertBingxWriteNotFrozen();
  assert.equal(freeze.ok, false);
  const guard = checkLiveTradingActionAllowed("submit_order");
  assert.equal(guard.allowed, false);
});
