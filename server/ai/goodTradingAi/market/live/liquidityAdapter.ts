import type { LiveMarketSourceAdapter } from "./adapterTypes";
import { lensFromParts, unavailableObs } from "./adapterTypes";
import { ageMs } from "./staleness";
import type { LiveMarketReadModel } from "./sourceBoundary";

/**
 * Liquidity GO PARCIAL: compact walls/magnets/sweep only.
 * Never reads full DOM/heatmap. Spoofing always UNKNOWN (detector is client-only).
 */
export const liquidityLiveAdapter: LiveMarketSourceAdapter = {
  sourceId: "storage_liquidity_compact",
  lens: "liquidity",
  capability: {
    sourceId: "storage_liquidity_compact",
    lens: "liquidity",
    availability: "Partial",
    serverSide: true,
    readOnly: true,
    notes:
      "GO PARCIAL: walls/magnets/sweep compactos desde storage. Raw DOM/heatmap NO-GO. Spoofing UNKNOWN.",
    bridgeNeeded: true,
  },
  read(model: LiveMarketReadModel) {
    const pos = model.positioning;
    const levels = model.levels;
    const hasWalls =
      pos &&
      typeof pos.callWall === "number" &&
      typeof pos.putWall === "number" &&
      Number.isFinite(pos.callWall) &&
      Number.isFinite(pos.putWall);
    const hasMagnets = (levels?.gammaMagnets?.length ?? 0) > 0;
    const sweep = pos?.sweep;

    if (!hasWalls && !hasMagnets && !sweep) {
      return unavailableObs(
        "storage_liquidity_compact",
        "liquidity",
        "Sin walls/magnets/sweep compactos; raw DOM deshabilitado (perf/security)",
      );
    }

    const captured =
      pos?.timestampMs ?? levels?.timestampMs ?? model.capturedAtMs;
    const a = ageMs(captured, model.capturedAtMs);

    let sweepContext = "none";
    let direction: "neutral" | "bullish" | "bearish" | "mixed" | "unknown" = "neutral";
    if (sweep) {
      const dir = String(sweep.sweepDirection || sweep.direction || "").toUpperCase();
      const outcome = String(sweep.outcome || "").toUpperCase();
      if (dir.includes("UP") || dir.includes("BUY")) direction = "bullish";
      else if (dir.includes("DOWN") || dir.includes("SELL")) direction = "bearish";
      if (outcome.includes("FAIL")) sweepContext = "sweep_fail";
      else if (outcome.includes("RECLAIM") || outcome.includes("SUCCESS")) sweepContext = "sweep_reclaim";
      else if (dir) sweepContext = "sweep_reclaim";
    }

    const health = model.orderBookHealth;
    const wallIntegrity =
      health?.connected === false ? "unknown" : health?.connected ? "persistent" : "unknown";

    return {
      status: a > 60_000 ? "DEGRADED" : "PARTIAL",
      origin: sweep ? "OBSERVED" : "DERIVED",
      sourceId: "storage_liquidity_compact",
      capturedAtMs: captured,
      notes: "spoofingHypothesis=unknown (no server detector)",
      lens: lensFromParts({
        provider: "liquidity",
        direction,
        strength: sweep ? "moderate" : "weak",
        quality: a > 60_000 ? "low" : "medium",
        confidence: sweep ? 0.55 : 0.4,
        summary: `Liquidity PARTIAL: walls/magnets compactos; spoofing UNKNOWN; sweep=${sweepContext}. Sin raw book.`.slice(
          0,
          280,
        ),
        tags: {
          wallIntegrity,
          spoofingHypothesis: "unknown",
          sweepContext,
        },
        origin: sweep ? "OBSERVED" : "DERIVED",
        sourceId: "storage_liquidity_compact",
        capturedAtMs: captured,
        ageMs: a === Number.MAX_SAFE_INTEGER ? 0 : a,
      }),
    };
  },
};

/** DOM lens: health-only, never book levels. */
export const domHealthLiveAdapter: LiveMarketSourceAdapter = {
  sourceId: "orderbook_health",
  lens: "dom",
  capability: {
    sourceId: "orderbook_health",
    lens: "dom",
    availability: "Partial",
    serverSide: true,
    readOnly: true,
    notes: "Solo health (connected/ageMs). Full DOM NO-GO para snapshot.",
  },
  read(model: LiveMarketReadModel) {
    const h = model.orderBookHealth;
    if (!h) {
      return unavailableObs("orderbook_health", "dom", "orderBookHealth no disponible");
    }
    const a = typeof h.ageMs === "number" && Number.isFinite(h.ageMs) ? h.ageMs : 0;
    return {
      status: h.connected ? (a > 10_000 ? "DEGRADED" : "PARTIAL") : "DEGRADED",
      origin: "OBSERVED",
      sourceId: "orderbook_health",
      capturedAtMs: model.capturedAtMs - a,
      lens: lensFromParts({
        provider: "dom",
        direction: "unknown",
        strength: "none",
        quality: h.connected && a <= 10_000 ? "medium" : "low",
        confidence: h.connected ? 0.5 : 0.2,
        summary: `DOM health OBSERVED: connected=${h.connected} ageMs=${a} (sin book raw).`.slice(
          0,
          280,
        ),
        origin: "OBSERVED",
        sourceId: "orderbook_health",
        capturedAtMs: model.capturedAtMs,
        ageMs: a,
      }),
    };
  },
};
