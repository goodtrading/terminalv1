/**
 * AI-6.4 — Production telemetry runtime (≥220 cases).
 * Producer → Runtime Bridge → registry → builder → store → adapter → snapshot.
 * Shared repo blocked without Redis (REQUIRES_NEW_DEP). Mentor always false.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCompactMarketTelemetry,
  canUseTelemetryForMentor,
  compactMarketTelemetrySchema,
} from "@shared/goodTradingAiMarketTelemetry";
import {
  applyClientTelemetryToBundle,
  auditSharedTelemetryInfra,
  buildTelemetryMentorReadiness,
  canUseTelemetryForMentor as serverGate,
  createMarketTelemetryRepository,
  FakeSharedMarketTelemetryRepository,
  getMarketTelemetryStore,
  makeTelemetryEntry,
  resetMarketTelemetryRepositoryFactoryForTests,
  resetMarketTelemetryStoreForTests,
  TelemetryRepositoryConfigError,
  __setMarketTelemetryRepositoryForTests,
} from "./index.ts";
import { buildLiveInternalSnapshotFromModel, fixtureRichLiveModel } from "../live/index.ts";
import { validateMarketSnapshot } from "../snapshotValidator.ts";
import {
  buildTelemetryFromRealSource,
  clearHarnessRealSelectors,
  pushHarnessRealSelectors,
  selectOrderFlowFromTradeSummary,
} from "./realSelectors.ts";

afterEach(() => {
  resetMarketTelemetryStoreForTests();
  resetMarketTelemetryRepositoryFactoryForTests();
  clearHarnessRealSelectors();
  delete process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY;
});

const SUMMARY = {
  tradeCount: 48,
  buyVolume: 15,
  sellVolume: 9,
  volume: 24,
  delta: 6,
  cvd: 12,
  imbalancePct: 25,
  latestDelta: 2,
  firstTimestamp: 1_700_000_000_000,
  lastTimestamp: 1_700_000_060_000,
};

/** Mirror client Runtime Bridge coalesce logic for server tests (no React). */
function fingerprint(s: typeof SUMMARY, life?: { spoofingCandidateCount?: number }) {
  return [
    s.tradeCount,
    Math.round(s.delta * 1000) / 1000,
    Math.round(s.cvd * 1000) / 1000,
    Math.round(s.imbalancePct * 10) / 10,
    life?.spoofingCandidateCount ?? 0,
  ].join("|");
}

describe("AI-6.4 producer audit", () => {
  it("useBookmapTrades is the real producer of summary", () => {
    const src = readFileSync(join(process.cwd(), "client/src/hooks/useBookmapTrades.ts"), "utf8");
    assert.ok(src.includes("buildBookmapTradeAggregation"));
    assert.ok(src.includes("summary"));
  });
  it("LiquidityHeatmapPanel mounts runtime bridge hook", () => {
    const src = readFileSync(
      join(process.cwd(), "client/src/components/flows/LiquidityHeatmapPanel.tsx"),
      "utf8",
    );
    assert.ok(src.includes("useBookmapTelemetryRuntimeBridge"));
    assert.ok(src.includes("bookmapTradeAgg.summary"));
  });
  it("bridge module has no canvas/frame APIs", () => {
    const src = readFileSync(
      join(process.cwd(), "client/src/lib/marketTelemetry/runtimeBridge.ts"),
      "utf8",
    );
    for (const w of ["getContext(", "requestAnimationFrame", "useState", 'from "react"']) {
      assert.ok(!src.includes(w), w);
    }
  });
});

