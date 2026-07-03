import assert from "node:assert/strict";
import test from "node:test";
import {
  alertMatchesSymbol,
  buildAlertCenterQueryFilters,
  resetAlertFilters,
  type AlertStatusFilter,
} from "./AlertCenterFilters";

test("AlertCenter status filter starts at all, changes to unread, and returns to all", () => {
  const initial = resetAlertFilters();
  assert.equal(initial.statusFilter, "all");
  assert.deepEqual(buildAlertCenterQueryFilters(initial.statusFilter, initial.severity, initial.domain), {
    limit: 80,
    unreadOnly: undefined,
    status: undefined,
    severity: undefined,
    domain: undefined,
  });

  const unread: AlertStatusFilter = "unread";
  assert.deepEqual(buildAlertCenterQueryFilters(unread, "all", "all"), {
    limit: 80,
    unreadOnly: true,
    status: undefined,
    severity: undefined,
    domain: undefined,
  });

  const allAgain: AlertStatusFilter = "all";
  assert.deepEqual(buildAlertCenterQueryFilters(allAgain, "all", "all"), {
    limit: 80,
    unreadOnly: undefined,
    status: undefined,
    severity: undefined,
    domain: undefined,
  });
});

test("AlertCenter clear filters resets status, severity, domain, and symbol", () => {
  assert.deepEqual(resetAlertFilters(), {
    statusFilter: "all",
    severity: "all",
    domain: "all",
    symbol: "",
  });
});

test("AlertCenter symbol filter accepts common BTCUSDT variants", () => {
  assert.equal(alertMatchesSymbol("BTCUSDT", "BTC"), true);
  assert.equal(alertMatchesSymbol("BTC-USDT", "BTCUSDT"), true);
  assert.equal(alertMatchesSymbol("BTC/USDT", "BTC-USDT"), true);
  assert.equal(alertMatchesSymbol("ETHUSDT", "BTC"), false);
});
