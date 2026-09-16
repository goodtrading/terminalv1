import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { observeBingXBrokerObjects } from "./bingxExternalObservationService";

describe("BingX external observation", () => {
  it("persists reliable observations as observed-only, aliases them, and dedupes a repeated scan", async () => {
    const objects = new Map<string, string>();
    const snapshots: string[] = [];
    const result = await observeBingXBrokerObjects({
      brokerAccountIdentity: "GT-ACCOUNT-1",
      read: async () => ({ OPEN_ORDERS: { status: "loaded", observations: [{ source: "OPEN_ORDERS", clientOrderId: "client-1", brokerOrderId: "123456789012345678", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", observedAt: "2026-01-01T00:00:00Z" }] }, ORDER_HISTORY: { status: "loaded", observations: [] }, FILL_HISTORY: { status: "loaded", observations: [] } }),
      findOrCreate: async ({ identities }) => { const key = identities.map(i => `${i.kind}:${i.value}`).join(","); const id = objects.get(key) ?? "object-1"; objects.set(key, id); return { id, classification: "BROKER_OBSERVED_ONLY" }; },
      recordIfNew: async ({ snapshot }) => { const key = `${snapshot.source}:${snapshot.clientOrderId}:${snapshot.brokerOrderId}`; if (snapshots.includes(key)) return false; snapshots.push(key); return true; },
    });
    assert.equal(result.persisted, 1);
    assert.equal((await observeBingXBrokerObjects({ brokerAccountIdentity: "GT-ACCOUNT-1", read: async () => ({ OPEN_ORDERS: { status: "loaded", observations: [{ source: "OPEN_ORDERS", clientOrderId: "client-1", brokerOrderId: "123456789012345678", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", observedAt: "2026-01-01T00:00:00Z" }] }, ORDER_HISTORY: { status: "loaded", observations: [] }, FILL_HISTORY: { status: "loaded", observations: [] } }), findOrCreate: async ({ identities }) => ({ id: objects.get(identities[0]!.value) ?? "object-1", classification: "BROKER_OBSERVED_ONLY" }), recordIfNew: async ({ snapshot }) => { const key = `${snapshot.source}:${snapshot.clientOrderId}:${snapshot.brokerOrderId}`; if (snapshots.includes(key)) return false; snapshots.push(key); return true; } })).deduped, 1);
    assert.equal(snapshots.length, 1);
  });

  it("skips known GT client IDs and reports source failures", async () => {
    const result = await observeBingXBrokerObjects({ brokerAccountIdentity: "A", read: async () => ({ OPEN_ORDERS: { status: "failed", observations: [], errorCode: "TIMEOUT" }, ORDER_HISTORY: { status: "loaded", observations: [{ source: "ORDER_HISTORY", clientOrderId: "known-gt", brokerOrderId: 99 as never, brokerOrderIdPrecisionTrusted: false, symbol: "BTC-USDT", observedAt: new Date().toISOString() }] }, FILL_HISTORY: { status: "loaded", observations: [] } }), lookupKnownClientOrderId: async () => true,
 findOrCreate: async () => { throw new Error("must not create known GT"); }, recordIfNew: async () => true });
    assert.equal(result.persisted, 0);
    assert.equal(result.rejected, 0);
    assert.equal(result.knownGtMatches, 1);
    assert.deepEqual(result.sourceFailures, ["OPEN_ORDERS:TIMEOUT"]);
  });
});
