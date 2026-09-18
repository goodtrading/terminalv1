import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth";
import { pool } from "../db";
import { nautilusPaperOrderEventEvidenceRouter } from "./nautilusPaperOrderEventEvidence.routes";
import { persistNautilusPaperOrderEventEvidence } from "../services/nautilusPaperOrderEventEvidenceRepository";

const accountId = 920000 + process.pid;
const base = (eventId: string, price = "100.00") => ({
  eventId, eventType: "OrderFilled", tsEventNs: "1700000000000000001", tsInitNs: "1700000000000000002",
  environment: "PAPER", source: "NAUTILUS_PAPER", clientOrderId: `router-client-${process.pid}`,
  side: "BUY", orderType: "LIMIT", quantity: "1", price, reduceOnly: true,
  reduceOnlySource: "EVENT_FACTUAL", tags: [], tagsSource: "EVENT_FACTUAL", linkedOrderIds: [],
});

let server: Server | undefined;

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  if (pool) await pool.query("DELETE FROM goodtrading_paper_order_event_evidence WHERE account_id = $1", [String(accountId)]);
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

async function appRequest(path: string, init?: RequestInit): Promise<Response> {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  const app = express();
  app.use(express.json());
  app.use("/api/paper/nautilus", nautilusPaperOrderEventEvidenceRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

test("router rejects GET and POST without SaaS authentication", async () => {
  __setSaasAuthResolverForTests(async () => null);
  const get = await appRequest("/api/paper/nautilus/order-events");
  assert.equal(get.status, 401);
  const post = await appRequest("/api/paper/nautilus/order-events", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: [base("unauth")] }),
  });
  assert.equal(post.status, 401);
});

test("router maps repository factual conflict to HTTP 409", async () => {
  __setSaasAuthResolverForTests(async () => ({ id: accountId, email: "r1w1f-test@example.invalid", role: "user" }));
  await persistNautilusPaperOrderEventEvidence(String(accountId), base("router-conflict", "100.00"));
  const response = await appRequest("/api/paper/nautilus/order-events", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: [base("router-conflict", "101.00")] }),
  });
  assert.equal(response.status, 409);
  const payload = await response.json() as { code: string };
  assert.equal(payload.code, "NAUTILUS_EVIDENCE_CONFLICT");
});
