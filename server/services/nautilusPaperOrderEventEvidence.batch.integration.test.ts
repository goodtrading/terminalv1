import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { pool } from "../db";
import {
  listNautilusPaperOrderEventEvidence,
  persistNautilusPaperOrderEventEvidence,
  persistNautilusPaperOrderEventEvidenceBatch,
} from "./nautilusPaperOrderEventEvidenceRepository";

const suffix = `${process.pid}_${Date.now()}`;
const account = `R1W1F_TEST_${suffix}`;

function evidence(eventId: string, price = "100.00", clientOrderId = `client-${suffix}`) {
  return {
    eventId, eventType: "OrderFilled", tsEventNs: "1700000000000000001", tsInitNs: "1700000000000000002",
    environment: "PAPER", source: "NAUTILUS_PAPER", clientOrderId, side: "BUY", orderType: "LIMIT",
    quantity: "0.123456789", price, triggerPrice: "120000.00000001", reduceOnly: true,
    reduceOnlySource: "EVENT_FACTUAL", tags: ["GT_PROTECTION=STOP_LOSS"], tagsSource: "EVENT_FACTUAL",
    contingencyType: "NO_CONTINGENCY", linkedOrderIds: [],
  };
}

async function count(eventIds: string[]): Promise<number> {
  assert.ok(pool);
  const result = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM goodtrading_paper_order_event_evidence WHERE account_id = $1 AND event_id = ANY($2)",
    [account, eventIds],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function cleanup(): Promise<void> {
  assert.ok(pool);
  await pool.query("DELETE FROM goodtrading_paper_order_event_evidence WHERE account_id = $1", [account]);
}

test("R1W.1F real PostgreSQL atomic batch matrix", async () => {
  assert.ok(process.env.DATABASE_URL);
  assert.ok(pool);
  const observer = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, ssl: { rejectUnauthorized: false } });
  const ids = ["all-a", "all-b", "all-c", "mixed-new", "dup", "mixed-new-2", "conflict", "before-conflict", "after-conflict", "concurrent-a", "concurrent-b", "concurrent-conflict", "concurrent-tail"];
  try {
    await observer.query("SELECT 1");

    const allNew = await persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("all-a"), evidence("all-b"), evidence("all-c")]);
    assert.equal(allNew.filter((item) => item.inserted).length, 3);

    await persistNautilusPaperOrderEventEvidence(account, evidence("dup"));
    const mixed = await persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("mixed-new"), evidence("dup"), evidence("mixed-new-2")]);
    assert.equal(mixed.filter((item) => item.inserted).length, 2);
    assert.equal(await count(["mixed-new", "dup", "mixed-new-2"]), 3);

    const allDuplicates = await persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("all-a"), evidence("dup")]);
    assert.equal(allDuplicates.filter((item) => item.inserted).length, 0);

    await assert.rejects(
      () => persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("conflict"), evidence("conflict", "101.00")]),
      /PAPER_ORDER_EVENT_EVIDENCE_CONFLICT/,
    );
    assert.equal(await count(["conflict"]), 0);

    await assert.rejects(
      () => persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("before-conflict"), evidence("after-conflict"), evidence("before-conflict", "102.00")]),
      /PAPER_ORDER_EVENT_EVIDENCE_CONFLICT/,
    );
    assert.equal(await count(["before-conflict", "after-conflict"]), 0);

    await persistNautilusPaperOrderEventEvidence(account, evidence("conflict-first", "103.00"));
    await assert.rejects(
      () => persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("conflict-first", "104.00"), evidence("never-new")]),
      /PAPER_ORDER_EVENT_EVIDENCE_CONFLICT/,
    );
    assert.equal(await count(["never-new"]), 0);

    const identical = await Promise.allSettled([
      persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("concurrent-a"), evidence("concurrent-b")]),
      persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("concurrent-a"), evidence("concurrent-b")]),
    ]);
    assert.ok(identical.every((item) => item.status === "fulfilled"));
    assert.equal(await count(["concurrent-a", "concurrent-b"]), 2);

    const conflicting = await Promise.allSettled([
      persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("concurrent-conflict", "106.00"), evidence("concurrent-tail")]),
      persistNautilusPaperOrderEventEvidenceBatch(account, [evidence("concurrent-conflict", "107.00"), evidence("concurrent-tail")]),
    ]);
    assert.equal(conflicting.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(conflicting.filter((item) => item.status === "rejected").length, 1);
    assert.equal(await count(["concurrent-conflict"]), 1);
    assert.equal(await count(["concurrent-tail"]), 1);

    const readback = await listNautilusPaperOrderEventEvidence(account);
    assert.ok(readback.some((item) => item.eventId === "all-a"));
  } finally {
    await cleanup();
    const remaining = await observer.query("SELECT count(*)::text AS count FROM goodtrading_paper_order_event_evidence WHERE account_id = $1", [account]);
    assert.equal(remaining.rows[0]?.count, "0");
    await observer.end();
  }
});
