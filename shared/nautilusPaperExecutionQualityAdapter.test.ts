import assert from "node:assert/strict";
import test from "node:test";

import { createEconomicFill } from "./economicFill";
import {
  adaptNautilusPaperExecutionForQuality,
  type NautilusPaperExecutionQualityAdapterInput,
} from "./nautilusPaperExecutionQualityAdapter";
import { buildOrderExecutionQuality } from "./orderExecutionQuality";

const account = {
  accountId: "paper-account",
  broker: "NAUTILUS_PAPER",
  environment: "PAPER" as const,
  baseCurrency: "USDT",
};

const evidence = {
  executionId: "fill-precise-1",
  environment: "PAPER" as const,
  source: "NAUTILUS_PAPER" as const,
  instrument: { venue: "SIM", marketType: "Perpetual", symbol: "BTCUSDT-PERP" },
  side: "BUY" as const,
  price: "1.000000000000000001",
  quantity: "0.000000000000000123",
  eventTime: 1_000,
  fee: { value: "0.000000000000000007", asset: "USDT", quality: "SIMULATED_CONFIGURED_FEE" as const },
  liquidityRole: "MAKER" as const,
  orderReferences: { clientOrderId: "client-1", venueOrderId: "venue-1" },
};

const input = (overrides: Partial<NautilusPaperExecutionQualityAdapterInput> = {}) => ({
  evidence,
  accountIdentity: account,
  fillCompleteness: "UNAVAILABLE" as const,
  ...overrides,
});

test("adapts exact Nautilus PAPER fill evidence without numeric coercion", () => {
  const result = adaptNautilusPaperExecutionForQuality(input());

  assert.equal(result.environment, "PAPER");
  assert.equal(result.source, "NAUTILUS_PAPER");
  assert.equal(result.fill.executionId, evidence.executionId);
  assert.equal(result.fill.quantity, evidence.quantity);
  assert.equal(result.fill.price, evidence.price);
  assert.equal(result.fill.fee?.value, evidence.fee.value);
  assert.equal(result.fill.fee?.currency, evidence.fee.asset);
  assert.equal(result.feeQuality, "SIMULATED_CONFIGURED_FEE");
  assert.equal(result.fill.liquidityRole, "MAKER");
  assert.deepEqual(result.fill.orderReferences, evidence.orderReferences);
});

test("preserves configured zero fee and missing fee distinctly", () => {
  const zero = adaptNautilusPaperExecutionForQuality(input({
    evidence: { ...evidence, fee: { value: "0", asset: "USDT", quality: "SIMULATED_CONFIGURED_FEE" } },
  })).fill;
  assert.equal(zero.fee?.value, "0");
  assert.equal(zero.fee?.quality, "VALID");

  const missing = adaptNautilusPaperExecutionForQuality(input({
    evidence: { ...evidence, fee: { value: null, asset: null, quality: "SIMULATED_CONFIGURED_FEE" } },
  })).fill;
  assert.equal(missing.fee?.value, null);
  assert.equal(missing.fee?.quality, "UNAVAILABLE");
});

test("marks a fee amount without an asset as partial evidence", () => {
  const result = adaptNautilusPaperExecutionForQuality(input({
    evidence: { ...evidence, fee: { value: "0.000000000000000007", asset: null, quality: "SIMULATED_CONFIGURED_FEE" } },
  })).fill;
  assert.equal(result.fee?.value, "0.000000000000000007");
  assert.equal(result.fee?.currency, null);
  assert.equal(result.fee?.quality, "PARTIAL");
});

