import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import type { Server } from "node:http";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { __setSaasAuthResolverForTests } from "../../../server/middleware/saasAuth";
import { pool } from "../../../server/db";
import { nautilusPaperOrderEventEvidenceRouter } from "../../../server/routes/nautilusPaperOrderEventEvidence.routes";
import { PaperStateController } from "./paperState";
import { bindPaperOwner, getPaperOwner, resetPaperOwnerForTests } from "./paperOwnerContext";
import { setPaperExecutionBackend } from "./paperExecutionPort";

const ACCOUNT_A = 980000 + (process.pid % 1000);
const ACCOUNT_B = ACCOUNT_A + 1;
const DB_PATH = join(tmpdir(), `r1w2-final-${process.pid}-${randomUUID()}.sqlite`);
const PYTHON_SQLITE = String.raw`
import json, sqlite3, sys, time
path, action, account, payload = sys.argv[1:5]
conn = sqlite3.connect(path)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=FULL")
conn.executescript("""
CREATE TABLE IF NOT EXISTS nautilus_evidence_outbox (
 account_id TEXT NOT NULL, environment TEXT NOT NULL, source TEXT NOT NULL,
 event_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
 attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL, PRIMARY KEY(account_id, environment, source, event_id)
);
CREATE INDEX IF NOT EXISTS idx_nautilus_evidence_outbox_account_status
 ON nautilus_evidence_outbox(account_id, status, created_at_ms);
""")
if action == 'enqueue':
  e=json.loads(payload); now=int(time.time()*1000)
  conn.execute("INSERT INTO nautilus_evidence_outbox VALUES(?,?,?,?,?,?,?,?,?,?)",
    (account,'PAPER','NAUTILUS_PAPER',e['eventId'],json.dumps(e,separators=(',',':')), 'PENDING',0,None,now,now))
  conn.commit(); print('ENQUEUED')
elif action == 'list':
  rows=conn.execute("SELECT account_id,environment,source,event_id,payload,status,attempts,last_error FROM nautilus_evidence_outbox WHERE account_id=? ORDER BY created_at_ms",(account,)).fetchall()
  print(json.dumps([{'accountId':r[0],'environment':r[1],'source':r[2],'eventId':r[3],'payload':json.loads(r[4]),'status':r[5],'attempts':r[6],'lastError':r[7]} for r in rows],separators=(',',':')))
elif action == 'ack':
  ids=json.loads(payload)
  conn.executemany("DELETE FROM nautilus_evidence_outbox WHERE account_id=? AND environment='PAPER' AND source='NAUTILUS_PAPER' AND event_id=?",[(account,i) for i in ids])
  conn.commit(); print('ACKED')
conn.close()
`;

const event = {
  eventId: `r1w2-final-${process.pid}-${Date.now()}`,
  eventType: "OrderFilled",
  tsEventNs: "1700000000000000001",
  tsInitNs: "1700000000000000002",
  environment: "PAPER",
  source: "NAUTILUS_PAPER",
  clientOrderId: "r1w2-final-client",
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.123456789",
  price: "123456.12345678",
  triggerPrice: "120000.00000001",
  reduceOnly: false,
  reduceOnlySource: "EVENT_FACTUAL",
  tags: ["GT_PROTECTION=STOP_LOSS"],
  tagsSource: "EVENT_FACTUAL",
  linkedOrderIds: [],
  parentOrderId: null,
  orderListId: null,
  reason: null,
};

