import type { LiveMarketSourceAdapter } from "./adapterTypes";
import { lensFromParts, unavailableObs } from "./adapterTypes";
import { ageMs } from "./staleness";
import type { LiveMarketReadModel } from "./sourceBoundary";
import type { SignalDirection } from "@shared/goodTradingAiMarket";

export const orderFlowLiveAdapter: LiveMarketSourceAdapter = {
  sourceId: "storage_order_flow",
  lens: "orderFlow",
  capability: {
    sourceId: "storage_order_flow",
    lens: "orderFlow",
    availability: "Partial",
    serverSide: true,
    readOnly: true,
    notes:
      "Absorption solo si ya está en positioning (terminal inject). CVD/footprint client-only → no inventar.",
    bridgeNeeded: true,
  },
  read(model: LiveMarketReadModel) {
    const abs = model.positioning?.absorption;
    if (!abs || typeof abs.status !== "string") {
      return unavailableObs(
        "storage_order_flow",
        "orderFlow",
        "Absorption no presente en storage (requiere terminal inject o bridge; CVD client-only)",
      );
    }
    const captured = model.positioning?.timestampMs ?? model.capturedAtMs;
    const a = ageMs(captured, model.capturedAtMs);
    const side = (abs.side || "").toUpperCase();
    let direction: SignalDirection = "unknown";
    let absorptionTag: string = "unknown";
    if (side.includes("BUY")) {
      direction = "bullish";
      absorptionTag = "buy_side";
    } else if (side.includes("SELL")) {
      direction = "bearish";
      absorptionTag = "sell_side";
    } else if (abs.status === "INACTIVE") {
      direction = "neutral";
      absorptionTag = "none";
    }

    const conf =
      typeof abs.confidence === "number" && Number.isFinite(abs.confidence)
        ? Math.min(1, Math.max(0, abs.confidence > 1 ? abs.confidence / 100 : abs.confidence))
        : 0.4;

    const summaryBits = Array.isArray(abs.summary) ? abs.summary.slice(0, 2).join("; ") : "";
    return {
      status: a > 60_000 ? "DEGRADED" : "PARTIAL",
      origin: "OBSERVED",
      sourceId: "storage_order_flow",
      capturedAtMs: captured,
      lens: lensFromParts({
        provider: "orderFlow",
        direction,
        strength: conf >= 0.7 ? "strong" : conf >= 0.4 ? "moderate" : "weak",
        quality: a > 60_000 ? "low" : "medium",
        confidence: conf,
        summary: `OrderFlow OBSERVED (absorption): ${abs.status}/${abs.side ?? "?"} ${summaryBits}`.slice(
          0,
          280,
        ),
        tags: {
          absorption: absorptionTag,
          aggression: "unknown",
          acceptance: abs.status === "CONFIRMED" ? "accepted" : "pending",
        },
        origin: "OBSERVED",
        sourceId: "storage_order_flow",
        capturedAtMs: captured,
        ageMs: a === Number.MAX_SAFE_INTEGER ? 0 : a,
      }),
    };
  },
};
