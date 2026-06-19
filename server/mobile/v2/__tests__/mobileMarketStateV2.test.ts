/**
 * Mobile market-state v2 — unit and contract tests.
 * Run: npm run test:mobile-v2
 */
import { test, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import {
  buildCanonicalMobileState,
  projectCanonicalSnapshot,
} from "../buildCanonicalMobileState";
import {
  computeDistance,
  normalizeProbability,
  parseDominantExpiry,
  sumScenarioProbabilities,
} from "../mobileMarketStateQuality";
import {
  __resetMobileV2CacheForTests,
  __setMobileV2TerminalStateLoaderForTests,
  __getMobileV2LoaderCallCountForTests,
  __expireMobileV2CacheForTests,
  getCanonicalMobileSnapshot,
} from "../mobileMarketStateCache";
import { parseMobileMarketStateV2Query } from "../mobileMarketStateV2.schema";
import {
  __setMobileTerminalAccessResolverForTests,
  verifyMobileTerminalAccess,
} from "../../../services/mobile/mobileTerminalAccessService";
import { requireMobileTerminalPlan } from "../../../middleware/mobileTerminalGuard";
import { mobileRateLimit, resetMobileRateLimitsForTests } from "../../../middleware/mobileRateLimit";
import {
  makeTerminalStateFixture,
  makeStaleOptionsFixture,
  makeStaleTickerFixture,
  makeUnavailableFlipsFixture,
} from "./fixtures";

afterEach(() => {
  __resetMobileV2CacheForTests();
  __setMobileV2TerminalStateLoaderForTests(null);
  __setMobileTerminalAccessResolverForTests(null);
  resetMobileRateLimitsForTests();
});

function legacyShapeHash(state: {
  market: Record<string, unknown>;
  meta: Record<string, unknown>;
  [key: string]: unknown;
}): string {
  const keys = JSON.stringify(Object.keys(state).sort());
  const marketKeys = JSON.stringify(Object.keys(state.market).sort());
  const metaKeys = JSON.stringify(Object.keys(state.meta).sort());
  return createHash("sha256").update(`${keys}|${marketKeys}|${metaKeys}`).digest("hex");
}

describe("canonical builder", () => {
  test("1 — mode=micro projection", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 5);
    const projected = projectCanonicalSnapshot(snap, "micro", "micro");
    assert.ok("micro" in projected);
    assert.equal(projected.relationship.status, "not_requested");
    assert.ok(!("macro" in projected));
    assert.equal(projected.micro.context, "micro");
  });

  test("2 — mode=macro projection", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 5);
    const projected = projectCanonicalSnapshot(snap, "macro", "macro");
    assert.ok("macro" in projected);
    assert.equal(projected.relationship.status, "not_requested");
    assert.ok(!("micro" in projected));
    assert.equal(projected.macro.context, "macro");
  });

  test("3 — mode=both projection", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 5);
    const projected = projectCanonicalSnapshot(snap, "both", "both");
    assert.ok("micro" in projected && "macro" in projected);
    assert.equal(projected.relationship.status, "available");
  });

  test("4 — localFlip differs from globalFlip", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.micro.gamma.flip.price.value, 69_800);
    assert.equal(snap.macro.gamma.flip.price.value, 68_000);
    assert.notEqual(snap.micro.gamma.flip.price.value, snap.macro.gamma.flip.price.value);
  });

  test("5 — localFlip unavailable", () => {
    const ts = makeUnavailableFlipsFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.micro.gamma.flip.price.value, null);
    assert.equal(snap.micro.gamma.flip.price.status, "unavailable");
    assert.ok(snap.metadata.warnings.includes("LOCAL_FLIP_UNAVAILABLE"));
  });

  test("6 — globalFlip unavailable", () => {
    const ts = makeUnavailableFlipsFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.macro.gamma.flip.price.value, null);
    assert.equal(snap.macro.gamma.flip.price.status, "unavailable");
    assert.ok(snap.metadata.warnings.includes("GLOBAL_FLIP_UNAVAILABLE"));
  });

  test("7 — spot stale", () => {
    const ts = makeStaleTickerFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.metadata.freshness.ticker, "stale");
    assert.ok(snap.metadata.warnings.includes("SPOT_STALE"));
  });

  test("8 — options stale", () => {
    const ts = makeStaleOptionsFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.metadata.freshness.options, "stale");
    assert.ok(snap.metadata.warnings.includes("OPTIONS_STALE"));
  });

  test("9 — scenario without invalidation (macro ALT)", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    const alt = snap.macro.scenarios.items.find((s) => s.id === 2);
    assert.ok(alt);
    assert.equal(alt!.invalidations.items.length, 0);
    assert.equal(alt!.invalidations.status, "unavailable");
  });

  test("10 — scenario probabilities do not sum to 1", () => {
    const ts = makeTerminalStateFixture();
    const sum = sumScenarioProbabilities(ts.scenarios ?? []);
    assert.ok(sum != null && sum > 1);
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.ok(snap.metadata.warnings.includes("SCENARIO_PROBABILITY_MISMATCH"));
  });

  test("11 — null values carry correct status", () => {
    const ts = makeUnavailableFlipsFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.micro.gamma.totalGex.value, null);
    assert.equal(snap.micro.gamma.totalGex.status, "not_applicable");
    assert.equal(snap.macro.gamma.flip.price.status, "unavailable");
  });

  test("17 — probabilities normalized 0-1 with raw preserved", () => {
    assert.equal(normalizeProbability(53).value, 0.53);
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    const base = snap.micro.scenarios.items[0];
    assert.equal(base.probability.value, 0.55);
    assert.equal(base.probabilityRaw.value, 55);
  });

  test("18 — signed and absolute distances", () => {
    const above = computeDistance(71_000, 70_000);
    assert.equal(above.position, "above_spot");
    assert.ok(above.signedDistancePct != null && above.signedDistancePct > 0);
    assert.equal(above.distancePct, Math.abs(above.signedDistancePct!));
    const below = computeDistance(69_000, 70_000);
    assert.equal(below.position, "below_spot");
    assert.ok(below.signedDistancePct != null && below.signedDistancePct < 0);
    assert.equal(below.distancePct, Math.abs(below.signedDistancePct!));
    const at = computeDistance(70_000, 70_000);
    assert.equal(at.position, "at_spot");
    assert.equal(at.distanceUsd, 0);
    assert.equal(at.distancePct, 0);
  });

  test("19 — structured pockets preserved as array", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.macro.optionsStructure.shortGammaPockets.items.length, 2);
    assert.equal(snap.macro.gamma.shortGammaPockets.items.length, 2);
  });

  test("relationship derives flip ordering", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.relationship.flipOrdering.value, "local_above_global");
    assert.equal(snap.relationship.status, "available");
  });

  test("drivers are typed objects not plain strings", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    const driver = snap.micro.marketState.drivers.items[0];
    assert.ok(driver.code);
    assert.ok(driver.label);
    assert.ok(["positive", "negative", "neutral", "mixed"].includes(driver.impact));
    assert.equal(driver.context, "micro");
  });

  test("scenario classification micro vs macro by storage type", () => {
    const ts = makeTerminalStateFixture();
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.micro.scenarios.items.length, 1);
    assert.equal(snap.micro.scenarios.items[0].classification, "intraday");
    assert.equal(snap.macro.scenarios.items.length, 2);
    assert.ok(snap.macro.scenarios.items.some((s) => s.classification === "structural"));
    assert.ok(snap.macro.scenarios.items.some((s) => s.classification === "tail"));
  });

  test("unclassified scenario type triggers warning", () => {
    const ts = makeTerminalStateFixture({
      scenarios: [
        {
          id: 99,
          type: "CUSTOM",
          probability: 10,
          thesis: "Unknown horizon",
          levels: [],
          confirmation: [],
          invalidation: "n/a",
          timestamp: new Date(),
        },
      ],
    });
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.ok(snap.metadata.warnings.includes("SCENARIO_HORIZON_UNCLASSIFIED"));
    assert.equal(snap.micro.scenarios.items.length, 0);
    assert.equal(snap.macro.scenarios.items.length, 0);
  });

  test("dominantExpiry structured with instrument code", () => {
    const expiry = parseDominantExpiry("26JUN26", true, new Date("2026-06-18T12:00:00.000Z"));
    assert.equal(expiry.status, "available");
    assert.equal(expiry.instrumentCode, "26JUN26");
    assert.equal(expiry.date, "2026-06-26");
    assert.equal(expiry.daysToExpiry, 8);
  });

  test("metadata includes accessModel", () => {
    const snap = buildCanonicalMobileState(makeTerminalStateFixture(), "BTC", false, 1);
    assert.equal(snap.metadata.accessModel, "terminal_subscription_inherited");
  });

  test("real zero preserved as available", () => {
    const ts = makeTerminalStateFixture({
      market: {
        ...makeTerminalStateFixture().market!,
        totalGex: 0,
      },
    });
    const snap = buildCanonicalMobileState(ts, "BTC", false, 1);
    assert.equal(snap.macro.gamma.totalGex.value, 0);
    assert.equal(snap.macro.gamma.totalGex.status, "available");
  });
});

