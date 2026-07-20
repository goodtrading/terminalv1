import type { LiveMarketSourceAdapter } from "./adapterTypes";
import { lensFromParts, unavailableObs } from "./adapterTypes";
import { ageMs } from "./staleness";
import type { LiveMarketReadModel } from "./sourceBoundary";

/** Options OI / walls only — not futures OI trend. */
export const openInterestLiveAdapter: LiveMarketSourceAdapter = {
  sourceId: "storage_oi_options",
  lens: "openInterest",
  capability: {
    sourceId: "storage_oi_options",
    lens: "openInterest",
    availability: "Partial",
    serverSide: true,
    readOnly: true,
    notes: "Options OI concentration/walls from storage. Futures OI/funding UNAVAILABLE.",
  },
  read(model: LiveMarketReadModel) {
    const pos = model.positioning;
    if (!pos || typeof pos.oiConcentration !== "number" || !Number.isFinite(pos.oiConcentration)) {
      return unavailableObs(
        "storage_oi_options",
        "openInterest",
        "Sin oiConcentration en storage; futures OI no implementado",
      );
    }
    const captured = pos.timestampMs ?? model.optionsLastUpdatedMs ?? model.capturedAtMs;
    const a = ageMs(captured, model.capturedAtMs);
    return {
      status: a > 120_000 ? "DEGRADED" : "PARTIAL",
      origin: "OBSERVED",
      sourceId: "storage_oi_options",
      capturedAtMs: captured,
      lens: lensFromParts({
        provider: "openInterest",
        direction: "neutral",
        strength: pos.oiConcentration > 0.5 ? "moderate" : "weak",
        quality: a > 120_000 ? "low" : "medium",
        confidence: 0.45,
        summary: `OI options OBSERVED: concentration=${pos.oiConcentration.toFixed(3)} (no futures OI trend).`.slice(
          0,
          280,
        ),
        tags: {
          oiTrend: "unknown",
          withPrice: "unclear",
        },
        origin: "OBSERVED",
        sourceId: "storage_oi_options",
        capturedAtMs: captured,
        ageMs: a === Number.MAX_SAFE_INTEGER ? 0 : a,
      }),
    };
  },
};

export const footprintUnavailableAdapter: LiveMarketSourceAdapter = {
  sourceId: "footprint_bridge_needed",
  lens: "footprint",
  capability: {
    sourceId: "footprint_bridge_needed",
    lens: "footprint",
    availability: "Unavailable",
    serverSide: false,
    readOnly: true,
    notes: "Footprint es client-only; requiere bridge. No inventar.",
    bridgeNeeded: true,
  },
  read() {
    return unavailableObs(
      "footprint_bridge_needed",
      "footprint",
      "Footprint client-only — bridge needed",
    );
  },
};

export const structureUnavailableAdapter: LiveMarketSourceAdapter = {
  sourceId: "structure_unavailable",
  lens: "marketStructure",
  capability: {
    sourceId: "structure_unavailable",
    lens: "marketStructure",
    availability: "Unavailable",
    serverSide: true,
    readOnly: true,
    notes: "No hay detector HH/HL live en server. Candles existen pero sin engine.",
  },
  read() {
    return unavailableObs(
      "structure_unavailable",
      "marketStructure",
      "Market structure detector no existe (solo contract/stub)",
    );
  },
};
