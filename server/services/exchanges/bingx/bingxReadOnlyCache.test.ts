/**
 * B1.2 — snapshot cache hit/miss/TTL/isolation (mocked upstream, no BingX HTTP).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  __setSnapshotSyncForTests,
  __getSnapshotCacheMsForTests,
  clearBingXReadOnlyCache,
  getBingXReadOnlySnapshot,
  type BingXReadOnlySnapshot,
} from "./bingxReadOnlyService";

afterEach(() => {
  __setSnapshotSyncForTests(null);
  clearBingXReadOnlyCache();
});

function mockSnapshot(connectionId: string, syncTime: number): BingXReadOnlySnapshot {
  return {
    connectionId,
    exchange: "bingx",
    mode: "read-only",
    connected: true,
    connectionState: "CONNECTED",
    health: "healthy",
    connectionHealth: "healthy",
    accountSync: { status: "loaded" },
    lastSyncTime: syncTime,
    freshness: {
      lastSyncTime: syncTime,
      ageMs: 0,
      stale: false,
      staleAfterMs: 60_000,
    },
    dataQuality: { status: "complete", missingFields: [], warnings: [] },
    account: { equityUsdt: 1, balanceUsdt: 1, availableMarginUsdt: 1, unrealizedPnlUsdt: 0 },
    positions: [],
    openOrders: [],
    riskOrders: [],
    permissions: { read: true, trade: false, withdraw: false },
    warnings: [],
  };
}

test("cache miss invokes upstream once", async () => {
  let calls = 0;
  const syncTime = Date.now();
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, syncTime);
  });

  await getBingXReadOnlySnapshot("conn-a", 1001, "BTC-USDT");
  assert.equal(calls, 1);
});

test("cache hit does not reinvoke upstream", async () => {
  let calls = 0;
  const syncTime = Date.now();
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, syncTime);
  });

  await getBingXReadOnlySnapshot("conn-a", 1001, "BTC-USDT");
  await getBingXReadOnlySnapshot("conn-a", 1001, "BTC-USDT");
  assert.equal(calls, 1);
});

test("cache hit recalculates freshness while preserving lastSyncTime", async () => {
  const syncTime = Date.now() - 2_000;
  __setSnapshotSyncForTests(async (connId) => mockSnapshot(connId, syncTime));

  await getBingXReadOnlySnapshot("conn-a", 1001);
  const cached = await getBingXReadOnlySnapshot("conn-a", 1001);

  assert.equal(cached.lastSyncTime, syncTime);
  assert.ok((cached.freshness?.ageMs ?? 0) >= 1_000);
});

test("bypassCache forces upstream reinvoke", async () => {
  let calls = 0;
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, Date.now());
  });

  await getBingXReadOnlySnapshot("conn-a", 1001);
  await getBingXReadOnlySnapshot("conn-a", 1001, undefined, { bypassCache: true });
  assert.equal(calls, 2);
});

test("cache isolated by userId", async () => {
  let calls = 0;
  __setSnapshotSyncForTests(async (connId, userId) => {
    calls += 1;
    return mockSnapshot(`${connId}-u${userId}`, Date.now());
  });

  await getBingXReadOnlySnapshot("conn-a", 1001);
  await getBingXReadOnlySnapshot("conn-a", 1002);
  assert.equal(calls, 2);
});

test("cache isolated by connectionId", async () => {
  let calls = 0;
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, Date.now());
  });

  await getBingXReadOnlySnapshot("conn-a", 1001);
  await getBingXReadOnlySnapshot("conn-b", 1001);
  assert.equal(calls, 2);
});

test("cache isolated by symbol", async () => {
  let calls = 0;
  __setSnapshotSyncForTests(async (connId, _uid, symbol) => {
    calls += 1;
    return mockSnapshot(`${connId}-${symbol ?? "all"}`, Date.now());
  });

  await getBingXReadOnlySnapshot("conn-a", 1001, "BTC-USDT");
  await getBingXReadOnlySnapshot("conn-a", 1001, "ETH-USDT");
  assert.equal(calls, 2);
});

test("clearBingXReadOnlyCache by connection forces miss", async () => {
  let calls = 0;
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, Date.now());
  });

  await getBingXReadOnlySnapshot("conn-a", 1001);
  clearBingXReadOnlyCache("conn-a", 1001);
  await getBingXReadOnlySnapshot("conn-a", 1001);
  assert.equal(calls, 2);
});

test("TTL expiry reinvokes upstream", async () => {
  const ttl = __getSnapshotCacheMsForTests();
  let calls = 0;
  const syncTime = Date.now();
  __setSnapshotSyncForTests(async (connId) => {
    calls += 1;
    return mockSnapshot(connId, syncTime + calls - 1);
  });

  await getBingXReadOnlySnapshot("conn-a", 1001);
  await new Promise((r) => setTimeout(r, ttl + 50));
  const refreshed = await getBingXReadOnlySnapshot("conn-a", 1001);
  assert.equal(calls, 2);
  assert.ok(refreshed.lastSyncTime >= syncTime);
});