describe("cache", () => {
  test("same snapshot for micro and macro modes within TTL", async () => {
    const ts = makeTerminalStateFixture();
    __setMobileV2TerminalStateLoaderForTests(async () => ts);
    const a = await getCanonicalMobileSnapshot("BTC");
    const b = await getCanonicalMobileSnapshot("BTC");
    assert.equal(a.metrics.cacheHit, false);
    assert.equal(b.metrics.cacheHit, true);
    assert.equal(a.snapshot.metadata.snapshotId, b.snapshot.metadata.snapshotId);
    assert.equal(a.snapshot.metadata.generatedAt, b.snapshot.metadata.generatedAt);
  });

  test("20 concurrent requests after expiry → single loader call", async () => {
    const ts = makeTerminalStateFixture();
    __setMobileV2TerminalStateLoaderForTests(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return ts;
    });
    await getCanonicalMobileSnapshot("BTC");
    assert.equal(__getMobileV2LoaderCallCountForTests(), 1);
    __expireMobileV2CacheForTests();
    const waits = Array.from({ length: 20 }, () => getCanonicalMobileSnapshot("BTC"));
    await Promise.all(waits);
    assert.equal(__getMobileV2LoaderCallCountForTests(), 2);
  });
});

describe("requestId vs snapshotId", () => {
  test("snapshotId stable on cache hit; requestId not in snapshot metadata", async () => {
    const ts = makeTerminalStateFixture();
    __setMobileV2TerminalStateLoaderForTests(async () => ts);
    const first = await getCanonicalMobileSnapshot("BTC");
    const second = await getCanonicalMobileSnapshot("BTC");
    assert.equal(first.snapshot.metadata.snapshotId, second.snapshot.metadata.snapshotId);
    assert.equal((first.snapshot.metadata as { requestId?: string }).requestId, undefined);
  });
});

