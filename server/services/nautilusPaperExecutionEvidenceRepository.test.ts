import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../db";
import { adaptNautilusPaperExecutionEvidence, type NautilusPaperExecutionEvidence } from "./nautilusPaperExecutionEvidence";
import {
  persistNautilusPaperExecutionEvidence,
  getNautilusPaperExecutionEvidence,
  listNautilusPaperExecutionEvidence,
} from "./nautilusPaperExecutionEvidenceRepository";

const run = process.env.DATABASE_URL ? test : test.skip;
const accountId = `n9c5b-test-account-${process.pid}-${Date.now()}`;
const sessionId = `n9c5b-test-session-${process.pid}-${Date.now()}`;

function evidence(overrides: Partial<NautilusPaperExecutionEvidence> = {}): NautilusPaperExecutionEvidence {
  return {
    ...adaptNautilusPaperExecutionEvidence({
      fillId: "fill-a",
      clientOrderId: "client-1",
      venueOrderId: "order-1",
      instrument: { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP" },
      side: "BUY",
      price: "1.000000000000000001",
      quantity: "0.000000000000000123",
      timestamp: 1_700_000_000_123,
      fee: "0.000000000000000007",
      feeAsset: "USDT",
      liquidity: "MAKER",
    }),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await pool.query("DELETE FROM goodtrading_paper_execution_evidence WHERE account_id = $1 AND session_id = $2", [accountId, sessionId]);
}

run("persists and reads exact simulated evidence after a fresh repository read", async () => {
  await cleanup();
  try {
    const input = evidence();
    await persistNautilusPaperExecutionEvidence(accountId, sessionId, input);
    const read = await getNautilusPaperExecutionEvidence(accountId, sessionId, input.executionId);
    assert.deepEqual(read, input);
  } finally {
    await cleanup();
  }
});

run("preserves zero fee, null fee, fee asset, and all liquidity roles", async () => {
  await cleanup();
  try {
    for (const [id, fee, role] of [
      ["zero", { value: "0", asset: "USDT" }, "MAKER"],
      ["null", { value: null, asset: null }, "UNKNOWN"],
      ["taker", { value: "0", asset: "USDT" }, "TAKER"],
    ] as const) {
      const item = evidence({ executionId: `fill-${id}`, fee: { value: fee.value, asset: fee.asset, quality: "SIMULATED_CONFIGURED_FEE" }, liquidityRole: role });
      await persistNautilusPaperExecutionEvidence(accountId, sessionId, item);
      assert.deepEqual(await getNautilusPaperExecutionEvidence(accountId, sessionId, item.executionId), item);
    }
  } finally {
    await cleanup();
  }
});

run("keeps multiple fills independent and duplicate replay idempotent", async () => {
  await cleanup();
  try {
    const first = evidence({ executionId: "fill-a", price: "10", quantity: "1" });
    const second = evidence({ executionId: "fill-b", price: "11", quantity: "2", side: "SELL", liquidityRole: "TAKER" });
    await persistNautilusPaperExecutionEvidence(accountId, sessionId, first);
    await persistNautilusPaperExecutionEvidence(accountId, sessionId, first);
    await persistNautilusPaperExecutionEvidence(accountId, sessionId, second);
    const rows = await listNautilusPaperExecutionEvidence(accountId, sessionId, "client-1");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.executionId), ["fill-a", "fill-b"]);
  } finally {
    await cleanup();
  }
});

run("rejects immutable conflicts and wrong provenance", async () => {
  await cleanup();
  try {
    const original = evidence();
    await persistNautilusPaperExecutionEvidence(accountId, sessionId, original);
    for (const variant of [
      { price: "2" },
      { quantity: "2" },
      { eventTime: 1_700_000_000_124 },
      { fee: { value: "0", asset: "USDT", quality: "SIMULATED_CONFIGURED_FEE" as const } },
      { fee: { value: "0.1", asset: "USDT", quality: "SIMULATED_CONFIGURED_FEE" as const } },
      { fee: { value: "0", asset: "USDC", quality: "SIMULATED_CONFIGURED_FEE" as const } },
      { liquidityRole: "TAKER" as const },
      { environment: "LIVE" as "PAPER" },
      { source: "BINGX" as "NAUTILUS_PAPER" },
    ]) {
      await assert.rejects(
        persistNautilusPaperExecutionEvidence(accountId, sessionId, evidence({ ...variant })),
        /CONFLICT|PROVENANCE/,
      );
    }
  } finally {
    await cleanup();
  }
});

run("concurrent identical inserts converge to one row", async () => {
  await cleanup();
  try {
    const input = evidence({ executionId: "concurrent-fill" });
    await Promise.all(Array.from({ length: 8 }, () => persistNautilusPaperExecutionEvidence(accountId, sessionId, input)));
    const result = await pool!.query(
      "SELECT count(*)::int AS count FROM goodtrading_paper_execution_evidence WHERE account_id = $1 AND session_id = $2 AND execution_id = $3",
      [accountId, sessionId, input.executionId],
    );
    assert.equal(result.rows[0].count, 1);
  } finally {
    await cleanup();
  }
});
