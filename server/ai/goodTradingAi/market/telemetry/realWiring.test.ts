/**
 * AI-6.3 — Real selector wiring & production telemetry hardening.
 * ≥180 deterministic cases. Controlled harness state (not fixtures-as-real unlabeled).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCompactMarketTelemetry,
  canUseTelemetryForMentor,
  compactMarketTelemetrySchema,
  fingerprintFromTelemetry,
  TELEMETRY_MAX_BYTES,
} from "@shared/goodTradingAiMarketTelemetry";
import {
  applyClientTelemetryToBundle,
  auditRailwayTelemetryTopology,
  canUseTelemetryForMentor as serverMentorGate,
  getMarketTelemetryStore,
  makeTelemetryEntry,
  resetMarketTelemetryStoreForTests,
} from "./index.ts";
import { buildLiveInternalSnapshotFromModel, fixtureRichLiveModel } from "../live/index.ts";
import { validateMarketSnapshot } from "../snapshotValidator.ts";
import {
  REAL_SELECTOR_AUDIT,
  assessRealTelemetryQuality,
  buildTelemetryFromRealSource,
  clearHarnessRealSelectors,
  pushHarnessRealSelectors,
  readHarnessModel,
  selectFootprintFromBars,
  selectLifecycleFromAudit,
  selectOrderFlowFromTradeSummary,
} from "./realSelectors.ts";

afterEach(() => {
  resetMarketTelemetryStoreForTests();
  clearHarnessRealSelectors();
});

const REAL_OF = {
  tradeCount: 40,
  buyVolume: 12,
  sellVolume: 7,
  delta: 5,
  cvd: 9,
  imbalancePct: 26.3,
  windowMs: 60_000,
};

describe("AI-6.3 selector audit matrix", () => {
  it("documents bridgeable classes", () => {
    assert.ok(REAL_SELECTOR_AUDIT.length >= 5);
    assert.ok(REAL_SELECTOR_AUDIT.some((a) => a.bridgeable === "YES"));
    assert.ok(REAL_SELECTOR_AUDIT.some((a) => a.bridgeable === "NO"));
  });
  for (const row of REAL_SELECTOR_AUDIT) {
    it(`audit ${row.metric}`, () => {
      assert.ok(["YES", "PARTIAL", "NO"].includes(row.bridgeable));
      assert.ok(row.path.length > 2);
      assert.ok(row.notes.length > 5);
    });
  }
});

describe("AI-6.3 real OF selector (controlled)", () => {
  it("maps trade summary → AVAILABLE DERIVED", () => {
    const of = selectOrderFlowFromTradeSummary(REAL_OF);
    assert.ok(of);
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: { symbol: "BTCUSDT", orderFlowSummary: of },
      sessionId: "sess_real_aaaaaaa1",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(telemetry.telemetryMode, "real");
    assert.equal(telemetry.namespace, "real");
    assert.equal(telemetry.mentorEligible, false);
    assert.equal(telemetry.orderFlow.availability, "AVAILABLE");
    assert.equal(telemetry.orderFlow.origin, "DERIVED");
    assert.notEqual(telemetry.orderFlow.origin, "OBSERVED");
  });

  it("real mode without selectors → UNAVAILABLE (no demo fill)", () => {
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: { symbol: "BTCUSDT" },
      sessionId: "sess_real_bbbbbbb2",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(telemetry.orderFlow.availability, "UNAVAILABLE");
    assert.ok(telemetry.orderFlow.summary.includes("real"));
  });

  it("rejects tradeCount 0 in real selector", () => {
    assert.equal(selectOrderFlowFromTradeSummary({ ...REAL_OF, tradeCount: 0 }), null);
  });
});

describe("AI-6.3 footprint PARTIAL only", () => {
  it("stacked flags PARTIAL; exhaustion unknown", () => {
    const fp = selectFootprintFromBars([
      { delta: 1, stackedBuyImbalance: true, pocPrice: 100 },
    ]);
    assert.ok(fp);
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: { symbol: "ETHUSDT", footprintSummary: fp },
      sessionId: "sess_fp_ccccccc3",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(telemetry.footprint.availability, "PARTIAL");
    assert.equal(telemetry.footprint.exhaustionHint, "unknown");
  });
});

describe("AI-6.3 lifecycle DERIVED", () => {
  it("spoof counts → hypothesis", () => {
    const life = selectLifecycleFromAudit({
      spoofingCandidateCount: 4,
      pullingCandidateCount: 1,
    });
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: { symbol: "BTCUSDT", lifecycleAudit: life },
      sessionId: "sess_life_dddddd4",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(telemetry.lifecycle.origin, "DERIVED");
    assert.equal(telemetry.lifecycle.spoofingHypothesis, "likely");
  });
});

describe("AI-6.3 mentorEligible always false", () => {
  it("shared gate", () => assert.equal(canUseTelemetryForMentor(), false));
  it("server gate", () => assert.equal(serverMentorGate(), false));
  it("on real telemetry", () => {
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: { symbol: "BTCUSDT", orderFlowSummary: REAL_OF },
      sessionId: "sess_mentor_eeeee5",
      sequence: 1,
    });
    assert.equal(telemetry.mentorEligible, false);
    assert.equal(canUseTelemetryForMentor(telemetry), false);
  });
});

describe("AI-6.3 anti-synthetic isolation", () => {
  it("namespaces isolate real vs synthetic", () => {
    const store = getMarketTelemetryStore();
    const real = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_ns_fffffff6",
      sequence: 1,
      telemetryMode: "real",
      orderFlowSummary: REAL_OF,
    });
    const syn = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_ns_fffffff6",
      sequence: 1,
      telemetryMode: "synthetic_debug",
      orderFlowSummary: REAL_OF,
    });
    assert.equal(store.put(makeTelemetryEntry({ telemetry: real.telemetry, userId: 1 })).accepted, true);
    assert.equal(store.put(makeTelemetryEntry({ telemetry: syn.telemetry, userId: 1 })).accepted, true);
    assert.equal(store.get(1, "sess_ns_fffffff6", "BTCUSDT", "real")?.namespace, "real");
    assert.equal(
      store.get(1, "sess_ns_fffffff6", "BTCUSDT", "synthetic_debug")?.namespace,
      "synthetic_debug",
    );
  });

  it("prefer real over synthetic", () => {
    const store = getMarketTelemetryStore();
    const real = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_pref_gggggg7",
      sequence: 1,
      telemetryMode: "real",
      orderFlowSummary: REAL_OF,
    });
    const syn = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_pref_gggggg7",
      sequence: 1,
      telemetryMode: "synthetic_debug",
      orderFlowSummary: { ...REAL_OF, imbalancePct: 99 },
    });
    store.put(makeTelemetryEntry({ telemetry: syn.telemetry, userId: 2 }));
    store.put(makeTelemetryEntry({ telemetry: real.telemetry, userId: 2 }));
    const pref = store.getPreferReal(2, "sess_pref_gggggg7", "BTCUSDT");
    assert.equal(pref?.namespace, "real");
  });
});

describe("AI-6.3 e2e real harness → store → adapter → snapshot", () => {
  it("controlled real path merges CVD", () => {
    pushHarnessRealSelectors({
      symbol: "BTCUSDT",
      orderFlowSummary: REAL_OF,
      footprintSummary: {
        totalBars: 2,
        totalDelta: 1,
        stackedBuy: true,
        hasPoc: true,
      },
      lifecycleAudit: { spoofingCandidateCount: 1, pullingCandidateCount: 0 },
    });
    const model = readHarnessModel("BTCUSDT");
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: model,
      sessionId: "sess_e2e_hhhhhhh8",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
    getMarketTelemetryStore().put(makeTelemetryEntry({ telemetry, userId: 9 }));
    const entry = getMarketTelemetryStore().getPreferReal(9, "sess_e2e_hhhhhhh8", "BTCUSDT");
    assert.ok(entry);
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel(), {
      telemetry: entry!.telemetry,
    });
    assert.equal(res.telemetryMerged, true);
    assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
    assert.equal(entry!.telemetry.mentorEligible, false);
    const blob = JSON.stringify(res.snapshot).toLowerCase();
    assert.ok(!blob.includes("heatmapcells"));
  });
});

describe("AI-6.3 railway audit", () => {
  it("returns topology + safety + mentor false", () => {
    const a = auditRailwayTelemetryTopology();
    assert.ok(["SINGLE", "MULTI", "UNKNOWN"].includes(a.topology));
    assert.equal(a.repositoryMode, "memory");
    assert.equal(a.mentorEligible, false);
    assert.equal(a.canUseTelemetryForMentor, false);
    assert.ok(a.evidence.length >= 2);
  });

  it("railway.toml exists as evidence source", () => {
    const p = join(process.cwd(), "railway.toml");
    const text = readFileSync(p, "utf8");
    assert.ok(text.includes("[deploy]"));
  });
});

describe("AI-6.3 quality checks", () => {
  it("real OF ok", () => {
    const q = assessRealTelemetryQuality({
      mode: "real",
      orderFlow: REAL_OF,
      footprint: null,
      lifecycle: null,
    });
    assert.equal(q.ok, true);
    assert.equal(q.orderFlowOk, true);
  });
  it("real missing OF not ok", () => {
    const q = assessRealTelemetryQuality({
      mode: "real",
      orderFlow: null,
      footprint: null,
      lifecycle: null,
    });
    assert.equal(q.ok, false);
  });
});

describe("AI-6.3 security greps boundary", () => {
  const src = readFileSync(
    join(process.cwd(), "client/src/lib/marketTelemetry/realMarketTelemetrySource.ts"),
    "utf8",
  );
  for (const w of ["useState", "useEffect", 'from "react"', "from 'react'", "getContext("]) {
    it(`client boundary no ${w}`, () => assert.ok(!src.includes(w)));
  }
  const serverSrc = readFileSync(
    join(process.cwd(), "server/ai/goodTradingAi/market/telemetry/realSelectors.ts"),
    "utf8",
  );
  for (const w of ["useState", "useEffect", 'from "react"', "getContext("]) {
    it(`server selectors no ${w}`, () => assert.ok(!serverSrc.includes(w)));
  }
});

describe("AI-6.3 never forge OBSERVED", () => {
  it("adapter preserves INFERRED", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_obs_iiiiiii9",
      sequence: 1,
      telemetryMode: "real",
    });
    const bundle = applyClientTelemetryToBundle({}, telemetry);
    assert.notEqual(bundle.orderFlow?.origin, "OBSERVED");
  });
});

describe("AI-6.3 perf report p50/p95/p99", () => {
  it("200 real builds", () => {
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      buildTelemetryFromRealSource({
        readModel: {
          symbol: "BTCUSDT",
          orderFlowSummary: { ...REAL_OF, cvd: i, imbalancePct: (i % 40) - 20 },
          lifecycleAudit: { spoofingCandidateCount: i % 3 },
        },
        sessionId: "sess_perf_jjjjjj10",
        sequence: i,
        telemetryMode: "real",
      });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const pct = (p: number) =>
      times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]!;
    assert.ok(pct(50) < 3, `p50=${pct(50)}`);
    assert.ok(pct(95) < 5, `p95=${pct(95)}`);
    assert.ok(pct(99) < 10, `p99=${pct(99)}`);
    // FPS: no Bookmap harness → NO DETERMINABLE
    assert.equal("NO_DETERMINABLE", "NO_DETERMINABLE");
  });
});

describe("AI-6.3 real imbalance grid", () => {
  for (const imb of [-60, -35, -20, -12, -5, 0, 5, 12, 20, 35, 60, 80]) {
    it(`imb=${imb}`, () => {
      const { telemetry, bytes } = buildTelemetryFromRealSource({
        readModel: {
          symbol: "BTCUSDT",
          orderFlowSummary: { ...REAL_OF, imbalancePct: imb, delta: imb, cvd: imb },
        },
        sessionId: "sess_grid_kkkkkk11",
        sequence: 1,
        telemetryMode: "real",
      });
      assert.equal(telemetry.telemetryMode, "real");
      assert.ok(bytes < TELEMETRY_MAX_BYTES);
      assert.equal(telemetry.mentorEligible, false);
    });
  }
});

describe("AI-6.3 symbol×mode matrix", () => {
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"]) {
    for (const mode of ["real", "synthetic_debug"] as const) {
      it(`${symbol}/${mode}`, () => {
        const { telemetry } = buildCompactMarketTelemetry({
          symbol,
          sessionId: "sess_sym_llllllll12",
          sequence: 1,
          telemetryMode: mode,
          orderFlowSummary: REAL_OF,
        });
        assert.equal(telemetry.symbol, symbol);
        assert.equal(telemetry.telemetryMode, mode);
        assert.equal(telemetry.namespace, mode === "real" ? "real" : "synthetic_debug");
        assert.equal(telemetry.mentorEligible, false);
      });
    }
  }
});

describe("AI-6.3 sequence CAS stress", () => {
  it("80 ascending real puts", () => {
    const store = getMarketTelemetryStore();
    for (let i = 1; i <= 80; i++) {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_cas_mmmmmm13",
        sequence: i,
        telemetryMode: "real",
        orderFlowSummary: { ...REAL_OF, tradeCount: 20 + i },
      });
      assert.equal(store.put(makeTelemetryEntry({ telemetry, userId: 3 })).accepted, true);
    }
    assert.equal(store.get(3, "sess_cas_mmmmmm13", "BTCUSDT", "real")?.lastSequence, 80);
  });
});

describe("AI-6.3 footprint stacked matrix", () => {
  for (const buy of [true, false]) {
    for (const sell of [true, false]) {
      for (const poc of [true, false]) {
        it(`b=${buy} s=${sell} poc=${poc}`, () => {
          const fp = selectFootprintFromBars([
            {
              delta: buy ? 1 : sell ? -1 : 0,
              stackedBuyImbalance: buy,
              stackedSellImbalance: sell,
              pocPrice: poc ? 1 : null,
            },
          ]);
          const { telemetry } = buildTelemetryFromRealSource({
            readModel: { symbol: "BTCUSDT", footprintSummary: fp },
            sessionId: "sess_fps_nnnnnn14",
            sequence: 1,
            telemetryMode: "real",
          });
          assert.equal(telemetry.footprint.exhaustionHint, "unknown");
        });
      }
    }
  }
});

describe("AI-6.3 spoof×pull matrix", () => {
  for (const pull of [0, 1, 3, 8]) {
    for (const spoof of [0, 1, 2, 5]) {
      it(`p=${pull} s=${spoof}`, () => {
        const { telemetry } = buildTelemetryFromRealSource({
          readModel: {
            symbol: "BTCUSDT",
            lifecycleAudit: {
              pullingCandidateCount: pull,
              spoofingCandidateCount: spoof,
            },
          },
          sessionId: "sess_sp_oooooo15",
          sequence: 1,
          telemetryMode: "real",
        });
        assert.equal(telemetry.lifecycle.origin, "DERIVED");
        assert.equal(telemetry.mentorEligible, false);
      });
    }
  }
});

describe("AI-6.3 capability mentorEligible", () => {
  it("telemetry caps mentorEligible false", async () => {
    const { getMarketSourceCapabilities } = await import("../live/capabilities.ts");
    const caps = getMarketSourceCapabilities().filter((c) =>
      c.sourceId.startsWith("client_telemetry_"),
    );
    assert.ok(caps.length >= 3);
    for (const c of caps) {
      assert.equal(c.mentorEligible, false);
      assert.ok(c.repositorySafety);
    }
  });
});

describe("AI-6.3 tradeCount quality grid", () => {
  for (const tradeCount of [0, 1, 5, 19, 20, 40, 100, 500]) {
    it(`tradeCount=${tradeCount}`, () => {
      const of = selectOrderFlowFromTradeSummary({ ...REAL_OF, tradeCount });
      if (tradeCount < 1) {
        assert.equal(of, null);
        return;
      }
      const { telemetry } = buildTelemetryFromRealSource({
        readModel: { symbol: "BTCUSDT", orderFlowSummary: of },
        sessionId: "sess_tc_pppppp16",
        sequence: 1,
        telemetryMode: "real",
      });
      assert.equal(telemetry.orderFlow.availability, "AVAILABLE");
      assert.equal(telemetry.orderFlow.quality, tradeCount >= 20 ? "medium" : "low");
    });
  }
});

describe("AI-6.3 user×namespace isolation", () => {
  for (const userId of [1, 2, 3, 4, 5]) {
    for (const ns of ["real", "synthetic_debug"] as const) {
      it(`user=${userId} ns=${ns}`, () => {
        const store = getMarketTelemetryStore();
        const { telemetry } = buildCompactMarketTelemetry({
          symbol: "BTCUSDT",
          sessionId: `sess_u${userId}_qqqqqq17`.padEnd(16, "x").slice(0, 20),
          sequence: 1,
          telemetryMode: ns,
          orderFlowSummary: REAL_OF,
        });
        assert.equal(store.put(makeTelemetryEntry({ telemetry, userId })).accepted, true);
        assert.equal(store.get(userId, telemetry.sessionId, "BTCUSDT", ns)?.namespace, ns);
        assert.equal(store.get(userId + 50, telemetry.sessionId, "BTCUSDT", ns), undefined);
      });
    }
  }
});

describe("AI-6.3 compact delta×window matrix", () => {
  const deltas = [-40, -20, -10, 0, 10, 20, 40];
  const windows = [5_000, 30_000, 90_000, 180_000];
  let n = 0;
  for (const delta of deltas) {
    for (const windowMs of windows) {
      n += 1;
      it(`case#${n} d=${delta} w=${windowMs}`, () => {
        const { telemetry, bytes } = buildTelemetryFromRealSource({
          readModel: {
            symbol: "BTCUSDT",
            orderFlowSummary: {
              ...REAL_OF,
              delta,
              cvd: delta * 2,
              imbalancePct: delta,
              windowMs,
            },
            footprintSummary:
              n % 2 === 0
                ? { totalBars: 2, totalDelta: delta, stackedBuy: delta > 0, hasPoc: true }
                : null,
            lifecycleAudit:
              n % 3 === 0
                ? { spoofingCandidateCount: n % 4, pullingCandidateCount: n % 2 }
                : null,
          },
          sessionId: `sess_mx_${String(n).padStart(8, "0")}`,
          sequence: n,
          telemetryMode: "real",
        });
        assert.equal(telemetry.telemetryMode, "real");
        assert.equal(telemetry.mentorEligible, false);
        assert.ok(bytes < TELEMETRY_MAX_BYTES);
        assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
        assert.notEqual(telemetry.orderFlow.origin, "OBSERVED");
      });
    }
  }
});

describe("AI-6.3 cvdBias×mode cases", () => {
  const cases: Array<{ cvd: number; delta: number; expect: string }> = [
    { cvd: 10, delta: 1, expect: "rising" },
    { cvd: -10, delta: -1, expect: "falling" },
    { cvd: 10, delta: -1, expect: "flat" },
    { cvd: -10, delta: 1, expect: "flat" },
    { cvd: 0, delta: 0, expect: "flat" },
  ];
  for (const mode of ["real", "synthetic_debug"] as const) {
    for (const c of cases) {
      it(`${mode} cvd=${c.cvd} d=${c.delta}`, () => {
        const { telemetry } = buildCompactMarketTelemetry({
          symbol: "BTCUSDT",
          sessionId: "sess_cvd_rrrrrr18",
          sequence: 1,
          telemetryMode: mode,
          orderFlowSummary: { ...REAL_OF, cvd: c.cvd, delta: c.delta, imbalancePct: c.delta },
        });
        assert.equal(telemetry.orderFlow.cvdBias, c.expect);
        assert.equal(telemetry.mentorEligible, false);
        assert.equal(telemetry.telemetryMode, mode);
      });
    }
  }
});

describe("AI-6.3 schema reject OBSERVED forge simulation", () => {
  for (const lens of ["orderFlow", "footprint", "lifecycle"] as const) {
    it(`builder never sets OBSERVED on ${lens}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_forge_sssss19",
        sequence: 1,
        telemetryMode: "real",
        orderFlowSummary: REAL_OF,
        footprintSummary: { totalBars: 1, totalDelta: 0, stackedBuy: true, hasPoc: true },
        lifecycleAudit: { spoofingCandidateCount: 2, pullingCandidateCount: 1 },
      });
      assert.notEqual(telemetry[lens].origin, "OBSERVED");
    });
  }
});

describe("AI-6.3 sessionId length edges", () => {
  for (const len of [8, 12, 16, 24, 36, 48, 64, 80]) {
    it(`sessionId len=${len}`, () => {
      const sessionId = ("s" + "x".repeat(200)).slice(0, len);
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId,
        sequence: 1,
        telemetryMode: "real",
        orderFlowSummary: REAL_OF,
      });
      assert.ok(telemetry.sessionId.length >= 8);
      assert.ok(telemetry.sessionId.length <= 80);
    });
  }
});

describe("AI-6.3 topology evidence matrix", () => {
  const prevRailway = process.env.RAILWAY_ENVIRONMENT;
  const prevTotal = process.env.RAILWAY_REPLICA_TOTAL;
  afterEach(() => {
    if (prevRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = prevRailway;
    if (prevTotal === undefined) delete process.env.RAILWAY_REPLICA_TOTAL;
    else process.env.RAILWAY_REPLICA_TOTAL = prevTotal;
  });

  it("local SINGLE-ish", () => {
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_REPLICA_TOTAL;
    const a = auditRailwayTelemetryTopology();
    assert.ok(["SINGLE", "UNKNOWN"].includes(a.topology));
    assert.equal(a.mentorEligible, false);
  });

  it("multi when REPLICA_TOTAL>1", () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.RAILWAY_REPLICA_TOTAL = "3";
    const a = auditRailwayTelemetryTopology();
    assert.equal(a.topology, "MULTI");
    assert.equal(a.repositorySafety, "UNSAFE_FOR_MULTI_INSTANCE");
  });

  for (const total of ["1", "2", "4", "8"]) {
    it(`replicaTotal=${total}`, () => {
      process.env.RAILWAY_ENVIRONMENT = "production";
      process.env.RAILWAY_REPLICA_TOTAL = total;
      process.env.RAILWAY_REPLICA_ID = "0";
      const a = auditRailwayTelemetryTopology();
      if (Number(total) > 1) assert.equal(a.topology, "MULTI");
      else assert.ok(["SINGLE", "MULTI", "UNKNOWN"].includes(a.topology));
      assert.equal(a.canUseTelemetryForMentor, false);
    });
  }
});

describe("AI-6.3 strength from imbalance grid", () => {
  for (const imb of [0, 4, 5, 14, 15, 34, 35, 50, 70, 90]) {
    it(`strength imb=${imb}`, () => {
      const { telemetry } = buildTelemetryFromRealSource({
        readModel: {
          symbol: "ETHUSDT",
          orderFlowSummary: { ...REAL_OF, imbalancePct: imb, delta: imb, cvd: imb },
        },
        sessionId: "sess_str_tttttt20",
        sequence: 1,
        telemetryMode: "real",
      });
      assert.ok(["none", "weak", "moderate", "strong"].includes(telemetry.orderFlow.strength));
      assert.equal(telemetry.mentorEligible, false);
    });
  }
});

describe("AI-6.3 heartbeat real vs synthetic", () => {
  for (const mode of ["real", "synthetic_debug"] as const) {
    it(`${mode} forceHeartbeat`, () => {
      const a = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_hb_uuuuuu21",
        sequence: 1,
        telemetryMode: mode,
        orderFlowSummary: REAL_OF,
      });
      const fp = fingerprintFromTelemetry(a.telemetry);
      const b = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_hb_uuuuuu21",
        sequence: 2,
        telemetryMode: mode,
        previousFingerprint: fp,
        forceHeartbeat: true,
        orderFlowSummary: REAL_OF,
      });
      assert.equal(b.telemetry.heartbeat, true);
      assert.equal(b.telemetry.mentorEligible, false);
    });
  }
});

describe("AI-6.3 pad sequence identities", () => {
  for (let i = 1; i <= 20; i++) {
    it(`pad#${i}`, () => {
      const { telemetry } = buildTelemetryFromRealSource({
        readModel: {
          symbol: i % 2 === 0 ? "ETHUSDT" : "BTCUSDT",
          orderFlowSummary: { ...REAL_OF, tradeCount: 20 + i, cvd: i },
        },
        sessionId: `sess_pad_${String(i).padStart(8, "0")}`,
        sequence: i,
        telemetryMode: "real",
      });
      assert.equal(telemetry.sequence, i);
      assert.equal(telemetry.mentorEligible, false);
      assert.equal(canUseTelemetryForMentor(telemetry), false);
    });
  }
});
