import type { LiveMarketSourceAdapter } from "./adapterTypes";
import { lensFromParts, unavailableObs } from "./adapterTypes";
import { ageMs } from "./staleness";
import type { LiveMarketReadModel } from "./sourceBoundary";
import type { SignalDirection, SignalStrength } from "@shared/goodTradingAiMarket";

function flipBias(spot: number | undefined, flip: number | null | undefined): "above" | "below" | "at" | "unknown" {
  if (spot == null || flip == null || !Number.isFinite(spot) || !Number.isFinite(flip) || flip <= 0) {
    return "unknown";
  }
  const pct = Math.abs(spot - flip) / flip;
  if (pct < 0.0015) return "at";
  return spot > flip ? "above" : "below";
}

function wallContext(callWall?: number, putWall?: number): "call_heavy" | "put_heavy" | "balanced" | "unknown" {
  if (callWall == null || putWall == null || !Number.isFinite(callWall) || !Number.isFinite(putWall)) {
    return "unknown";
  }
  const diff = Math.abs(callWall - putWall);
  const mid = (callWall + putWall) / 2;
  if (mid <= 0) return "unknown";
  if (diff / mid < 0.01) return "balanced";
  return callWall > putWall ? "call_heavy" : "put_heavy";
}

export const gammaLiveAdapter: LiveMarketSourceAdapter = {
  sourceId: "storage_gamma",
  lens: "gamma",
  capability: {
    sourceId: "storage_gamma",
    lens: "gamma",
    availability: "Available",
    serverSide: true,
    readOnly: true,
    notes: "MemStorage marketState + positioning walls + ticker for flip bias. hypothesisOnly.",
  },
  read(model: LiveMarketReadModel) {
    const m = model.market;
    if (!m?.gammaRegime && m?.gammaFlip == null) {
      return unavailableObs("storage_gamma", "gamma", "marketState vacío en storage");
    }
    const captured = m.timestampMs ?? model.capturedAtMs;
    const a = ageMs(captured, model.capturedAtMs);
    const regime = (m.gammaRegime || "").toUpperCase();
    let direction: SignalDirection = "neutral";
    if (regime.includes("LONG")) direction = "bullish";
    else if (regime.includes("SHORT")) direction = "bearish";
    else if (regime) direction = "mixed";

    const strength: SignalStrength =
      m.totalGex != null && Math.abs(m.totalGex) > 0 ? "moderate" : "weak";
    const spot = model.ticker?.price;
    const gBias = flipBias(spot, m.gammaFlip);
    const walls = wallContext(model.positioning?.callWall, model.positioning?.putWall);

    return {
      status: a > 120_000 ? "DEGRADED" : "COMPLETE",
      origin: "OBSERVED",
      sourceId: "storage_gamma",
      capturedAtMs: captured,
      lens: lensFromParts({
        provider: "gamma",
        direction,
        strength,
        quality: a > 120_000 ? "low" : "medium",
        confidence: a > 120_000 ? 0.35 : 0.65,
        summary: `Gamma OBSERVED: régimen ${m.gammaRegime ?? "?"} · flip bias ${gBias} · walls ${walls}. Hipótesis, no entrada.`.slice(
          0,
          280,
        ),
        tags: {
          globalFlipBias: gBias,
          localFlipBias: "unknown",
          wallContext: walls,
        },
        origin: "OBSERVED",
        sourceId: "storage_gamma",
        capturedAtMs: captured,
        ageMs: a === Number.MAX_SAFE_INTEGER ? 0 : a,
      }),
    };
  },
};
