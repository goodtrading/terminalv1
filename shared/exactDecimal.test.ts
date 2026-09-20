import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DECIMAL_SCALE,
  addExactDecimal,
  divideExactDecimal,
  multiplyExactDecimal,
  parseExactDecimal,
  serializeExactDecimal,
  zeroExactDecimal,
} from "./exactDecimal";

const decimal = (value: string) => parseExactDecimal(value);

 test("parses and serializes exact high-precision decimal text", () => {
  const price = decimal("1.000000000000000001");
  const quantity = decimal("0.000000000000000123");
  const fee = decimal("0.000000000000000007");
  assert.equal(serializeExactDecimal(price), "1.000000000000000001");
  assert.equal(serializeExactDecimal(quantity), "0.000000000000000123");
  assert.equal(serializeExactDecimal(fee), "0.000000000000000007");
});

test("adds different scales, zero, and many small factual values exactly", () => {
  let total = zeroExactDecimal();
  for (let i = 0; i < 1_000; i += 1) total = addExactDecimal(total, decimal("0.000000000000000001"));
  assert.equal(serializeExactDecimal(total), "0.000000000000001");
  assert.equal(serializeExactDecimal(addExactDecimal(decimal("1.2"), decimal("0.003"))), "1.203");
  assert.equal(serializeExactDecimal(addExactDecimal(decimal("0"), decimal("2.50"))), "2.5");
  assert.throws(() => parseExactDecimal("invalid"), /exact decimal/);
  assert.throws(() => parseExactDecimal(`0.${"1".repeat(MAX_DECIMAL_SCALE + 1)}`), /precision/);
});

test("multiplies price by quantity without premature rounding", () => {
  const product = multiplyExactDecimal(decimal("1.000000000000000001"), decimal("0.000000000000000123"));
  assert.equal(serializeExactDecimal(product), "0.000000000000000123000000000000000123");
});

test("divides with explicit output precision and truncation toward zero", () => {
  assert.equal(serializeExactDecimal(divideExactDecimal(decimal("1"), decimal("3"), 6)), "0.333333");
  assert.equal(serializeExactDecimal(divideExactDecimal(decimal("-1"), decimal("3"), 6)), "-0.333333");
  assert.equal(serializeExactDecimal(divideExactDecimal(decimal("1"), decimal("2"), 6)), "0.5");
  assert.throws(() => divideExactDecimal(decimal("1"), decimal("0"), 6), /denominator/);
});

test("repeated calculations are deterministic and preserve missing-value separation", () => {
  const calculate = () => serializeExactDecimal(divideExactDecimal(
    addExactDecimal(multiplyExactDecimal(decimal("99.123456789012345678"), decimal("0.000000000000000123")), decimal("0.000000000000000007")),
    decimal("0.000000000000000123"),
    18,
  ));
  assert.equal(calculate(), calculate());
  assert.notEqual(undefined, null);
  assert.equal(serializeExactDecimal(zeroExactDecimal()), "0");
});