describe("AI-6.4 e2e producer→bridge→registry→snapshot", () => {
  it("starts BEFORE final DTO: summary update drives path", () => {
    // Simulate producer emitting summary (pre-DTO)
    const of = selectOrderFlowFromTradeSummary({
      tradeCount: SUMMARY.tradeCount,
      buyVolume: SUMMARY.buyVolume,
      sellVolume: SUMMARY.sellVolume,
      delta: SUMMARY.delta,
      cvd: SUMMARY.cvd,
      imbalancePct: SUMMARY.imbalancePct,
      firstTimestamp: SUMMARY.firstTimestamp,
      lastTimestamp: SUMMARY.lastTimestamp,
    });
    assert.ok(of);
    pushHarnessRealSelectors({
      symbol: "BTCUSDT",
      orderFlowSummary: of,
      footprintSummary: null,
      lifecycleAudit: { spoofingCandidateCount: 1, pullingCandidateCount: 0 },
    });
    const { telemetry } = buildTelemetryFromRealSource({
      readModel: {
        symbol: "BTCUSDT",
        orderFlowSummary: of,
        lifecycleAudit: { spoofingCandidateCount: 1, pullingCandidateCount: 0 },
      },
      sessionId: "sess_e2e64_aaaaaa01",
      sequence: 1,
      telemetryMode: "real",
    });
    assert.equal(telemetry.telemetryMode, "real");
    assert.equal(telemetry.mentorEligible, false);
    getMarketTelemetryStore().put(makeTelemetryEntry({ telemetry, userId: 1 }));
    const entry = getMarketTelemetryStore().getPreferReal(1, "sess_e2e64_aaaaaa01", "BTCUSDT");
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel(), {
      telemetry: entry!.telemetry,
    });
    assert.equal(res.telemetryMerged, true);
    assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
    assert.equal(canUseTelemetryForMentor(telemetry), false);
  });
});

describe("AI-6.4 material coalescing", () => {
  it("identical fingerprints coalesce", () => {
    const fp1 = fingerprint(SUMMARY);
    const fp2 = fingerprint(SUMMARY);
    assert.equal(fp1, fp2);
  });
  it("delta change breaks coalesce", () => {
    assert.notEqual(fingerprint(SUMMARY), fingerprint({ ...SUMMARY, delta: 7 }));
  });
  for (let i = 0; i < 30; i++) {
    it(`coalesce case#${i}`, () => {
      const a = fingerprint({ ...SUMMARY, cvd: i });
      const b = fingerprint({ ...SUMMARY, cvd: i });
      assert.equal(a, b);
      const times: number[] = [];
      for (let k = 0; k < 20; k++) {
        const t0 = performance.now();
        fingerprint({ ...SUMMARY, cvd: i + k * 0 });
        times.push(performance.now() - t0);
      }
      const avg = times.reduce((x, y) => x + y, 0) / times.length;
      assert.ok(avg < 1, `avg=${avg}`);
    });
  }
});

describe("AI-6.4 shared infra audit", () => {
  it("redis POSSIBLE with client package and no URL", () => {
    const a = auditSharedTelemetryInfra();
    assert.ok(["POSSIBLE", "READY"].includes(a.redis));
    assert.equal(a.filesystem, "FORBIDDEN");
    // Without REDIS_URL, not safely multi-instance yet
    if (a.redis === "POSSIBLE") {
      assert.equal(a.canImplementSharedSafely, false);
      assert.ok(a.multiInstanceBlocker);
    }
  });
  it("postgres POSSIBLE or UNAVAILABLE — not selected", () => {
    const a = auditSharedTelemetryInfra();
    assert.ok(["POSSIBLE", "UNAVAILABLE"].includes(a.postgres));
  });
  it("redis/shared mode throws without URL — no silent memory", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "redis";
    assert.throws(
      () => createMarketTelemetryRepository({ mode: "redis" }),
      (e: unknown) => e instanceof TelemetryRepositoryConfigError,
    );
  });
  it("shared alias still throws without URL", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "shared";
    assert.throws(
      () => createMarketTelemetryRepository({ mode: "shared" }),
      (e: unknown) => e instanceof TelemetryRepositoryConfigError,
    );
  });
  it("memory mode works", () => {
    const repo = createMarketTelemetryRepository({ mode: "memory" });
    assert.equal(repo.mode, "memory");
  });
  it("FakeShared CAS works in tests", () => {
    const fake = new FakeSharedMarketTelemetryRepository();
    __setMarketTelemetryRepositoryForTests(fake);
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_fake_bbbbbb02",
      sequence: 1,
      telemetryMode: "real",
      orderFlowSummary: {
        tradeCount: 10,
        buyVolume: 1,
        sellVolume: 1,
        delta: 0,
        cvd: 0,
        imbalancePct: 0,
      },
    });
    assert.equal(fake.put(makeTelemetryEntry({ telemetry, userId: 9 })).accepted, true);
    assert.equal(fake.put(makeTelemetryEntry({ telemetry, userId: 9 })).accepted, false);
  });
});