test("keeps PAPER fills isolated from LIVE evidence", () => {
  assert.throws(
    () => adaptNautilusPaperExecutionForQuality(input({ accountIdentity: { ...account, environment: "LIVE" } })),
    /PAPER_ACCOUNT_REQUIRED/,
  );
  assert.throws(
    () => adaptNautilusPaperExecutionForQuality(input({ accountIdentity: { ...account, broker: "OTHER_PAPER" } })),
    /NAUTILUS_PAPER_ACCOUNT_REQUIRED/,
  );
  assert.throws(
    () => adaptNautilusPaperExecutionForQuality(input({ evidence: { ...evidence, source: "BINGX" as never } })),
    /PROVENANCE_NOT_NAUTILUS_PAPER/,
  );
});

test("rejects inconsistent runtime fee provenance and completeness", () => {
  assert.throws(
    () => adaptNautilusPaperExecutionForQuality(input({
      evidence: { ...evidence, fee: { ...evidence.fee, quality: "BROKER_OBSERVED" as never } },
    })),
    /INVALID_FEE_QUALITY/,
  );
  assert.throws(
    () => adaptNautilusPaperExecutionForQuality(input({ fillCompleteness: "UNKNOWN" as never })),
    /INVALID_FILL_COMPLETENESS/,
  );
});

test("uses the existing exact-decimal N9B arithmetic for PAPER fills", () => {
  const first = adaptNautilusPaperExecutionForQuality(input({
    evidence: { ...evidence, executionId: "fill-a", quantity: "0.000000000000000123", price: "1.000000000000000001" },
    fillCompleteness: "COMPLETE",
  })).fill;
  const second = adaptNautilusPaperExecutionForQuality(input({
    evidence: { ...evidence, executionId: "fill-b", quantity: "0.000000000000000123", price: "1.000000000000000001", eventTime: 2_000 },
    fillCompleteness: "COMPLETE",
  })).fill;
  const quality = buildOrderExecutionQuality({
    intent: {
      requestedSize: "0.000000000000000246",
      resolvedQuantity: "0.000000000000000246",
      limitPrice: "1.000000000000000001",
      decisionEvidence: null,
    },
    attempts: [],
    lifecycleStatus: "FILLED",
    fills: [first, second],
    fillCompleteness: "COMPLETE",
  });
  assert.equal(quality.quantities.factualFilled, "0.000000000000000246");
  assert.equal(quality.factualExecutionVwap, "1.000000000000000001");
  assert.equal(quality.fees.evidence, "FACTUAL");
});

test("does not claim complete VWAP or decision metrics without evidence", () => {
  const fill = adaptNautilusPaperExecutionForQuality(input()).fill;
  const quality = buildOrderExecutionQuality({
    intent: { requestedSize: "1", resolvedQuantity: "1", limitPrice: "1", decisionEvidence: null },
    attempts: [],
    lifecycleStatus: "PARTIALLY_FILLED",
    fills: [fill],
    fillCompleteness: "PARTIAL",
  });
  assert.equal(quality.factualExecutionVwap, null);
  assert.equal(quality.vwapVsRequestedLimit.absolute, null);
  assert.equal(quality.latencyMs.decisionToFirstFill, null);
  assert.equal(quality.fillCompleteness, "PARTIAL");
  assert.ok(quality.evidenceGaps.includes("MISSING_DECISION_AT"));
});

test("adapter output is deterministic and does not carry LIVE market context", () => {
  const a = adaptNautilusPaperExecutionForQuality(input());
  const b = adaptNautilusPaperExecutionForQuality(input());
  assert.deepEqual(a, b);
  assert.equal("decisionAt" in a, false);
  assert.equal("marketContext" in a, false);
});

test("exact strings are accepted by the shared economic fill contract", () => {
  const fill = createEconomicFill({
    ...input().evidence,
    accountIdentity: account,
    marketIdentity: { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" },
    quantity: evidence.quantity,
    price: evidence.price,
    eventTime: evidence.eventTime,
    fee: { value: evidence.fee.value, currency: evidence.fee.asset, quality: "VALID" },
    provenance: { source: "NAUTILUS_PAPER", executionId: evidence.executionId },
  });
  assert.equal(fill.quantity, evidence.quantity);
  assert.equal(fill.price, evidence.price);
});
