import { HEATMAP_MAJOR_WALL_BTC as MAJOR_WALL_BTC_EXPORT } from "@/lib/heatmapWallConfig";
import { aggregateSideToBookLevels } from "./domLadderUtils";
import type { OrderbookLevel } from "./liquidityHeatmapUtils";

/** Bookmap “institutional” wall threshold (BTC). Same as `HEATMAP_MAJOR_WALL_BTC`. */
export const MAJOR_WALL_BTC = MAJOR_WALL_BTC_EXPORT;
export const TOP_LIQUIDITY_LEVELS_PER_SIDE = 10;
export const FAR_WALL_MIN_BTC = 50;

/** % away from spot treated as “near band” vs far (for FAR_WALL kind). */
export const IMPORTANT_NEAR_SPOT_PCT = 0.025;

export type ImportantLiquidityKind = "MAJOR_WALL" | "TOP_LIQUIDITY" | "FAR_WALL";

export type ImportantLiquidityLevel = {
  price: number;
  sizeBtc: number;
  side: "bid" | "ask";
  distanceFromSpotPct: number;
  kind: ImportantLiquidityKind;
};

function distanceFromSpotPct(price: number, spot: number): number {
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  return Math.abs(price - spot) / spot;
}

function processSide(
  levels: OrderbookLevel[],
  side: "bid" | "ask",
  spotMid: number,
  majorThr: number,
  topN: number,
  out: ImportantLiquidityLevel[],
  keySeen: Set<string>,
): void {
  const byPrice = new Map<number, number>();
  for (const l of levels) {
    if (!Number.isFinite(l.price) || l.price <= 0) continue;
    byPrice.set(l.price, Math.max(byPrice.get(l.price) ?? 0, l.sizeBtc));
  }

  const sorted = Array.from(byPrice.entries()).sort((a, b) => b[1] - a[1]);

  const push = (price: number, sizeBtc: number, kind: ImportantLiquidityKind) => {
    const key = `${side}_${price}`;
    if (keySeen.has(key)) return;
    keySeen.add(key);
    out.push({
      price,
      sizeBtc,
      side,
      distanceFromSpotPct: distanceFromSpotPct(price, spotMid),
      kind,
    });
  };

  for (let i = 0; i < sorted.length; i++) {
    const [price, size] = sorted[i];
    if (size <= 0) continue;
    if (i < topN) {
      const kind: ImportantLiquidityKind =
        size >= majorThr ? "MAJOR_WALL" : "TOP_LIQUIDITY";
      push(price, size, kind);
      continue;
    }
    if (size >= majorThr) {
      push(price, size, "MAJOR_WALL");
      continue;
    }
    const d = distanceFromSpotPct(price, spotMid);
    if (size >= FAR_WALL_MIN_BTC && d > IMPORTANT_NEAR_SPOT_PCT) {
      push(price, size, "FAR_WALL");
    }
  }
}

/**
 * Full-book pipeline: aggregate entire normalized book by `priceStep`, then detect
 * major / top-N / far liquidity. Does **not** use viewport `priceRange`.
 */
export function detectImportantLiquidityLevels({
  bids,
  asks,
  spot,
  priceStep,
  majorWallThresholdBtc = MAJOR_WALL_BTC,
  topNPerSide = TOP_LIQUIDITY_LEVELS_PER_SIDE,
}: {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spot: number | null;
  priceStep: number;
  majorWallThresholdBtc?: number;
  topNPerSide?: number;
}): ImportantLiquidityLevel[] {
  const spotMid = spot != null && spot > 0 ? spot : 70_000;
  const step = Math.max(1, priceStep);

  const aggBids = aggregateSideToBookLevels(bids, step, "bid");
  const aggAsks = aggregateSideToBookLevels(asks, step, "ask");

  const out: ImportantLiquidityLevel[] = [];
  const keySeen = new Set<string>();

  processSide(aggBids, "bid", spotMid, majorWallThresholdBtc, topNPerSide, out, keySeen);
  processSide(aggAsks, "ask", spotMid, majorWallThresholdBtc, topNPerSide, out, keySeen);

  return out;
}

/** Bid / ask prices used to widen auto-fit (major + top liquidity only). */
export function getAutoFitExpansionPrices(levels: ImportantLiquidityLevel[]): {
  bidPrices: number[];
  askPrices: number[];
} {
  const bidPrices: number[] = [];
  const askPrices: number[] = [];
  for (const l of levels) {
    if (l.kind !== "MAJOR_WALL" && l.kind !== "TOP_LIQUIDITY") continue;
    if (l.side === "bid") bidPrices.push(l.price);
    else askPrices.push(l.price);
  }
  return { bidPrices, askPrices };
}

/** Levels that sit outside `[minPrice, maxPrice]` (for edge markers / DOM strips). */
export function getOffRangeImportantLevels(
  levels: ImportantLiquidityLevel[],
  minPrice: number,
  maxPrice: number,
): { above: ImportantLiquidityLevel[]; below: ImportantLiquidityLevel[] } {
  const above: ImportantLiquidityLevel[] = [];
  const below: ImportantLiquidityLevel[] = [];

  for (const l of levels) {
    if (l.price > maxPrice && l.side === "ask") {
      above.push(l);
    } else if (l.price < minPrice && l.side === "bid") {
      below.push(l);
    }
  }

  above.sort((a, b) => a.price - b.price);
  below.sort((a, b) => b.price - a.price);

  return { above, below };
}
