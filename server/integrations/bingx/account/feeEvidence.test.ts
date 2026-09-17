import assert from "node:assert/strict";
import test from "node:test";
import { extractBingXFeeEvidence } from "./normalizers";
import { normalizeBingXSubmissionObservations } from "../../../services/exchanges/bingx/bingxSubmissionReconciliationReader";

test("preserves signed exact fee text and explicit asset", () => {
  assert.deepEqual(extractBingXFeeEvidence({ commission: "-0.000000000000000123", commissionAsset: "USDT" }), { amount: "-0.000000000000000123", asset: "USDT", conflict: false });
});

test("uses fee fallback and leaves missing asset unavailable", () => {
  assert.deepEqual(extractBingXFeeEvidence({ fee: "0.0001" }), { amount: "0.0001", asset: null, conflict: false });
});

test("fails closed when primary and fallback fee evidence conflicts", () => {
  assert.deepEqual(extractBingXFeeEvidence({ commission: "1.0", fee: "2.0", commissionAsset: "USDT", feeAsset: "USDT" }), { amount: null, asset: null, conflict: true });
  assert.deepEqual(extractBingXFeeEvidence({ commission: "1.0", commissionAsset: "USDT", feeAsset: "BTC" }), { amount: null, asset: null, conflict: true });
});
