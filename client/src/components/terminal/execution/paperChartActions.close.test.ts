import assert from "node:assert/strict";
import test from "node:test";
import { assertFilledPaperCloseOrder, closeQuantityText, isExecutableNautilusCloseQuantity } from "./paperChartActions";

test("a non-filled close result is surfaced instead of treated as success", () => {
  assert.doesNotThrow(() => assertFilledPaperCloseOrder({ status: "FILLED", quantity: "0.001" }));
  assert.throws(
    () => assertFilledPaperCloseOrder({ status: "ACCEPTED", quantity: "0.001" }),
    /Paper close order was not filled \(status: ACCEPTED\)/,
  );
  assert.throws(
    () => assertFilledPaperCloseOrder({}),
    /Paper close order was not filled \(status: UNKNOWN\)/,
  );
});
test("close quantity keeps exact decimal text for partial percentages", () => {
  assert.equal(closeQuantityText(0.01, 25), "0.0025");
  assert.equal(closeQuantityText(0.001, 50), "0.0005");
  assert.equal(closeQuantityText(0.01, 100), "0.01");
});

test("Nautilus paper increment rejects a 50% close of 0.001 BTC", () => {
  assert.equal(isExecutableNautilusCloseQuantity("0.0005"), false);
  assert.equal(isExecutableNautilusCloseQuantity("0.001"), true);
  assert.equal(isExecutableNautilusCloseQuantity("0.002"), true);
});

test("Nautilus valid partial quantities remain exact and aligned", () => {
  assert.equal(closeQuantityText(0.002, 50), "0.001");
  assert.equal(isExecutableNautilusCloseQuantity(closeQuantityText(0.002, 50)), true);
  assert.equal(closeQuantityText(0.01, 50), "0.005");
  assert.equal(isExecutableNautilusCloseQuantity(closeQuantityText(0.01, 50)), true);
  assert.equal(closeQuantityText(0.002, 75), "0.0015");
  assert.equal(isExecutableNautilusCloseQuantity(closeQuantityText(0.002, 75)), false);
  assert.equal(closeQuantityText(0.002, 100), "0.002");
  assert.equal(isExecutableNautilusCloseQuantity(closeQuantityText(0.002, 100)), true);
});

test("close quantity rejects invalid percentage or position values", () => {
  assert.throws(() => closeQuantityText(0, 50), /Invalid close quantity/);
  assert.throws(() => closeQuantityText(0.01, 0), /Invalid close quantity/);
  assert.throws(() => closeQuantityText(0.01, 101), /Invalid close quantity/);
});
