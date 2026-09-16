import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runBingXCrashRecoverySweep, recoveryGenerationKey } from "./bingxCrashRecoverySweep";

describe("BingX crash recovery sweep", () => {
  it("promotes stale started attempts, consumes one bounded generation, and isolates failures", async () => {
    const calls: string[] = [];
    const result = await runBingXCrashRecoverySweep({
      now: new Date("2026-01-01T00:02:00Z"),
      listCandidates: async () => [
        { attemptId: "a1", intentId: "i1", logicalOrderUid: "o1", userId: 7, transportState: "SUBMISSION_STARTED", startedAt: new Date("2026-01-01T00:00:00Z") },
        { attemptId: "a2", intentId: "i2", logicalOrderUid: "o2", userId: 8, transportState: "UNKNOWN_SUBMISSION_OUTCOME", startedAt: new Date("2026-01-01T00:00:00Z") },
      ],
      getIntent: async () => ({ logicalOrderUid: "mock" } as never),
      markUnknown: async (logicalOrderUid) => { calls.push(`unknown:${logicalOrderUid}`); },
      markRequired: async (logicalOrderUid) => { calls.push(`required:${logicalOrderUid}`); },
      latestCompleted: async (attemptId) => attemptId === "a2" ? { id: "r-old", result: "NO_MATCH_IN_OBSERVED_WINDOW", completedAt: new Date("2025-12-31T23:00:00Z") } : null,
      consume: async (userId, orderUid, deps) => { calls.push(`consume:${userId}:${orderUid}:${deps.runKey}`); if (orderUid === "o2") throw new Error("source down"); return { status: "UNRESOLVED" }; },
      claim: async () => ({ claimed: true, run: { run_status: "STARTED" } }),
    });
    assert.deepEqual(new Set(calls), new Set(["unknown:i1", "required:i1", "consume:7:o1:recovery:a1:INITIAL", "required:i2", "consume:8:o2:recovery:a2:r-old"]));
    assert.deepEqual(result, { scanned: 2, promoted: 2, consumed: 1, skipped: 0, failed: 1 });
  });

  it("never processes more than 25 and skips terminal latest results", async () => {
    let consumed = 0;
    const result = await runBingXCrashRecoverySweep({
      listCandidates: async () => Array.from({ length: 30 }, (_, n) => ({ attemptId: `a${n}`, intentId: `i${n}`, logicalOrderUid: `o${n}`, userId: 1, transportState: "UNKNOWN_SUBMISSION_OUTCOME" as const, startedAt: new Date(0) })),
      getIntent: async () => ({ logicalOrderUid: "mock" } as never),
      markRequired: async () => undefined,
      latestCompleted: async (attemptId) => attemptId === "a0" ? { id: "done", result: "MATCHED", completedAt: new Date() } : null,
      consume: async () => { consumed++; return { status: "MATCHED" }; },
      claim: async () => ({ claimed: true, run: { run_status: "STARTED" } }),
    });
    assert.equal(result.scanned, 25);
    assert.equal(result.skipped, 1);
    assert.equal(consumed, 24);
  });

  it("does not duplicate reads or consumption for concurrent sweeps of one attempt", async () => {
    let latestReads = 0;
    let consumes = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let claimCalls = 0;
    const deps = {
      listCandidates: async () => [{ attemptId: "same", intentId: "intent", logicalOrderUid: "order", userId: 1, transportState: "RECONCILIATION_REQUIRED", startedAt: new Date(0) }],
      latestCompleted: async () => { latestReads++; await blocked; return null; },
      getIntent: async () => ({ logicalOrderUid: "order" } as never),
      consume: async () => { consumes++; return { status: "UNRESOLVED" as const }; },
      claim: async () => ({ claimed: ++claimCalls === 1, run: { run_status: "STARTED" } }),
      existingRun: async () => ({ run_status: "COMPLETED" }),
    };
    const first = runBingXCrashRecoverySweep(deps);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const second = runBingXCrashRecoverySweep(deps);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(latestReads, 2);
    assert.equal(consumes, 1);
    assert.equal(a.consumed + b.consumed, 1);
    assert.equal(a.skipped + b.skipped, 1);
  });

  it("uses the server-owned deterministic generation key", () => {
    assert.equal(recoveryGenerationKey("attempt-1", null), "recovery:attempt-1:INITIAL");
    assert.equal(recoveryGenerationKey("attempt-1", { id: "run-9" }), "recovery:attempt-1:run-9");
  });
});
