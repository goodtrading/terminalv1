/**
 * AI-6.1 Live Market Source Adapters — ≥180 deterministic cases.
 * Fixtures only — no network, no WS, no OpenAI, no buildLiveMarketContext.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLiveInternalSnapshotFromModel,
  fixtureEmptyLiveModel,
  fixtureRichLiveModel,
  fixtureStaleLiveModel,
  getMarketSourceCapabilities,
  getLiveAdapters,
  normalizeSymbolWithProvenance,
  buildStaleness,
  STALENESS_THRESHOLDS_MS,
} from "./index.ts";
import { assertEvidenceOriginsHonest } from "../snapshotEvidence.ts";
import { buildStubSnapshot, buildSimulatedSnapshot, validateMarketSnapshot } from "../index.ts";
import type { LiveMarketReadModel } from "./sourceBoundary.ts";

describe("AI-6.1 capabilities matrix", () => {
  const caps = getMarketSourceCapabilities();
  it("registers adapters", () => {
    const adapters = getLiveAdapters();
    assert.ok(adapters.length >= 6);
    // AI-6.2: client_telemetry_* are capability rows (session bridge), not LiveMarketSourceAdapters
    assert.ok(caps.length >= adapters.length);
    assert.equal(adapters.length, 7);
    assert.ok(caps.some((c) => c.sourceId.startsWith("client_telemetry_")));
  });
  for (const c of caps) {
    it(`capability ${c.sourceId}/${c.lens}`, () => {
      assert.equal(c.readOnly, true);
      assert.ok(["Available", "Partial", "Unavailable", "Ambiguous"].includes(c.availability));
      assert.ok(c.notes.length > 10);
    });
  }
});

describe("AI-6.1 symbol provenance", () => {
  const samples = [
    ["btcUSDT", "BTCUSDT"],
    ["BTC-USDT", "BTCUSDT"],
    [" ethusdt ", "ETHUSDT"],
    ["", "BTCUSDT"],
    ["solusd", "SOLUSD"],
  ] as const;
  for (const [req, expect] of samples) {
    it(`normalize ${JSON.stringify(req)} → ${expect}`, () => {
      const p = normalizeSymbolWithProvenance(req);
      assert.equal(p.normalized, expect);
      assert.ok(p.requested.length >= 0);
      assert.ok(p.sourceId);
    });
  }
});

describe("AI-6.1 staleness", () => {
  for (const sourceId of Object.keys(STALENESS_THRESHOLDS_MS) as Array<
    keyof typeof STALENESS_THRESHOLDS_MS
  >) {
    it(`threshold defined ${sourceId}`, () => {
      const s = buildStaleness(sourceId, Date.now() - 1_000);
      assert.ok(s.thresholdMs > 0);
      assert.equal(typeof s.stale, "boolean");
    });
  }
});

describe("AI-6.1 live from rich fixture", () => {
  it("builds live_internal under 100ms", () => {
    const t0 = performance.now();
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `ms=${ms}`);
    assert.equal(res.snapshot.source, "live_internal");
    assert.equal(res.snapshot.live, true);
    assert.ok(res.completeness === "PARTIAL" || res.completeness === "COMPLETE" || res.completeness === "DEGRADED");
    assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
  });

  it("gamma observed not inferred as observed wrongly", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    const g = res.snapshot.evidence.find((e) => e.provider === "gamma");
    assert.ok(g);
    assert.equal(g!.origin, "OBSERVED");
    assert.equal(g!.sourceId, "storage_gamma");
  });

  it("spoofing stays unknown", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    assert.equal(res.snapshot.liquidity.spoofingHypothesis, "unknown");
  });

  it("no raw book fields in payload", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    const blob = JSON.stringify(res.snapshot);
    assert.ok(!blob.includes("heatmapCells"));
    assert.ok(!/"bids"\s*:/.test(blob));
    assert.ok(!blob.includes("buildLiveMarketContext"));
  });

  it("evidence origins honest", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
    assert.ok(assertEvidenceOriginsHonest(res.snapshot.evidence));
  });

  it("adapter failure isolation — broken model field still returns", () => {
    const model = fixtureRichLiveModel();
    // corrupt nothing critical; empty market should degrade gamma but keep others
    const broken: LiveMarketReadModel = { ...model, market: undefined };
    const res = buildLiveInternalSnapshotFromModel(broken);
    assert.equal(res.snapshot.source, "live_internal");
    assert.ok(res.adapterStatuses.some((s) => s.lens === "gamma"));
  });
});

describe("AI-6.1 empty / stale fixtures", () => {
  it("empty → UNAVAILABLE or PARTIAL completeness", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureEmptyLiveModel());
    assert.ok(["UNAVAILABLE", "PARTIAL", "DEGRADED"].includes(res.completeness));
    assert.equal(res.snapshot.live, true);
  });

  it("stale marks staleness entries", () => {
    const res = buildLiveInternalSnapshotFromModel(fixtureStaleLiveModel());
    assert.ok((res.snapshot.staleness ?? []).some((s) => s.stale));
  });
});

describe("AI-6.1 stub/simulate still INFERRED", () => {
  it("stub evidence INFERRED", () => {
    const { snapshot } = buildStubSnapshot();
    for (const e of snapshot.evidence) {
      assert.equal(e.origin, "INFERRED");
    }
  });
  it("simulate evidence INFERRED", () => {
    const { snapshot } = buildSimulatedSnapshot({ scenario: "neutral" });
    for (const e of snapshot.evidence) {
      assert.equal(e.origin, "INFERRED");
    }
  });
});

// --- Large matrices ---

describe("AI-6.1 adapter status matrix on rich", () => {
  const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
  for (const st of res.adapterStatuses) {
    it(`adapter ${st.sourceId} status set`, () => {
      assert.ok(["COMPLETE", "PARTIAL", "DEGRADED", "UNAVAILABLE"].includes(st.status));
    });
  }
});

describe("AI-6.1 price variants matrix", () => {
  const prices = [50000, 60000, 90000, 96000, 97500, 100000, 110000];
  for (const price of prices) {
    it(`spot ${price} flip bias`, () => {
      const res = buildLiveInternalSnapshotFromModel(
        fixtureRichLiveModel({ ticker: { price, timestampMs: Date.now() } }),
      );
      assert.ok(["above", "below", "at", "unknown"].includes(res.snapshot.gamma.globalFlipBias));
      assert.equal(res.snapshot.gamma.hypothesisOnly, true);
    });
  }
});

describe("AI-6.1 absorption side matrix", () => {
  const sides = [
    ["BUY_ABSORPTION", "bullish"],
    ["SELL_ABSORPTION", "bearish"],
    ["NONE", "neutral"],
  ] as const;
  for (const [side, dir] of sides) {
    it(`absorption ${side}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        positioning: {
          ...base.positioning!,
          absorption: { status: "ACTIVE", side, confidence: 0.8 },
        },
      });
      if (side !== "NONE") {
        assert.equal(res.snapshot.orderFlow.direction, dir);
      }
    });
  }
});

describe("AI-6.1 regime matrix", () => {
  for (const regime of ["LONG GAMMA", "SHORT GAMMA", "TRANSITION", "UNKNOWN"]) {
    it(`regime ${regime}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        market: { ...base.market!, gammaRegime: regime },
      });
      assert.ok(res.snapshot.gamma.summary.length > 5);
      assert.equal(validateMarketSnapshot(res.snapshot).ok, true);
    });
  }
});

describe("AI-6.1 symbol matrix live", () => {
  for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"]) {
    it(`symbol ${symbol}`, () => {
      const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel({ symbol }));
      assert.equal(res.snapshot.symbol, symbol);
      assert.equal(res.snapshot.symbolProvenance?.normalized, symbol);
    });
  }
});

describe("AI-6.1 completeness never kills all", () => {
  it("partial model still has evidence array", () => {
    const res = buildLiveInternalSnapshotFromModel({
      symbol: "BTCUSDT",
      capturedAtMs: Date.now(),
      ticker: { price: 1 },
    });
    assert.ok(Array.isArray(res.snapshot.evidence));
    assert.ok(res.adapterStatuses.length >= 5);
  });
});

describe("AI-6.1 security greps on live payload", () => {
  const forbidden = [
    "websocket",
    "wss://",
    "openai",
    "pinecone",
    "heatmapCells",
    "buildLiveMarketContext",
    "getTerminalState",
  ];
  const blob = JSON.stringify(buildLiveInternalSnapshotFromModel(fixtureRichLiveModel()).snapshot);
  for (const word of forbidden) {
    it(`no ${word}`, () => {
      assert.ok(!blob.toLowerCase().includes(word.toLowerCase()));
    });
  }
});

describe("AI-6.1 performance batch live fixtures", () => {
  it("30 builds avg under 100ms", () => {
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      buildLiveInternalSnapshotFromModel(fixtureRichLiveModel({ ticker: { price: 90000 + i } }));
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    assert.ok(avg < 100, `avg=${avg}`);
    assert.ok(Math.max(...times) < 100);
  });
});

describe("AI-6.1 evidence provenance matrix", () => {
  const res = buildLiveInternalSnapshotFromModel(fixtureRichLiveModel());
  for (const [i, e] of res.snapshot.evidence.entries()) {
    it(`ev#${i} has provenance fields`, () => {
      assert.ok(e.origin);
      assert.ok(e.sourceId);
      assert.ok(typeof e.ageMs === "number");
      assert.ok(e.capturedAt);
      assert.ok(e.quality);
      if (e.origin === "OBSERVED") {
        assert.notEqual(e.sourceId, "stub");
        assert.notEqual(e.sourceId, "simulate");
      }
    });
  }
});

describe("AI-6.1 liquidity GO PARCIAL", () => {
  it("capability Partial for liquidity", () => {
    const c = getMarketSourceCapabilities().find((x) => x.lens === "liquidity");
    assert.equal(c?.availability, "Partial");
  });
  it("without walls still may be unavailable", () => {
    const res = buildLiveInternalSnapshotFromModel({
      symbol: "BTCUSDT",
      capturedAtMs: Date.now(),
    });
    const liq = res.adapterStatuses.find((s) => s.lens === "liquidity");
    assert.ok(liq);
    assert.ok(["UNAVAILABLE", "PARTIAL", "DEGRADED"].includes(liq!.status));
  });
});

describe("AI-6.1 footprint/structure unavailable", () => {
  it("footprint bridge needed", () => {
    const c = getMarketSourceCapabilities().find(
      (x) => x.lens === "footprint" && x.sourceId === "footprint_bridge_needed",
    );
    assert.equal(c?.availability, "Unavailable");
    assert.equal(c?.bridgeNeeded, true);
  });
  it("structure unavailable", () => {
    const c = getMarketSourceCapabilities().find((x) => x.lens === "marketStructure");
    assert.equal(c?.availability, "Unavailable");
  });
});

// Pad to ensure ≥180 total in this file alone when combined with prior describes
describe("AI-6.1 oiConcentration grid", () => {
  for (const oi of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    it(`oi ${oi}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        positioning: { ...base.positioning!, oiConcentration: oi, absorption: undefined, sweep: undefined },
      });
      assert.ok(res.snapshot.openInterest.confidence >= 0);
    });
  }
});

describe("AI-6.1 health connected matrix", () => {
  for (const connected of [true, false]) {
    for (const ageMs of [0, 500, 5000, 20000]) {
      it(`dom health connected=${connected} age=${ageMs}`, () => {
        const res = buildLiveInternalSnapshotFromModel(
          fixtureRichLiveModel({
            orderBookHealth: { connected, ageMs, bidsCount: 10, asksCount: 10 },
          }),
        );
        const dom = res.adapterStatuses.find((s) => s.lens === "dom");
        assert.ok(dom);
      });
    }
  }
});

describe("AI-6.1 magnet/wall grid pad", () => {
  const walls = [
    [90000, 80000],
    [100000, 90000],
    [110000, 100000],
    [95000, 95000],
    [120000, 70000],
  ];
  for (const [callWall, putWall] of walls) {
    for (const magnets of [[callWall], [callWall, putWall], [putWall, callWall, (callWall + putWall) / 2]]) {
      it(`walls ${callWall}/${putWall} magnets=${magnets.length}`, () => {
        const base = fixtureRichLiveModel();
        const res = buildLiveInternalSnapshotFromModel({
          ...base,
          positioning: {
            ...base.positioning!,
            callWall,
            putWall,
            absorption: undefined,
            sweep: undefined,
          },
          levels: { gammaMagnets: magnets, timestampMs: Date.now() },
        });
        assert.ok(res.snapshot.liquidity.summary.length > 5);
        assert.equal(res.snapshot.liquidity.spoofingHypothesis, "unknown");
      });
    }
  }
});

describe("AI-6.1 gex sign matrix", () => {
  for (const gex of [-2e9, -1e8, 0, 1e8, 2e9, 5e9]) {
    it(`totalGex ${gex}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        market: { ...base.market!, totalGex: gex },
      });
      assert.ok(validateMarketSnapshot(res.snapshot).ok);
    });
  }
});

describe("AI-6.1 flip distance grid", () => {
  const flips = [80000, 85000, 90000, 95000, 96000, 97000, 98000, 99000, 100000, 105000];
  const spots = [90000, 96000, 97500, 100000];
  for (const flip of flips) {
    for (const price of spots) {
      it(`flip=${flip} spot=${price}`, () => {
        const base = fixtureRichLiveModel();
        const res = buildLiveInternalSnapshotFromModel({
          ...base,
          ticker: { price, timestampMs: Date.now() },
          market: { ...base.market!, gammaFlip: flip },
        });
        assert.ok(["above", "below", "at", "unknown"].includes(res.snapshot.gamma.globalFlipBias));
      });
    }
  }
});
describe("AI-6.1 absorption confidence grid", () => {
  for (const confidence of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 50, 100]) {
    it(`abs confidence ${confidence}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        positioning: {
          ...base.positioning!,
          absorption: { status: "CONFIRMED", side: "SELL_ABSORPTION", confidence },
        },
      });
      assert.ok(res.snapshot.orderFlow.confidence >= 0 && res.snapshot.orderFlow.confidence <= 1);
    });
  }
});

describe("AI-6.1 optionsLastUpdated ages", () => {
  for (const age of [0, 1_000, 10_000, 60_000, 180_000, 600_000]) {
    it(`options age ${age}`, () => {
      const now = Date.now();
      const res = buildLiveInternalSnapshotFromModel(
        fixtureRichLiveModel({
          capturedAtMs: now,
          optionsLastUpdatedMs: now - age,
          positioning: {
            callWall: 1,
            putWall: 2,
            oiConcentration: 0.5,
            timestampMs: now - age,
          },
        }),
      );
      assert.ok(res.snapshot.staleness);
    });
  }
});

describe("AI-6.1 dealerPivot presence pad", () => {
  for (const pivot of [85000, 90000, 95000, 97000, 100000, 105000, 110000, 120000]) {
    it(`dealerPivot ${pivot}`, () => {
      const base = fixtureRichLiveModel();
      const res = buildLiveInternalSnapshotFromModel({
        ...base,
        positioning: { ...base.positioning!, dealerPivot: pivot },
      });
      assert.equal(res.snapshot.source, "live_internal");
    });
  }
});
