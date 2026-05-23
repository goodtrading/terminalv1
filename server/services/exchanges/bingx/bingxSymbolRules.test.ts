/**
 * BingX symbol rules tests — quantity normalization and validation.
 * Run: npm run test:bingx-symbol-rules
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuantity,
  formatQuantityForBingX,
  validateQuantityAgainstRules,
} from "./bingxSymbolRulesService";
import type { BingXSymbolRules } from "./bingxSymbolRulesService";

const mockRules: BingXSymbolRules = {
  symbol: "BTC-USDT",
  minQty: 0.001,
  maxQty: 1000,
  stepSize: 0.001,
  quantityPrecision: 3,
  pricePrecision: 2,
  minNotional: 5,
};

test("normalizeQuantity floors to step size", () => {
  const result = normalizeQuantity(0.0015, 0.001, 3);
  assert.equal(result, 0.001);
});

test("normalizeQuantity rounds to precision", () => {
  const result = normalizeQuantity(0.0012345, 0.001, 3);
  assert.equal(result, 0.001);
});

test("normalizeQuantity handles exact step", () => {
  const result = normalizeQuantity(0.003, 0.001, 3);
  assert.equal(result, 0.003);
});

test("normalizeQuantity rejects invalid quantity", () => {
  assert.throws(() => normalizeQuantity(0, 0.001, 3));
  assert.throws(() => normalizeQuantity(-1, 0.001, 3));
  assert.throws(() => normalizeQuantity(NaN, 0.001, 3));
});

test("normalizeQuantity rejects invalid step size", () => {
  assert.throws(() => normalizeQuantity(0.001, 0, 3));
  assert.throws(() => normalizeQuantity(0.001, -0.001, 3));
});

test("formatQuantityForBingX uses correct precision", () => {
  const result = formatQuantityForBingX(0.001, 3);
  assert.equal(result, "0.001");
});

test("formatQuantityForBingX removes trailing zeros", () => {
  const result = formatQuantityForBingX(0.0010, 3);
  assert.equal(result, "0.001");
});

test("formatQuantityForBingX handles small numbers without scientific notation", () => {
  const result = formatQuantityForBingX(0.0001, 4);
  assert.equal(result, "0.0001");
});

test("formatQuantityForBingX rejects invalid quantity", () => {
  assert.throws(() => formatQuantityForBingX(0, 3));
  assert.throws(() => formatQuantityForBingX(-1, 3));
  assert.throws(() => formatQuantityForBingX(NaN, 3));
});

test("validateQuantityAgainstRules passes for valid quantity", () => {
  const result = validateQuantityAgainstRules(0.01, 50000, mockRules);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedQty, 0.01);
});

test("validateQuantityAgainstRules blocks below minQty", () => {
  const result = validateQuantityAgainstRules(0.0005, 50000, mockRules);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("below BingX minimum"));
  assert.ok(result.requiredMinNotional != null);
  assert.equal(result.requiredMinNotional, 50); // 0.001 * 50000
});

test("validateQuantityAgainstRules blocks above maxQty", () => {
  const result = validateQuantityAgainstRules(2000, 50000, mockRules);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("exceeds BingX maximum"));
});

test("validateQuantityAgainstRules blocks below minNotional", () => {
  const rules = { ...mockRules, minQty: 0.0001, minNotional: 10 };
  const result = validateQuantityAgainstRules(0.0002, 50000, rules);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("below BingX minimum"));
  assert.equal(result.requiredMinNotional, 10);
});

test("validateQuantityAgainstRules normalizes quantity", () => {
  const result = validateQuantityAgainstRules(0.0012345, 50000, mockRules);
  assert.equal(result.valid, true);
  assert.equal(result.normalizedQty, 0.001);
});

test("validateQuantityAgainstRules rejects invalid raw quantity", () => {
  const result = validateQuantityAgainstRules(0, 50000, mockRules);
  assert.equal(result.valid, false);
  assert.equal(result.error, "Invalid quantity");
});

test("validateQuantityAgainstRules handles 2 USDT at 76500 (below min)", () => {
  const result = validateQuantityAgainstRules(2 / 76500, 76500, mockRules);
  assert.equal(result.valid, false);
  assert.ok(result.error?.includes("below BingX minimum"));
  // 2 USDT / 76500 = 0.00002614 BTC, which is below 0.001 minQty
  assert.ok(result.requiredMinNotional != null);
  assert.ok(result.requiredMinNotional > 2);
});

test("validateQuantityAgainstRules passes for 10 USDT at 76500", () => {
  const result = validateQuantityAgainstRules(10 / 76500, 76500, mockRules);
  assert.equal(result.valid, true);
  // 10 USDT / 76500 = 0.0001307 BTC, which normalizes to 0.001 (min step)
  assert.equal(result.normalizedQty, 0.001);
});
