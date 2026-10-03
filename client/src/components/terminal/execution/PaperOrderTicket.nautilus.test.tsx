import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveNautilusPaperTicketQuantityText,
  resolvePaperTicketSubmitState,
} from "./PaperOrderTicket";

test("Nautilus ticket preserves direct BTC quantity text exactly", () => {
  assert.equal(
    resolveNautilusPaperTicketQuantityText("btc", "0.123456789123456789"),
    "0.123456789123456789",
  );
});

test("Nautilus ticket rejects USDT-derived quantity text", () => {
  assert.throws(
    () => resolveNautilusPaperTicketQuantityText("usdt", "0.00000001"),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "NAUTILUS_EXACT_BASE_QUANTITY_REQUIRED",
  );
});

test("Nautilus ticket rejects missing direct BTC quantity text", () => {
  assert.throws(
    () => resolveNautilusPaperTicketQuantityText("btc", "  "),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "NAUTILUS_DECIMAL_QUANTITY_REQUIRED",
  );
});


test("stale PAPER feed disables the market submit control with a visible reason", () => {
  assert.deepEqual(
    resolvePaperTicketSubmitState({
      marketReady: true,
      tradingBlocked: true,
      blockReason: "Fresh factual BTCUSDT-PERP quote unavailable; new PAPER entries are disabled.",
    }),
    {
      disabled: true,
      reason: "Fresh factual BTCUSDT-PERP quote unavailable; new PAPER entries are disabled.",
    },
  );
});
