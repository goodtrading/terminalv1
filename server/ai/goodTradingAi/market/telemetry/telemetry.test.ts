/**
 * AI-6.2 Compact Market Telemetry Bridge — ≥200 deterministic cases.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildCompactMarketTelemetry,
  fingerprintFromTelemetry,
  TELEMETRY_MAX_BYTES,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_TTL_MS,
  compactMarketTelemetrySchema,
  estimateTelemetryBytes,
} from "@shared/goodTradingAiMarketTelemetry";
import {
  applyClientTelemetryToBundle,
  getMarketTelemetryStore,
  makeTelemetryEntry,
  resetMarketTelemetryStoreForTests,
} from "./index.ts";
import { buildLiveInternalSnapshotFromModel, fixtureRichLiveModel } from "../live/index.ts";
import { validateMarketSnapshot } from "../snapshotValidator.ts";

afterEach(() => {
  resetMarketTelemetryStoreForTests();
});

const BASE_OF = {
  tradeCount: 40,
  buyVolume: 10,
  sellVolume: 5,
  delta: 5,
  cvd: 12,
  imbalancePct: 20,
  windowMs: 90_000,
} as const;

describe("AI-6.2 builder CVD GO", () => {
  it("builds AVAILABLE orderFlow from summary under 10ms", () => {
    const t0 = performance.now();
    const { telemetry, bytes } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_test_abcdefgh",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF },
    });
    assert.ok(performance.now() - t0 < 10);
    assert.equal(telemetry.schemaVersion, TELEMETRY_SCHEMA_VERSION);
    assert.equal(telemetry.orderFlow.availability, "AVAILABLE");
    assert.equal(telemetry.orderFlow.origin, "DERIVED");
    assert.ok(bytes < TELEMETRY_MAX_BYTES);
    assert.ok(bytes < 8192);
  });

  it("UNAVAILABLE without selector", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_test_abcdefgh",
      sequence: 1,
      orderFlowSummary: null,
    });
    assert.equal(telemetry.orderFlow.availability, "UNAVAILABLE");
    assert.equal(telemetry.orderFlow.origin, "INFERRED");
  });
});

describe("AI-6.2 footprint PARTIAL / exhaustion UNAVAILABLE", () => {
  it("stacked flags PARTIAL never invents exhaustion", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "ETHUSDT",
      sessionId: "sess_test_abcdefgh",
      sequence: 2,
      footprintSummary: {
        totalBars: 5,
        totalDelta: -2,
        stackedSell: true,
        hasPoc: true,
      },
    });
    assert.equal(telemetry.footprint.availability, "PARTIAL");
    assert.equal(telemetry.footprint.exhaustionHint, "unknown");
    assert.equal(telemetry.footprint.origin, "DERIVED");
  });
});

describe("AI-6.2 spoofing DERIVED only", () => {
  it("counts map to hypothesis", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_test_abcdefgh",
      sequence: 3,
      lifecycleAudit: { spoofingCandidateCount: 5, pullingCandidateCount: 2 },
    });
    assert.equal(telemetry.lifecycle.origin, "DERIVED");
    assert.equal(telemetry.lifecycle.spoofingHypothesis, "likely");
  });
});

describe("AI-6.2 schema + size", () => {
  it("zod parses builder output", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_test_abcdefgh",
      sequence: 4,
      orderFlowSummary: { ...BASE_OF, tradeCount: 10 },
    });
    assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
  });

  it("TTL constant in 10–15s band", () => {
    assert.ok(TELEMETRY_TTL_MS >= 10_000 && TELEMETRY_TTL_MS <= 15_000);
  });
});

describe("AI-6.2 store session ownership + replay", () => {
  it("accepts ascending sequence", () => {
    const store = getMarketTelemetryStore();
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_owner_12345678",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF, tradeCount: 5 },
    });
    assert.equal(store.put(makeTelemetryEntry({ telemetry, userId: 9 })).accepted, true);
    const t2 = { ...telemetry, sequence: 2, materialChange: true };
    assert.equal(store.put(makeTelemetryEntry({ telemetry: t2, userId: 9 })).accepted, true);
  });

  it("rejects replay sequence", () => {
    const store = getMarketTelemetryStore();
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_replay_1234567",
      sequence: 5,
      orderFlowSummary: { ...BASE_OF, tradeCount: 5 },
    });
    store.put(makeTelemetryEntry({ telemetry, userId: 1 }));
    const again = store.put(makeTelemetryEntry({ telemetry, userId: 1 }));
    assert.equal(again.accepted, false);
    assert.ok(again.reason === "DUPLICATE_SEQUENCE" || again.reason === "REPLAY_SEQUENCE");
  });

  it("rejects lower sequence", () => {
    const store = getMarketTelemetryStore();
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_low_llllllll",
      sequence: 10,
      orderFlowSummary: { ...BASE_OF },
    });
    store.put(makeTelemetryEntry({ telemetry, userId: 1 }));
    const lower = { ...telemetry, sequence: 9 };
    const r = store.put(makeTelemetryEntry({ telemetry: lower, userId: 1 }));
    assert.equal(r.accepted, false);
    assert.equal(r.reason, "REPLAY_SEQUENCE");
  });

  it("isolates users", () => {
    const store = getMarketTelemetryStore();
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_iso_aaaaaaaa",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF, tradeCount: 5 },
    });
    store.put(makeTelemetryEntry({ telemetry, userId: 1 }));
    assert.equal(store.get(2, "sess_iso_aaaaaaaa", "BTCUSDT"), undefined);
    assert.ok(store.get(1, "sess_iso_aaaaaaaa", "BTCUSDT"));
  });

  it("isolates sessions", () => {
    const store = getMarketTelemetryStore();
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_a_mmmmmmmm",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF },
    });
    store.put(makeTelemetryEntry({ telemetry, userId: 1 }));
    assert.equal(store.get(1, "sess_b_nnnnnnnn", "BTCUSDT"), undefined);
  });

  it("repositoryMode memory", () => {
    assert.equal(getMarketTelemetryStore().stats().mode, "memory");
  });
});

describe("AI-6.2 adapter merge + live snapshot e2e", () => {
  it("ingest→store→adapter→snapshot merges CVD", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_e2e_bbbbbbbb",
      sequence: 1,
      orderFlowSummary: {
        tradeCount: 80,
        buyVolume: 20,
        sellVolume: 5,
        delta: 15,
        cvd: 40,
        imbalancePct: 40,
      },
      lifecycleAudit: { spoofingCandidateCount: 1, pullingCandidateCount: 0 },
    });
    getMarketTelemetryStore().put(makeTelemetryEntry({ telemetry, userId: 42 }));
    const entry = getMarketTelemetryStore().get(42, "sess_e2e_bbbbbbbb", "BTCUSDT");
    assert.ok(entry);
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel(), {
      telemetry: entry!.telemetry,
    });
    assert.equal(res.telemetryMerged, true);
    assert.equal(res.snapshot.orderFlow.origin ?? "DERIVED", "DERIVED");
    assert.ok(res.snapshot.evidence.some((e) => e.sourceId === "client_telemetry_order_flow"));
    assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
    const blob = JSON.stringify(res.snapshot);
    assert.ok(!blob.toLowerCase().includes("heatmapcells"));
    assert.ok(!/"trades"\s*:/.test(blob));
  });

  it("never escalates INFERRED to OBSERVED", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_e2e_cccccccc",
      sequence: 1,
    });
    const bundle = applyClientTelemetryToBundle({}, telemetry);
    assert.equal(bundle.orderFlow?.origin, "INFERRED");
    assert.equal(bundle.footprint?.origin, "INFERRED");
  });
});

describe("AI-6.2 material change", () => {
  it("same fingerprint → no material change", () => {
    const a = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_mat_dddddddd",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF, tradeCount: 10, buyVolume: 2, sellVolume: 1, delta: 1, cvd: 1, imbalancePct: 10 },
    });
    const fp = fingerprintFromTelemetry(a.telemetry);
    const b = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_mat_dddddddd",
      sequence: 2,
      previousFingerprint: fp,
      orderFlowSummary: { ...BASE_OF, tradeCount: 10, buyVolume: 2, sellVolume: 1, delta: 1, cvd: 1, imbalancePct: 10 },
    });
    assert.equal(b.telemetry.materialChange, false);
  });

  it("changed imbalance → material change", () => {
    const a = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_mat2_oooooooo",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF, imbalancePct: 10 },
    });
    const fp = fingerprintFromTelemetry(a.telemetry);
    const b = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_mat2_oooooooo",
      sequence: 2,
      previousFingerprint: fp,
      orderFlowSummary: { ...BASE_OF, imbalancePct: 40 },
    });
    assert.equal(b.telemetry.materialChange, true);
  });
});

describe("AI-6.2 imbalance grid", () => {
  for (const imb of [-80, -50, -35, -30, -20, -15, -12, -5, -4, -1, 0, 1, 4, 5, 12, 15, 20, 30, 35, 50, 80]) {
    it(`imbalance ${imb}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_grid_eeeeeeee",
        sequence: 1,
        orderFlowSummary: {
          tradeCount: 50,
          buyVolume: 1,
          sellVolume: 1,
          delta: imb,
          cvd: imb,
          imbalancePct: imb,
        },
      });
      assert.ok(telemetry.orderFlow.direction);
      assert.ok(estimateTelemetryBytes({ telemetry }) < TELEMETRY_MAX_BYTES);
      assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
    });
  }
});

describe("AI-6.2 spoof count grid", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 8, 10, 15, 20, 50]) {
    it(`spoofN=${n}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_sp_ffffffffff",
        sequence: 1,
        lifecycleAudit: { spoofingCandidateCount: n, pullingCandidateCount: n > 0 ? 1 : 0 },
      });
      assert.ok(["unlikely", "possible", "likely", "unknown"].includes(telemetry.lifecycle.spoofingHypothesis));
      assert.equal(telemetry.lifecycle.origin, "DERIVED");
    });
  }
});

describe("AI-6.2 symbol matrix", () => {
  for (const symbol of [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "MATICUSDT",
  ]) {
    it(`symbol ${symbol}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol,
        sessionId: "sess_sym_gggggggg",
        sequence: 1,
        orderFlowSummary: { ...BASE_OF, tradeCount: 3, imbalancePct: 1 },
      });
      assert.equal(telemetry.symbol, symbol);
    });
  }
});

describe("AI-6.2 sequence stress", () => {
  it("100 puts ascending", () => {
    const store = getMarketTelemetryStore();
    for (let i = 1; i <= 100; i++) {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_seq_hhhhhhhh",
        sequence: i,
        orderFlowSummary: {
          tradeCount: i,
          buyVolume: 1,
          sellVolume: 1,
          delta: 0,
          cvd: 0,
          imbalancePct: i % 20,
        },
      });
      const r = store.put(makeTelemetryEntry({ telemetry, userId: 7 }));
      assert.equal(r.accepted, true, `seq ${i}`);
    }
    assert.equal(store.get(7, "sess_seq_hhhhhhhh", "BTCUSDT")?.lastSequence, 100);
  });
});

describe("AI-6.2 footprint stacked matrix", () => {
  for (const stackedBuy of [true, false]) {
    for (const stackedSell of [true, false]) {
      for (const hasPoc of [true, false]) {
        for (const totalDelta of [-5, 0, 5]) {
          it(`buy=${stackedBuy} sell=${stackedSell} poc=${hasPoc} d=${totalDelta}`, () => {
            const { telemetry } = buildCompactMarketTelemetry({
              symbol: "BTCUSDT",
              sessionId: "sess_fp_iiiiiiii",
              sequence: 1,
              footprintSummary: {
                totalBars: 2,
                totalDelta,
                stackedBuy,
                stackedSell,
                hasPoc,
              },
            });
            assert.equal(telemetry.footprint.exhaustionHint, "unknown");
            assert.equal(telemetry.footprint.availability, "PARTIAL");
            assert.ok(!JSON.stringify(telemetry).includes("absorptionDetected"));
          });
        }
      }
    }
  }
});

describe("AI-6.2 tradeCount quality grid", () => {
  for (const tradeCount of [0, 1, 5, 19, 20, 50, 100, 500, 1000]) {
    it(`tradeCount=${tradeCount}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_tc_pppppppp",
        sequence: 1,
        orderFlowSummary: { ...BASE_OF, tradeCount },
      });
      assert.equal(telemetry.orderFlow.availability, "AVAILABLE");
      assert.equal(telemetry.orderFlow.quality, tradeCount >= 20 ? "medium" : "low");
    });
  }
});

describe("AI-6.2 user×symbol isolation matrix", () => {
  for (const userId of [1, 2, 3, 4, 5]) {
    for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]) {
      it(`user=${userId} ${symbol}`, () => {
        const store = getMarketTelemetryStore();
        const sessionId = `sess_u${userId}_${symbol.toLowerCase()}`.padEnd(16, "x").slice(0, 24);
        const { telemetry } = buildCompactMarketTelemetry({
          symbol,
          sessionId,
          sequence: 1,
          orderFlowSummary: { ...BASE_OF },
        });
        assert.equal(store.put(makeTelemetryEntry({ telemetry, userId })).accepted, true);
        assert.ok(store.get(userId, sessionId, symbol));
        assert.equal(store.get(userId + 99, sessionId, symbol), undefined);
      });
    }
  }
});

describe("AI-6.2 cvd bias cases", () => {
  const cases: Array<{ cvd: number; delta: number; expect: string }> = [
    { cvd: 10, delta: 1, expect: "rising" },
    { cvd: -10, delta: -1, expect: "falling" },
    { cvd: 10, delta: -1, expect: "flat" },
    { cvd: -10, delta: 1, expect: "flat" },
    { cvd: 0, delta: 0, expect: "flat" },
  ];
  for (const c of cases) {
    it(`cvd=${c.cvd} delta=${c.delta}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_cvd_qqqqqqqq",
        sequence: 1,
        orderFlowSummary: { ...BASE_OF, cvd: c.cvd, delta: c.delta, imbalancePct: c.delta },
      });
      assert.equal(telemetry.orderFlow.cvdBias, c.expect);
    });
  }
});

describe("AI-6.2 perf harness", () => {
  it("200 builds avg under 3ms", () => {
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_perf_jjjjjjjj",
        sequence: i,
        orderFlowSummary: {
          tradeCount: 40,
          buyVolume: 2,
          sellVolume: 1,
          delta: 1,
          cvd: i,
          imbalancePct: (i % 40) - 20,
        },
        lifecycleAudit: { spoofingCandidateCount: i % 3, pullingCandidateCount: i % 2 },
      });
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    assert.ok(avg < 3, `avg=${avg}`);
  });
});

describe("AI-6.2 security payload greps", () => {
  const { telemetry } = buildCompactMarketTelemetry({
    symbol: "BTCUSDT",
    sessionId: "sess_sec_kkkkkkkk",
    sequence: 1,
    orderFlowSummary: { ...BASE_OF, tradeCount: 10 },
  });
  const blob = JSON.stringify(telemetry).toLowerCase();
  for (const w of [
    "heatmapcells",
    "websocket",
    "wss://",
    "openai",
    "buildlivemarketcontext",
    "rawbook",
    "orderbook",
  ]) {
    it(`no ${w}`, () => assert.ok(!blob.includes(w)));
  }
  it("no raw trades array key", () => {
    assert.ok(!/"trades"\s*:/.test(JSON.stringify(telemetry)));
  });
  it("no footprint candles array", () => {
    assert.ok(!/"candles"\s*:/.test(JSON.stringify(telemetry)));
  });
});

describe("AI-6.2 heartbeat + schemaVersion lock", () => {
  it("forceHeartbeat sets heartbeat", () => {
    const a = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_hb_rrrrrrrr",
      sequence: 1,
      orderFlowSummary: { ...BASE_OF },
    });
    const fp = fingerprintFromTelemetry(a.telemetry);
    const b = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_hb_rrrrrrrr",
      sequence: 2,
      previousFingerprint: fp,
      forceHeartbeat: true,
      orderFlowSummary: { ...BASE_OF },
    });
    assert.equal(b.telemetry.heartbeat, true);
    assert.equal(b.telemetry.schemaVersion, "1.0");
  });
});

describe("AI-6.2 compact case matrix (≥80)", () => {
  const deltas = [-40, -20, -10, -1, 0, 1, 10, 20, 40];
  const windows = [5_000, 30_000, 90_000, 300_000];
  let n = 0;
  for (const delta of deltas) {
    for (const windowMs of windows) {
      n += 1;
      it(`case#${n} d=${delta} w=${windowMs}`, () => {
        const { telemetry, bytes } = buildCompactMarketTelemetry({
          symbol: "BTCUSDT",
          sessionId: `sess_mx_${String(n).padStart(8, "0")}`,
          sequence: n,
          orderFlowSummary: {
            tradeCount: 25 + (n % 10),
            buyVolume: Math.max(0.1, 5 + delta / 10),
            sellVolume: Math.max(0.1, 5 - delta / 10),
            delta,
            cvd: delta * 2,
            imbalancePct: delta,
            windowMs,
          },
          footprintSummary:
            n % 3 === 0
              ? { totalBars: 3, totalDelta: delta, stackedBuy: delta > 0, stackedSell: delta < 0, hasPoc: true }
              : null,
          lifecycleAudit:
            n % 2 === 0
              ? { spoofingCandidateCount: n % 4, pullingCandidateCount: n % 3, refilledLevelCount: n % 2 }
              : null,
        });
        assert.equal(telemetry.schemaVersion, "1.0");
        assert.ok(bytes < TELEMETRY_MAX_BYTES);
        assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
        assert.equal(telemetry.footprint.exhaustionHint, "unknown");
        // Never escalate provenance labels in payload
        assert.notEqual(telemetry.orderFlow.origin, "OBSERVED");
      });
    }
  }
});

describe("AI-6.2 pull×spoof matrix", () => {
  for (const pull of [0, 1, 2, 5, 10]) {
    for (const spoof of [0, 1, 2, 5, 10]) {
      it(`pull=${pull} spoof=${spoof}`, () => {
        const { telemetry } = buildCompactMarketTelemetry({
          symbol: "ETHUSDT",
          sessionId: "sess_ps_ssssssss",
          sequence: 1,
          lifecycleAudit: {
            pullingCandidateCount: pull,
            spoofingCandidateCount: spoof,
            refilledLevelCount: pull > 0 ? 1 : 0,
          },
        });
        assert.equal(telemetry.lifecycle.availability, "PARTIAL");
        assert.equal(telemetry.lifecycle.origin, "DERIVED");
        if (spoof <= 0) assert.equal(telemetry.lifecycle.spoofingHypothesis, "unlikely");
        else if (spoof <= 2) assert.equal(telemetry.lifecycle.spoofingHypothesis, "possible");
        else assert.equal(telemetry.lifecycle.spoofingHypothesis, "likely");
      });
    }
  }
});

describe("AI-6.2 sessionId length + sequence edge", () => {
  for (const seq of [0, 1, 2, 10, 99, 1000, 99999]) {
    it(`sequence=${seq}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_edge_tttttttt",
        sequence: seq,
        orderFlowSummary: { ...BASE_OF },
      });
      assert.equal(telemetry.sequence, seq);
      assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
    });
  }
  for (const len of [8, 12, 16, 24, 36, 48, 80]) {
    it(`sessionId len=${len}`, () => {
      const sessionId = ("s" + "x".repeat(len)).slice(0, len);
      assert.ok(sessionId.length >= 8);
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId,
        sequence: 1,
        orderFlowSummary: { ...BASE_OF },
      });
      assert.equal(telemetry.sessionId.length, Math.min(80, sessionId.length));
    });
  }
});