describe("query validation", () => {
  test("15 — unsupported asset → 400", () => {
    const parsed = parseMobileMarketStateV2Query({ asset: "ETH", mode: "micro" });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "UNSUPPORTED_ASSET");
  });

  test("16 — invalid mode → 400", () => {
    const parsed = parseMobileMarketStateV2Query({ asset: "BTC", mode: "tiny" });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error, "INVALID_MODE");
  });
});

describe("auth and rate limit", () => {
  test("12 — unauthenticated → 401", async () => {
    const r = await verifyMobileTerminalAccess(null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
  });

  test("13 — no subscription → 403", async () => {
    __setMobileTerminalAccessResolverForTests(async () => ({
      allowed: false,
      reason: "no_subscription",
    }));
    const r = await verifyMobileTerminalAccess(7);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 403);
      assert.equal(r.code, "PLAN_REQUIRED");
    }
  });

  test("14 — rate limit → 429", () => {
    const mw = mobileRateLimit({ scope: "test.mobile.v2", max: 1, windowMs: 60_000 });
    const req = {
      saasUser: { id: 99 },
      query: {},
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as Request;
    const next = () => undefined;
    const first = mockRes();
    mw(req, first, next);
    assert.equal(first.headers["X-RateLimit-Limit"], "1");
    const blocked = mockRes();
    mw(req, blocked, next);
    assert.equal(blocked.statusCode, 429);
    assert.equal((blocked.body as { error?: { code?: string } }).error?.code, "MOBILE_RATE_LIMITED");
    assert.ok(blocked.headers["Retry-After"]);
    assert.equal(blocked.headers["X-RateLimit-Remaining"], "0");
  });

  test("active subscription grants terminal_mobile_access capability", async () => {
    __setMobileTerminalAccessResolverForTests(async () => ({
      allowed: true,
      subscription: {
        id: 1,
        planId: 1,
        planName: "Monthly",
        planSlug: "monthly",
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        startsAt: new Date().toISOString(),
      },
    }));
    const r = await verifyMobileTerminalAccess(7);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.capabilities.terminal_mobile_access, true);
  });

  test("guard middleware blocks without access", async () => {
    __setMobileTerminalAccessResolverForTests(async () => ({
      allowed: false,
      reason: "expired",
    }));
    const req = { saasUser: { id: 3 } } as Request;
    const res = mockRes();
    let nextCalled = false;
    await requireMobileTerminalPlan(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

describe("legacy contract stability", () => {
  test("20 — legacy adapter top-level keys unchanged", async () => {
    const { adaptTerminalStateForMobile } = await import("../../../mobile-adapter");
    const ts = makeTerminalStateFixture();
    const mobile = adaptTerminalStateForMobile(ts);
    const hash = legacyShapeHash(mobile);
    const expectedTop = [
      "alerts",
      "bias",
      "levels",
      "market",
      "meta",
      "risk",
      "scenarios",
    ];
    assert.deepEqual(Object.keys(mobile).sort(), expectedTop);
    assert.ok(mobile.market.gammaFlip != null || mobile.market.gammaFlip === null);
    assert.equal(typeof mobile.meta.timestamp, "number");
    assert.match(hash, /^[a-f0-9]{64}$/);
    const hash2 = legacyShapeHash(adaptTerminalStateForMobile(ts));
    assert.equal(hash, hash2);
  });
});

function mockRes(): Response & { statusCode: number; body?: unknown; headers: Record<string, string> } {
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
