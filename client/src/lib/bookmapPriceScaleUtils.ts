import { bucketPrice } from "@/components/flows/domLadderUtils";
import type { BookLevel, HeatmapCell } from "@/types/bookmapState";

export const NICE_PRICE_STEPS = [
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000,
] as const;

export const MIN_LABEL_GAP_PX = 22;
export const MAX_LABEL_GAP_PX = 32;
export const TARGET_LABEL_GAP_PX = 26;

export const DEFAULT_LOCAL_RANGE_USD = 1000;

function nearestNiceStep(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 10;
  let best = NICE_PRICE_STEPS[0] as number;
  let bestDist = Math.abs(Math.log(target) - Math.log(best));
  for (const step of NICE_PRICE_STEPS) {
    const dist = Math.abs(Math.log(step) - Math.log(target));
    if (dist < bestDist) {
      bestDist = dist;
      best = step;
    }
  }
  return best;
}

/** Pick a nice $ step so labels sit ~22–32px apart vertically. */
export function chooseNicePriceStep(
  visibleRange: number,
  chartHeight: number,
  targetGapPx = TARGET_LABEL_GAP_PX,
): number {
  if (!Number.isFinite(visibleRange) || visibleRange <= 0 || chartHeight <= 0) {
    return 100;
  }
  const dollarsPerPx = visibleRange / chartHeight;
  const targetStep = dollarsPerPx * targetGapPx;

  for (const step of NICE_PRICE_STEPS) {
    const gapPx = step / dollarsPerPx;
    if (gapPx >= MIN_LABEL_GAP_PX && gapPx <= MAX_LABEL_GAP_PX) {
      return step;
    }
  }

  return nearestNiceStep(targetStep);
}

function pickNiceStepAtMost(maxStep: number): number {
  let chosen = NICE_PRICE_STEPS[0] as number;
  for (const step of NICE_PRICE_STEPS) {
    if (step <= maxStep) chosen = step;
    else break;
  }
  return chosen;
}

export function pickNiceStepAtLeast(minStep: number): number {
  for (const step of NICE_PRICE_STEPS) {
    if (step >= minStep) return step;
  }
  return NICE_PRICE_STEPS[NICE_PRICE_STEPS.length - 1];
}

/** Visual heatmap row height target ~3–8px. */
export function chooseHeatmapBucketSize(
  visibleRange: number,
  chartHeight: number,
): number {
  if (visibleRange <= 0 || chartHeight <= 0) return 50;
  const labelStep = chooseNicePriceStep(visibleRange, chartHeight);
  const dollarsPerPx = visibleRange / chartHeight;
  const minPx = 3;
  const raw = dollarsPerPx * minPx;
  const capped = Math.min(labelStep, pickNiceStepAtLeast(raw));
  return Math.max(1, Math.min(capped, labelStep));
}

/** DOM row height target ~12–20px. */
export function chooseDomBucketSize(
  visibleRange: number,
  chartHeight: number,
): number {
  if (visibleRange <= 0 || chartHeight <= 0) return 50;
  const dollarsPerPx = visibleRange / chartHeight;
  const raw = dollarsPerPx * 16;
  return pickNiceStepAtLeast(raw);
}

export function buildNiceLabelPrices(
  minPrice: number,
  maxPrice: number,
  labelStep: number,
): number[] {
  const step = Math.max(1, labelStep);
  const start = Math.ceil(maxPrice / step) * step;
  const end = Math.floor(minPrice / step) * step;
  const prices: number[] = [];
  for (let p = start; p >= end; p -= step) {
    prices.push(p);
  }
  if (!prices.length) {
    prices.push(bucketPrice((minPrice + maxPrice) / 2, step));
  }
  return prices;
}

export function formatBookmapRangeShort(price: number): string {
  if (!Number.isFinite(price)) return "—";
  if (Math.abs(price) >= 1000) {
    return `${(price / 1000).toFixed(1)}k`;
  }
  return price.toFixed(0);
}

export function aggregateHeatmapCellsByBucket(
  cells: HeatmapCell[],
  bucketSize: number,
  minPrice: number,
  maxPrice: number,
): HeatmapCell[] {
  const step = Math.max(1, bucketSize);
  const map = new Map<
    string,
    {
      timeBucket: number;
      price: number;
      side: "bid" | "ask";
      size: number;
      maxSizeInBucket: number;
      lastSizeInBucket: number;
      lastUpdateTs: number;
    }
  >();

  for (const cell of cells) {
    if (cell.price < minPrice || cell.price > maxPrice) continue;
    if (cell.maxSizeInBucket <= 0) continue;

    const bp = bucketPrice(cell.price, step);
    const key = `${cell.timeBucket}:${cell.side}:${bp}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        timeBucket: cell.timeBucket,
        price: bp,
        side: cell.side,
        size: cell.size,
        maxSizeInBucket: cell.maxSizeInBucket,
        lastSizeInBucket: cell.lastSizeInBucket,
        lastUpdateTs: cell.lastUpdateTs,
      });
    } else {
      prev.maxSizeInBucket = Math.max(prev.maxSizeInBucket, cell.maxSizeInBucket);
      prev.lastSizeInBucket += cell.lastSizeInBucket;
      prev.size += cell.size;
      prev.lastUpdateTs = Math.max(prev.lastUpdateTs, cell.lastUpdateTs);
    }
  }

  return Array.from(map.values());
}

export type AggregatedBookLevel = {
  price: number;
  size: number;
  side: "bid" | "ask";
  maxSeenSize: number;
  isImportant: boolean;
  isStructural: boolean;
  isMajor: boolean;
  stale: boolean;
};

export function aggregateBookLevelsByBucket(
  levels: BookLevel[],
  bucketSize: number,
): AggregatedBookLevel[] {
  const step = Math.max(1, bucketSize);
  const map = new Map<string, AggregatedBookLevel>();

  for (const level of levels) {
    const bp = bucketPrice(level.price, step);
    const key = `${level.side}:${bp}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        price: bp,
        size: level.size,
        side: level.side,
        maxSeenSize: level.maxSeenSize,
        isImportant: level.isImportant,
        isStructural: level.isStructural,
        isMajor: level.isMajor,
        stale: level.stale,
      });
    } else {
      prev.size += level.size;
      prev.maxSeenSize = Math.max(prev.maxSeenSize, level.maxSeenSize);
      prev.isImportant = prev.isImportant || level.isImportant;
      prev.isStructural = prev.isStructural || level.isStructural;
      prev.isMajor = prev.isMajor || level.isMajor;
      prev.stale = prev.stale && level.stale;
    }
  }

  return Array.from(map.values());
}

