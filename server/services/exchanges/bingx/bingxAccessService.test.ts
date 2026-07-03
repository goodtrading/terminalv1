/**
 * Phase B1 — BingX terminal access + plan middleware (mocked accessService).
 * Run: npm run test:bingx-access
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { AccessSnapshot } from "../../accessService";
import {
  __setBingxAccessResolverForTests,
  verifyBingxTerminalAccess,
} from "./bingxAccessService";
import { requireBingxTerminalPlan } from "../../../middleware/bingxTerminalGuard";

afterEach(() => {
  __setBingxAccessResolverForTests(null);
  delete process.env.BINGX_EXCLUDED_PLAN_SLUGS;
});

function mockAccess(snapshot: AccessSnapshot): void {
  __setBingxAccessResolverForTests(async () => snapshot);
}

function mockAccessThrows(): void {
  __setBingxAccessResolverForTests(async () => {
    throw new Error("provider down");
  });
}

function mockRes(): Response & {
  statusCode: number;
  body?: unknown;
} {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & typeof res;
}

test("1 — request without user → 401 AUTH_REQUIRED", async () => {
  const r = await verifyBingxTerminalAccess(null);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 401);
    assert.equal(r.code, "AUTH_REQUIRED");
  }
});

test("2 — authenticated user without subscription → 403 PLAN_REQUIRED", async () => {
  mockAccess({ allowed: false, reason: "no_subscription" });
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.code, "PLAN_REQUIRED");
  }
});

test("3 — expired plan → 403 PLAN_EXPIRED", async () => {
  mockAccess({ allowed: false, reason: "expired" });
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.code, "PLAN_EXPIRED");
  }
});

test("4 — active plan excluded from BingX → 403 BINGX_ACCESS_NOT_INCLUDED", async () => {
  process.env.BINGX_EXCLUDED_PLAN_SLUGS = "free,trial";
  mockAccess({
    allowed: true,
    subscription: {
      id: 1,
      planId: 1,
      planName: "Free",
      planSlug: "free",
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      startsAt: new Date().toISOString(),
    },
  });
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.code, "BINGX_ACCESS_NOT_INCLUDED");
  }
});

test("5 — active plan with BingX → middleware continues", async () => {
  mockAccess({
    allowed: true,
    subscription: {
      id: 2,
      planId: 2,
      planName: "Pro",
      planSlug: "pro",
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      startsAt: new Date().toISOString(),
    },
  });

  const verify = await verifyBingxTerminalAccess(42);
  assert.equal(verify.ok, true);

  const req = { saasUser: { id: 42 } } as Request;
  const res = mockRes();
  let nextCalled = false;
  await requireBingxTerminalPlan(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.bingxTerminalAccess?.userId, 42);
  assert.equal(req.bingxTerminalAccess?.planSlug, "pro");
});

test("6 — accessService error → fail closed 503", async () => {
  mockAccessThrows();
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 503);
    assert.equal(r.code, "PLAN_VALIDATION_UNAVAILABLE");
  }

  const req = { saasUser: { id: 42 } } as Request;
  const res = mockRes();
  let nextCalled = false;
  await requireBingxTerminalPlan(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
});

test("7 — unknown access state → fail closed PLAN_REQUIRED", async () => {
  mockAccess({ allowed: false, reason: "unknown" });
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.code, "PLAN_REQUIRED");
  }
});

test("invalid user id denied", async () => {
  const r = await verifyBingxTerminalAccess(0);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "AUTH_REQUIRED");
});

test("admin access allowed without subscription row", async () => {
  mockAccess({ allowed: true, reason: "admin" });
  const r = await verifyBingxTerminalAccess(1);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.userId, 1);
});

test("inactive account → ACCOUNT_INACTIVE", async () => {
  mockAccess({ allowed: false, reason: "inactive" });
  const r = await verifyBingxTerminalAccess(42);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "ACCOUNT_INACTIVE");
});