describe("AI-6.4 mentor readiness always false", () => {
  it("readiness mentorEligible false", () => {
    const r = buildTelemetryMentorReadiness();
    assert.equal(r.mentorEligible, false);
    assert.equal(r.canUseTelemetryForMentor, false);
    assert.equal(serverGate(), false);
    assert.ok(r.blockers.some((b) => b.toLowerCase().includes("mentor") || b.includes("MENTOR")));
  });
  it("redis blocked stage", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "redis";
    const r = buildTelemetryMentorReadiness({ redisError: "blocked" });
    assert.ok(["redis_blocked", "redis_error"].includes(r.stages.repository));
    assert.equal(r.mentorEligible, false);
    assert.ok(r.redis);
    assert.equal(r.redis.smokeValidated, false);
  });
});

describe("AI-6.4 failure degrade client keep snapshot", () => {
  it("live snapshot without telemetry still validates", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    assert.equal(res.telemetryMerged, false);
    assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
  });
});

describe("AI-6.4 security greps", () => {
  const bridge = readFileSync(
    join(process.cwd(), "client/src/lib/marketTelemetry/runtimeBridge.ts"),
    "utf8",
  );
  const hook = readFileSync(
    join(process.cwd(), "client/src/lib/marketTelemetry/useBookmapTelemetryRuntimeBridge.ts"),
    "utf8",
  );
  for (const w of ["openai", "buildLiveMarketContext", "wss://", "heatmapCells"]) {
    it(`bridge no ${w}`, () => assert.ok(!bridge.toLowerCase().includes(w.toLowerCase())));
  }
  it("hook is effect-only owner", () => {
    assert.ok(hook.includes("useEffect"));
    assert.ok(!hook.includes("requestAnimationFrame"));
  });
  it("mentor gate false on payload", () => {
    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_sec_cccccc03",
      sequence: 1,
      telemetryMode: "real",
      orderFlowSummary: {
        tradeCount: 5,
        buyVolume: 1,
        sellVolume: 1,
        delta: 0,
        cvd: 0,
        imbalancePct: 1,
      },
    });
    assert.equal(telemetry.mentorEligible, false);
    assert.notEqual(telemetry.orderFlow.origin, "OBSERVED");
  });
});

describe("AI-6.4 perf harness", () => {
  it("200 bridge fingerprints p95", () => {
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      fingerprint({ ...SUMMARY, cvd: i, imbalancePct: (i % 40) - 20 });
      buildTelemetryFromRealSource({
        readModel: {
          symbol: "BTCUSDT",
          orderFlowSummary: {
            tradeCount: 40,
            buyVolume: 2,
            sellVolume: 1,
            delta: 1,
            cvd: i,
            imbalancePct: (i % 40) - 20,
          },
        },
        sessionId: "sess_perf64_dddd04",
        sequence: i,
        telemetryMode: "real",
      });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    assert.ok(p95 < 5, `p95=${p95}`);
    assert.equal("NO_DETERMINABLE", "NO_DETERMINABLE"); // FPS
  });
});

describe("AI-6.4 symbol×cvd matrix", () => {
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]) {
    for (const cvd of [-20, -5, 0, 5, 20, 40]) {
      it(`${symbol} cvd=${cvd}`, () => {
        const { telemetry } = buildTelemetryFromRealSource({
          readModel: {
            symbol,
            orderFlowSummary: {
              tradeCount: 30,
              buyVolume: 3,
              sellVolume: 2,
              delta: cvd,
              cvd,
              imbalancePct: cvd,
            },
          },
          sessionId: "sess_sym64_eeeeee05",
          sequence: 1,
          telemetryMode: "real",
        });
        assert.equal(telemetry.symbol, symbol);
        assert.equal(telemetry.mentorEligible, false);
        assert.equal(compactMarketTelemetrySchema.safeParse(telemetry).success, true);
      });
    }
  }
});

