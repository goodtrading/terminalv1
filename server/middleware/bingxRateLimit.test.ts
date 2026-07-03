/**
 * Phase B1 — BingX rate limit middleware.
 * Run: npm run test:bingx-rate-limit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { bingxRateLimit, resetBingxRateLimitsForTests } from "./bingxRateLimit";

function mockReq(userId = 7): Request {
  return {
    saasUser: { id: userId },
    query: {},
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
  return res as Response & typeof res;
}

test("allows requests under limit", () => {
  resetBingxRateLimitsForTests();
  const mw = bingxRateLimit({ scope: "test.connect", max: 3, windowMs: 60_000 });
  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };
  mw(mockReq(1), mockRes(), next);
  assert.equal(nextCount, 1);
});

test("429 when limit exceeded with retry-after", () => {
  resetBingxRateLimitsForTests();
  const mw = bingxRateLimit({ scope: "test.snapshot", max: 2, windowMs: 60_000 });
  const next = () => undefined;
  mw(mockReq(9), mockRes(), next);
  mw(mockReq(9), mockRes(), next);
  const res = mockRes();
  mw(mockReq(9), res, next);
  assert.equal(res.statusCode, 429);
  assert.equal((res.body as { code?: string }).code, "BINGX_RATE_LIMITED");
  assert.ok(res.headers["Retry-After"]);
});

test("does not trust userId from query — uses session user only", () => {
  resetBingxRateLimitsForTests();
  const mw = bingxRateLimit({ scope: "test.query-spoof", max: 1, windowMs: 60_000 });
  const next = () => undefined;
  const reqSpoof = {
    saasUser: { id: 1 },
    query: { userId: "9999", connectionId: "c1" },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
  mw(reqSpoof, mockRes(), next);
  const blocked = mockRes();
  mw(reqSpoof, blocked, next);
  assert.equal(blocked.statusCode, 429);

  let user2Passed = false;
  mw(
    { saasUser: { id: 2 }, query: { userId: "9999" }, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as Request,
    mockRes(),
    () => {
      user2Passed = true;
    },
  );
  assert.equal(user2Passed, true);
});

test("limits are separate per user id", () => {
  resetBingxRateLimitsForTests();
  const mw = bingxRateLimit({ scope: "test.snapshot", max: 1, windowMs: 60_000 });
  const next = () => undefined;
  mw(mockReq(1), mockRes(), next);
  const blocked = mockRes();
  mw(mockReq(1), blocked, next);
  assert.equal(blocked.statusCode, 429);

  let otherPassed = false;
  mw(mockReq(2), mockRes(), () => {
    otherPassed = true;
  });
  assert.equal(otherPassed, true);
});