function sqlite(action: string, account: number, payload: unknown = ""): any {
  const out = execFileSync("python", ["-c", PYTHON_SQLITE, DB_PATH, action, String(account), JSON.stringify(payload)], { encoding: "utf8" }).trim();
  return action === "list" ? JSON.parse(out) : out;
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function runtime(userId: number | null) {
  return { workspace: "paper" as const, backend: "nautilus" as const, authReady: true, authenticated: userId !== null, authenticatedUserId: userId };
}

test("real SQLite restart, wrong owner, A rebind, Node router, Neon ACK and exact readback", async () => {
  if (!pool) throw new Error("DATABASE_POOL_UNAVAILABLE");
  let server: Server | undefined;
  const originalFetch = globalThis.fetch;
  let postCount = 0;
  try {
    sqlite("enqueue", ACCOUNT_A, event);
    const afterEnqueue = sqlite("list", ACCOUNT_A);
    assert.equal(afterEnqueue.length, 1);
    assert.deepEqual(afterEnqueue[0].payload, event);

    (globalThis as { window?: unknown }).window = {
      __TAURI__: {}, __TAURI_INTERNALS__: {},
      dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined,
    };
    const calls: Array<{ command: string; payload: any }> = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      const account = Number((payload as { accountId?: string })?.accountId ?? 0);
      if (command === "list_nautilus_evidence_outbox") return sqlite("list", account);
      if (command === "ack_nautilus_evidence_outbox") return sqlite("ack", account, (payload as { eventIds: string[] }).eventIds);
      if (command === "mark_nautilus_evidence_outbox_failure") return undefined;
      return undefined;
    });

    __setSaasAuthResolverForTests(async () => ({ id: ACCOUNT_A, email: "r1w2-final@example.invalid", role: "user" }));
    const app = express();
    app.use(express.json());
    app.use("/api/paper/nautilus", nautilusPaperOrderEventEvidenceRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    globalThis.fetch = (async (input, init) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (raw.includes("/api/paper/nautilus/order-events")) {
        postCount += 1;
        const response = await originalFetch(`${baseUrl}/api/paper/nautilus/order-events`, init);
        return response;
      }
      if (raw.startsWith("/api/")) return originalFetch(`${baseUrl}${raw}`, init);
      return originalFetch(input, init);
    }) as typeof fetch;

    resetPaperOwnerForTests();
    setPaperExecutionBackend("nautilus");
    const wrongOwner = new PaperStateController();
    wrongOwner.setRuntime(runtime(ACCOUNT_B));
    await settle();
    assert.equal(getPaperOwner()?.userId, ACCOUNT_B);
    assert.equal(sqlite("list", ACCOUNT_A).length, 1);
    assert.equal(postCount, 0);

    wrongOwner.setRuntime(runtime(null));
    await settle();
    assert.equal(getPaperOwner(), null);
    wrongOwner.setRuntime(runtime(ACCOUNT_A));
    await settle();
    assert.equal(getPaperOwner()?.userId, ACCOUNT_A);
    assert.equal(postCount, 1);
    assert.equal(sqlite("list", ACCOUNT_A).length, 0);
    assert.equal(calls.filter((x) => x.command === "ack_nautilus_evidence_outbox").length, 1);
    wrongOwner.dispose();

    const rows = await pool.query(
      "SELECT event_id,event_type,ts_event_ns,ts_init_ns,environment,source,payload FROM goodtrading_paper_order_event_evidence WHERE account_id=$1 AND event_id=$2",
      [String(ACCOUNT_A), event.eventId],
    );
    assert.equal(rows.rowCount, 1);
    assert.deepEqual(rows.rows[0], {
      event_id: event.eventId, event_type: event.eventType, ts_event_ns: event.tsEventNs, ts_init_ns: event.tsInitNs,
      environment: event.environment, source: event.source, payload: event,
    });

    const repeat = new PaperStateController();
    repeat.setRuntime(runtime(ACCOUNT_A));
    await settle();
    assert.equal(sqlite("list", ACCOUNT_A).length, 0);
    assert.equal(postCount, 1);
    repeat.dispose();
  } finally {
    if (pool) await pool.query("DELETE FROM goodtrading_paper_order_event_evidence WHERE account_id=$1 AND event_id=$2", [String(ACCOUNT_A), event.eventId]);
    __setSaasAuthResolverForTests(null);
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    globalThis.fetch = originalFetch;
    clearMocks();
    resetPaperOwnerForTests();
    setPaperExecutionBackend("legacy");
    try { unlinkSync(DB_PATH); } catch {}
    try { unlinkSync(`${DB_PATH}-wal`); } catch {}
    try { unlinkSync(`${DB_PATH}-shm`); } catch {}
  }
});