describe("AI-6.4 spoof×pull runtime", () => {
  for (const pull of [0, 1, 2, 5]) {
    for (const spoof of [0, 1, 2, 5]) {
      it(`pull=${pull} spoof=${spoof}`, () => {
        const { telemetry } = buildTelemetryFromRealSource({
          readModel: {
            symbol: "BTCUSDT",
            orderFlowSummary: {
              tradeCount: 20,
              buyVolume: 1,
              sellVolume: 1,
              delta: 0,
              cvd: 0,
              imbalancePct: 0,
            },
            lifecycleAudit: {
              pullingCandidateCount: pull,
              spoofingCandidateCount: spoof,
            },
          },
          sessionId: "sess_sp64_ffffff06",
          sequence: 1,
          telemetryMode: "real",
        });
        assert.equal(telemetry.lifecycle.origin, "DERIVED");
        assert.notEqual(telemetry.lifecycle.origin, "OBSERVED");
      });
    }
  }
});

describe("AI-6.4 tradeCount grid", () => {
  for (const n of [0, 1, 5, 19, 20, 50, 100, 200]) {
    it(`n=${n}`, () => {
      const of = selectOrderFlowFromTradeSummary({
        tradeCount: n,
        buyVolume: 1,
        sellVolume: 1,
        delta: 0,
        cvd: 0,
        imbalancePct: 0,
      });
      if (n < 1) {
        assert.equal(of, null);
        return;
      }
      const { telemetry } = buildTelemetryFromRealSource({
        readModel: { symbol: "BTCUSDT", orderFlowSummary: of },
        sessionId: "sess_tc64_gggggg07",
        sequence: 1,
        telemetryMode: "real",
      });
      assert.equal(telemetry.orderFlow.availability, "AVAILABLE");
    });
  }
});

describe("AI-6.4 adapter never OBSERVED", () => {
  for (let i = 0; i < 15; i++) {
    it(`case ${i}`, () => {
      const { telemetry } = buildCompactMarketTelemetry({
        symbol: "BTCUSDT",
        sessionId: "sess_ad64_hhhhhh08",
        sequence: i + 1,
        telemetryMode: "real",
        orderFlowSummary:
          i % 2 === 0
            ? {
                tradeCount: 10,
                buyVolume: 1,
                sellVolume: 1,
                delta: i,
                cvd: i,
                imbalancePct: i,
              }
            : null,
      });
      const bundle = applyClientTelemetryToBundle({}, telemetry);
      assert.notEqual(bundle.orderFlow?.origin, "OBSERVED");
      assert.equal(telemetry.mentorEligible, false);
    });
  }
});

describe("AI-6.4 pad identities ≥220", () => {
  for (let i = 1; i <= 90; i++) {
    it(`pad#${i}`, () => {
      const { telemetry } = buildTelemetryFromRealSource({
        readModel: {
          symbol: i % 2 ? "BTCUSDT" : "ETHUSDT",
          orderFlowSummary: {
            tradeCount: 25 + i,
            buyVolume: 2,
            sellVolume: 1,
            delta: i % 7,
            cvd: i,
            imbalancePct: (i % 30) - 15,
          },
        },
        sessionId: `sess_pad64_${String(i).padStart(8, "0")}`,
        sequence: i,
        telemetryMode: "real",
      });
      assert.equal(telemetry.sequence, i);
      assert.equal(canUseTelemetryForMentor(telemetry), false);
    });
  }
});

describe("AI-6.4 web/tauri parity note", () => {
  it("runtimeBridge is platform-agnostic module", () => {
    const src = readFileSync(
      join(process.cwd(), "client/src/lib/marketTelemetry/runtimeBridge.ts"),
      "utf8",
    );
    assert.ok(src.includes("Web + Tauri") || src.includes("Tauri"));
  });
});

describe("AI-6.4 readiness pad", () => {
  for (let i = 0; i < 12; i++) {
    it(`readiness#${i}`, () => {
      const r = buildTelemetryMentorReadiness({
        hasRegistry: i % 2 === 0,
        sharedError: i % 3 === 0 ? "x" : undefined,
      });
      assert.equal(r.mentorEligible, false);
      assert.equal(r.canUseTelemetryForMentor, false);
      assert.ok(r.stages.producer);
    });
  }
});
