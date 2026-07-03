import test from "node:test";
import assert from "node:assert/strict";
import { defaultAlertPreferences } from "@shared/alerts";
import { ALERT_RULES } from "./alertCatalog";
import { detectGammaAndMarketAlerts, type GammaAlertSnapshot } from "./alertDetection";
import { createAlertPolicyState, evaluateAlertPolicy } from "./alertPolicyEngine";

const baseSnapshot: GammaAlertSnapshot = {
  symbol: "BTCUSDT",
  price: 100_000,
  tickerStatus: "fresh",
  gammaRegime: "LONG GAMMA",
  gammaFlip: 100_200,
  dealerPivot: 101_000,
  callWall: 105_000,
  putWall: 95_000,
};

test("detects gamma flip proximity and crossing from real snapshots", () => {
  const previous = { ...baseSnapshot, price: 99_900 };
  const current = { ...baseSnapshot, price: 100_250 };
  const alerts = detectGammaAndMarketAlerts(current, previous, {
    now: new Date("2026-06-25T12:00:00.000Z"),
    userId: "7",
    proximityThresholdPct: 0.004,
  });
  assert.ok(alerts.some((alert) => alert.type === "gamma.flip_approaching"));
  assert.ok(alerts.some((alert) => alert.type === "gamma.flip_crossed"));
});

test("suppresses duplicate approach alerts until the level is rearmed", () => {
  const state = createAlertPolicyState();
  const rule = ALERT_RULES["gamma.flip_approaching"]!;
  const prefs = defaultAlertPreferences("7");
  const candidate = detectGammaAndMarketAlerts(baseSnapshot, null, {
    now: new Date("2026-06-25T12:00:00.000Z"),
    userId: "7",
    proximityThresholdPct: 0.004,
  }).find((alert) => alert.type === "gamma.flip_approaching")!;

  const first = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date("2026-06-25T12:00:00.000Z"),
    environment: "desktop",
  });
  const duplicate = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date("2026-06-25T12:40:00.000Z"),
    environment: "desktop",
  });

  assert.equal(first.allowed, true);
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, "approach_zone_not_rearmed");
});

test("enforces cooldown for non critical alerts", () => {
  const state = createAlertPolicyState();
  const rule = ALERT_RULES["gamma.flip_crossed"]!;
  const prefs = defaultAlertPreferences("7");
  const candidate = {
    type: "gamma.flip_crossed",
    severity: "P1" as const,
    domain: "gamma" as const,
    symbol: "BTCUSDT",
    title: "Gamma Flip crossed",
    message: "Crossed",
    detectedAt: "2026-06-25T12:00:00.000Z",
    source: "test",
    deduplicationKey: "gamma.flip_crossed:BTCUSDT:100000:above",
    metadata: {},
  };

  assert.equal(
    evaluateAlertPolicy(state, rule, candidate, prefs, {
      now: new Date("2026-06-25T12:00:00.000Z"),
      environment: "desktop",
    }).allowed,
    true,
  );
  const duplicate = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date("2026-06-25T12:01:00.000Z"),
    environment: "desktop",
  });
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, "cooldown");
});

test("critical data-source alerts bypass global rate limits and require acknowledgement", () => {
  const state = createAlertPolicyState();
  const rule = ALERT_RULES["system.data_source_down"]!;
  const prefs = defaultAlertPreferences("7");
  const candidate = detectGammaAndMarketAlerts(
    { ...baseSnapshot, tickerStatus: "unavailable", price: null },
    baseSnapshot,
    { now: new Date("2026-06-25T12:00:00.000Z"), userId: "7" },
  ).find((alert) => alert.type === "system.data_source_down")!;

  const result = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date("2026-06-25T12:00:00.000Z"),
    environment: "desktop",
    maxPerMinute: 0,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.event?.severity, "P0");
  assert.equal(result.event?.requiresAcknowledgement, true);
});

test("P0 keeps in-app channel even when user disables severity channels", () => {
  const state = createAlertPolicyState();
  const rule = ALERT_RULES["system.data_source_down"]!;
  const prefs = {
    ...defaultAlertPreferences("7"),
    channelsBySeverity: {
      ...defaultAlertPreferences("7").channelsBySeverity,
      P0: [],
    },
  };
  const candidate = detectGammaAndMarketAlerts(
    { ...baseSnapshot, tickerStatus: "unavailable", price: null },
    baseSnapshot,
    { now: new Date("2026-06-25T12:00:00.000Z"), userId: "7" },
  ).find((alert) => alert.type === "system.data_source_down")!;
  const result = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date(2026, 5, 25, 12, 0, 0),
    environment: "desktop",
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.channels, ["in_app"]);
});

test("quiet hours suppress non-critical native channels but not in-app", () => {
  const state = createAlertPolicyState();
  const rule = ALERT_RULES["gamma.flip_crossed"]!;
  const prefs = {
    ...defaultAlertPreferences("7"),
    quietHours: { enabled: true, start: "11:00", end: "13:00", timezone: "local" },
  };
  const candidate = {
    type: "gamma.flip_crossed",
    severity: "P1" as const,
    domain: "gamma" as const,
    symbol: "BTCUSDT",
    title: "Gamma Flip crossed",
    message: "Crossed",
    detectedAt: "2026-06-25T12:00:00.000Z",
    source: "test",
    deduplicationKey: "gamma.flip_crossed:BTCUSDT:100000:above",
    metadata: {},
  };
  const result = evaluateAlertPolicy(state, rule, candidate, prefs, {
    now: new Date(2026, 5, 25, 12, 0, 0),
    environment: "desktop",
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.channels, ["in_app"]);
});

test("detects stale data separately from unavailable source", () => {
  const alerts = detectGammaAndMarketAlerts(
    { ...baseSnapshot, tickerStatus: "stale" },
    baseSnapshot,
    { now: new Date("2026-06-25T12:00:00.000Z"), userId: "7" },
  );
  assert.ok(alerts.some((alert) => alert.type === "system.stale_data"));
  assert.equal(alerts.some((alert) => alert.type === "system.data_source_down"), false);
});
