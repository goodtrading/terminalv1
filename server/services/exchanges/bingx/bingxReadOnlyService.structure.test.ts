/**
 * Phase B1 — snapshot freshness/stale/degraded structure (no HTTP, no mocks).
 * Run: npm run test:bingx-snapshot
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SNAPSHOT_STALE_MS,
  deriveConnectionState,
  buildAccountDataQuality,
} from "./bingxNormalize";
import type { BingXReadOnlySnapshot } from "./bingxReadOnlyService";
import {
  clearBingXReadOnlyCache,
  __applySnapshotFreshnessForTests,
} from "./bingxReadOnlyService";

function baseSnapshot(overrides: Partial<BingXReadOnlySnapshot> = {}): BingXReadOnlySnapshot {
  const now = Date.now();
  return {
    connectionId: "conn-test",
    exchange: "bingx",
    mode: "read-only",
    connected: true,
    connectionState: "CONNECTED",
    health: "healthy",
    connectionHealth: "healthy",
    accountSync: { status: "loaded" },
    lastSyncTime: now,
    freshness: {
      lastSyncTime: now,
      ageMs: 0,
      stale: false,
      staleAfterMs: SNAPSHOT_STALE_MS,
    },
    dataQuality: { status: "complete", missingFields: [], warnings: [] },
    account: {
      equityUsdt: 100,
      balanceUsdt: 100,
      availableMarginUsdt: 80,
      unrealizedPnlUsdt: 0,
    },
    positions: [],
    openOrders: [],
    riskOrders: [],
    permissions: { read: true, trade: false, withdraw: false },
    warnings: [],
    ...overrides,
  };
}

test("freshness marks stale snapshot", () => {
  const old = Date.now() - SNAPSHOT_STALE_MS - 5000;
  const fresh = __applySnapshotFreshnessForTests(
    baseSnapshot({ lastSyncTime: old, freshness: undefined }),
    Date.now(),
  );
  assert.equal(fresh.freshness?.stale, true);
  assert.equal(fresh.connectionState, "STALE");
  assert.equal(fresh.dataQuality?.status, "stale");
});

test("partial positions failure shape — unavailable flag not zero positions claim", () => {
  const snap = baseSnapshot({
    connectionState: "DEGRADED",
    connectionHealth: "degraded",
    positionsUnavailable: true,
    partialFailures: { positions: "BINGX_SNAPSHOT_PARTIAL" },
    positions: [],
    warnings: ["Positions could not be loaded."],
  });
  assert.equal(snap.positionsUnavailable, true);
  assert.equal(snap.positions.length, 0);
  assert.ok(snap.account?.equityUsdt != null);
});

test("orders unavailable — openOrdersUnavailable set", () => {
  const snap = baseSnapshot({
    openOrdersUnavailable: true,
    partialFailures: { orders: "BINGX_SNAPSHOT_PARTIAL" },
    openOrders: [],
  });
  assert.equal(snap.openOrdersUnavailable, true);
});

test("zero equity is zero — missing equity is partial quality", () => {
  const zeroQ = buildAccountDataQuality({ equity: 0, balance: 0, availableMargin: 0 });
  assert.equal(zeroQ.status, "complete");
  const missingQ = buildAccountDataQuality({});
  assert.equal(missingQ.status, "missing");
});

test("deriveConnectionState degraded when partial endpoint fails", () => {
  assert.equal(
    deriveConnectionState({
      connected: true,
      health: "degraded",
      lastSyncTime: Date.now(),
    }),
    "DEGRADED",
  );
});

test("clearBingXReadOnlyCache does not throw", () => {
  clearBingXReadOnlyCache();
  clearBingXReadOnlyCache("conn-a", 1);
  assert.ok(true);
});

test("NaN is not produced in normalized account quality path", () => {
  const q = buildAccountDataQuality({
    equity: undefined,
    balance: undefined,
    availableMargin: undefined,
  });
  assert.ok(!q.missingFields.some((f) => f.includes("NaN")));
});
