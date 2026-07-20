import type { LiveMarketReadModel } from "./sourceBoundary";

/** Sanitized fixture shaped like real MemStorage + ticker (no raw books). */
export function fixtureRichLiveModel(overrides?: Partial<LiveMarketReadModel>): LiveMarketReadModel {
  const now = Date.now();
  return {
    symbol: "BTCUSDT",
    capturedAtMs: now,
    ticker: { price: 97500, timestampMs: now - 2000, source: "binance" },
    market: {
      gammaRegime: "LONG GAMMA",
      totalGex: 1.2e9,
      gammaFlip: 96000,
      distanceToFlip: 1500,
      timestampMs: now - 5000,
    },
    positioning: {
      callWall: 100000,
      putWall: 92000,
      oiConcentration: 0.42,
      dealerPivot: 97000,
      timestampMs: now - 5000,
      absorption: {
        status: "ACTIVE",
        side: "BUY_ABSORPTION",
        confidence: 0.72,
        intensity: 0.6,
        summary: ["Pasivo absorbe agresivo en zona"],
      },
      sweep: {
        status: "DETECTED",
        sweepDirection: "UP",
        outcome: "RECLAIM",
        sweepRisk: "MEDIUM",
      },
    },
    levels: {
      gammaMagnets: [96000, 98000, 100000],
      shortGammaPocketStart: 94000,
      shortGammaPocketEnd: 95000,
      timestampMs: now - 5000,
    },
    optionsLastUpdatedMs: now - 8000,
    orderBookHealth: {
      connected: true,
      ageMs: 800,
      bidsCount: 1000,
      asksCount: 1000,
    },
    ...overrides,
  };
}

export function fixtureEmptyLiveModel(): LiveMarketReadModel {
  return {
    symbol: "BTCUSDT",
    capturedAtMs: Date.now(),
  };
}

export function fixtureStaleLiveModel(): LiveMarketReadModel {
  const now = Date.now();
  return fixtureRichLiveModel({
    capturedAtMs: now,
    market: {
      gammaRegime: "SHORT GAMMA",
      totalGex: -5e8,
      gammaFlip: 99000,
      timestampMs: now - 300_000,
    },
    positioning: {
      callWall: 101000,
      putWall: 95000,
      oiConcentration: 0.3,
      timestampMs: now - 300_000,
    },
    orderBookHealth: { connected: true, ageMs: 45_000, bidsCount: 10, asksCount: 10 },
  });
}
