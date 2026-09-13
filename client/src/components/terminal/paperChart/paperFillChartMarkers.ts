import type { PaperFillSnapshot } from "../execution/executionTypes";

export type PaperFillChartMarker = {
  id: string;
  time: number;
  timestampMs: number;
  price: number;
  side: "buy" | "sell";
  quantity: number;
  fee: number | null;
  liquidity: "MAKER" | "TAKER" | null;
  position: "aboveBar" | "belowBar";
  shape: "arrowDown" | "arrowUp";
  color: string;
  text: string;
};

function markerForFill(fill: PaperFillSnapshot): PaperFillChartMarker | null {
  const timestampMs = Date.parse(fill.timestamp);
  if (!Number.isFinite(timestampMs)) return null;

  const isBuy = fill.side === "buy";
  return {
    id: fill.fillId,
    time: Math.floor(timestampMs / 1_000),
    timestampMs,
    price: fill.price,
    side: fill.side,
    quantity: fill.quantity,
    fee: fill.fee,
    liquidity: fill.liquidity,
    position: isBuy ? "belowBar" : "aboveBar",
    shape: isBuy ? "arrowUp" : "arrowDown",
    color: isBuy ? "#22c55e" : "#ef4444",
    text: `${isBuy ? "BUY" : "SELL"} ${fill.quantity}`,
  };
}

/** Presentation-only projection of canonical PaperState execution events. */
export function mapPaperFillsToChartMarkers(fills: readonly PaperFillSnapshot[]): PaperFillChartMarker[] {
  const seen = new Set<string>();
  const markers: PaperFillChartMarker[] = [];

  for (const fill of fills) {
    if (seen.has(fill.fillId)) continue;
    seen.add(fill.fillId);
    const marker = markerForFill(fill);
    if (marker) markers.push(marker);
  }

  return markers.sort((left, right) => left.timestampMs - right.timestampMs || left.id.localeCompare(right.id));
}
