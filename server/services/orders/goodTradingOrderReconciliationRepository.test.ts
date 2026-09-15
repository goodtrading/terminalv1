import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBrokerIdentity,
} from "../../../shared/durableOrderReconciliation";
import {
  completeReconciliationMatched,
  completeReconciliationNoMatch,
  createReconciliationRun,
  findOrCreateBrokerObjectByReliableIdentities,
  recordBrokerObservation,
} from "./goodTradingOrderReconciliationRepository";

test("repository exposes the B3-B3A narrow operations", () => {
  assert.equal(typeof createReconciliationRun, "function");
  assert.equal(typeof completeReconciliationMatched, "function");
  assert.equal(typeof completeReconciliationNoMatch, "function");
  assert.equal(typeof findOrCreateBrokerObjectByReliableIdentities, "function");
  assert.equal(typeof recordBrokerObservation, "function");
  assert.equal(createBrokerIdentity({ kind: "CLIENT_ORDER_ID", value: "GT-1" }).value, "GT-1");
});
